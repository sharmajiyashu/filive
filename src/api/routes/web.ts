import { Router, Request, Response } from 'express';
import Container from 'typedi';
import mongoose from 'mongoose';
import User from '../../models/User';
import Media from '../../models/Media';
import Country from '../../models/Country';
import TeamApplication from '../../models/TeamApplication';
import ContactMessage from '../../models/ContactMessage';
import { CoinService } from '../../services/app/CoinService';
import { PaymentMethodService } from '../../services/app/PaymentMethodService';
import { EmailService } from '../../services/common/emailService';
import { AppSettingService } from '../../services/common/AppSettingService';
import { ResponseWrapper } from '../responseWrapper';

/**
 * Smart resolver for User ID input:
 * Supports:
 * - "10000028"
 * - "@user_10000028"
 * - "user_10000028"
 * - "#10000028"
 * - "@10000028"
 * - MongoDB ObjectId
 * - Username / email / mobile
 */
function buildUserLookupFilter(rawInput: string) {
  const raw = String(rawInput || '').trim();
  if (!raw) return null;

  const clean = raw.replace(/^[@#]/, '').trim();

  // Look for any 5+ digit number sequence or user_ prefix number
  const matchNum = clean.match(/^(?:user[_-]?)?(\d+)$/i) || clean.match(/(\d{4,})/);
  const numericId = matchNum ? Number(matchNum[1]) : (/^\d+$/.test(raw) ? Number(raw) : null);

  const orList: any[] = [];

  if (numericId && !isNaN(numericId)) {
    orList.push({ userId: numericId });
  }

  if (mongoose.Types.ObjectId.isValid(raw)) {
    orList.push({ _id: new mongoose.Types.ObjectId(raw) });
  }

  const escapedRaw = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedClean = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  orList.push(
    { name: { $regex: `^${escapedRaw}$`, $options: 'i' } },
    { name: { $regex: `^${escapedClean}$`, $options: 'i' } },
    { email: raw },
    { mobile: raw },
    { referralCode: { $regex: `^${escapedClean}$`, $options: 'i' } }
  );

  return { $or: orList };
}

async function findUserByFlexibleInput(rawInput: string) {
  const filter = buildUserLookupFilter(rawInput);
  if (!filter) return null;
  return await User.findOne(filter);
}

export default (router: Router) => {
  const coinService = Container.get(CoinService);
  const paymentMethodService = Container.get(PaymentMethodService);

  /**
   * GET /v1/api/web/countries
   * Returns active countries with flags and currency details for auto/manual selection
   */
  router.get('/countries', async (req: Request, res: Response) => {
    try {
      const countries = await Country.find({ isActive: true })
        .select('name code flag currencySymbol currencyCode exchangeRate phoneCode')
        .lean();

      const priority = ['IN', 'US', 'AE', 'GB', 'SA', 'CA', 'AU', 'SG', 'DE', 'FR'];
      const sorted = countries.sort((a: any, b: any) => {
        const idxA = priority.indexOf((a.code || '').toUpperCase());
        const idxB = priority.indexOf((b.code || '').toUpperCase());
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return (a.name || '').localeCompare(b.name || '');
      });

      return ResponseWrapper.success(res, sorted, 'Active countries fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * GET /v1/api/web/packages
   * Public coin packages for users with local currency conversion (sorted by coins)
   */
  router.get('/packages', async (req: Request, res: Response) => {
    try {
      const country = (req.query.countryCode || req.query.countryId || req.query.country || '')?.toString();
      const result = await coinService.getPackages(country, 'website');
      return ResponseWrapper.success(res, result, 'Packages fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * GET /v1/api/web/user/lookup
   * Lookup user by numeric userId (e.g. 10000028, @user_10000028), MongoDB _id, or username
   */
  router.get('/user/lookup', async (req: Request, res: Response) => {
    try {
      const raw = (req.query.userId || req.query.id || req.query.search || '')?.toString().trim();
      if (!raw) {
        return ResponseWrapper.error(res, new Error('User ID is required'), 400);
      }

      const query = buildUserLookupFilter(raw);
      if (!query) {
        return ResponseWrapper.error(res, new Error('Invalid User ID format'), 400);
      }

      const user: any = await User.findOne(query)
        .select('userId name email mobile profileImage profileImageUrl country isVerified isBlocked')
        .lean();

      if (!user) {
        return ResponseWrapper.error(res, new Error('User not found with this Filive ID'), 404);
      }

      if (user.isBlocked) {
        return ResponseWrapper.error(res, new Error('This account is suspended'), 403);
      }

      // Resolve avatar cleanly (supports populated Media, embedded URL, or profileImageUrl)
      let avatarUrl: string | null = null;
      if (user.profileImage) {
        if (typeof user.profileImage === 'object' && user.profileImage.url) {
          avatarUrl = user.profileImage.url;
        } else if (typeof user.profileImage === 'string' && user.profileImage.startsWith('http')) {
          avatarUrl = user.profileImage;
        } else if (mongoose.Types.ObjectId.isValid(String(user.profileImage))) {
          const media = await Media.findById(user.profileImage).lean();
          avatarUrl = media?.url || null;
        }
      }

      if (!avatarUrl && user.profileImageUrl?.url) {
        avatarUrl = user.profileImageUrl.url;
      }

      // Display name formatting
      let displayName = user.name || '';
      if (!displayName || /^\d{7,}$/.test(displayName)) {
        displayName = `User ${user.userId || ''}`.trim() || 'FiLive User';
      }

      return ResponseWrapper.success(
        res,
        {
          id: user._id,
          userId: user.userId,
          name: displayName,
          avatar: avatarUrl,
          country: user.country || 'Global',
          isVerified: user.isVerified || false,
        },
        'User found successfully'
      );
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * GET /v1/api/web/payment-methods
   * Active payment gateways for web
   */
  router.get('/payment-methods', async (req: Request, res: Response) => {
    try {
      const countryCode = req.query.countryCode?.toString() || 'IN';
      const result = await paymentMethodService.getAvailablePaymentMethods(countryCode, 'website', 'web');
      return ResponseWrapper.success(res, result, 'Payment methods fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * POST /v1/api/web/razorpay/create-order
   * Create Razorpay order for specified user
   */
  router.post('/razorpay/create-order', async (req: Request, res: Response) => {
    try {
      const { userId, packageId } = req.body;
      if (!userId) return ResponseWrapper.error(res, new Error('userId is required'), 400);
      if (!packageId) return ResponseWrapper.error(res, new Error('packageId is required'), 400);

      const user = await findUserByFlexibleInput(String(userId));
      if (!user) return ResponseWrapper.error(res, new Error('User not found with this ID'), 404);

      const resolvedUserId = user._id.toString();
      const result = await coinService.createRazorpayOrder(resolvedUserId, packageId, 'user', 'web');
      return ResponseWrapper.success(res, result, 'Razorpay order created successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * POST /v1/api/web/razorpay/verify-payment
   * Verify signature and credit coins
   */
  router.post('/razorpay/verify-payment', async (req: Request, res: Response) => {
    try {
      const { userId, packageId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
      if (!userId || !packageId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
        return ResponseWrapper.error(
          res,
          new Error('userId, packageId, razorpayOrderId, razorpayPaymentId, and razorpaySignature are required'),
          400
        );
      }

      const user = await findUserByFlexibleInput(String(userId));
      if (!user) return ResponseWrapper.error(res, new Error('User not found with this ID'), 404);

      const resolvedUserId = user._id.toString();
      const result = await coinService.verifyRazorpayPayment(
        resolvedUserId,
        packageId,
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
        'user'
      );
      return ResponseWrapper.success(res, result, 'Payment verified and coins added successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * POST /v1/api/web/cashfree/create-order
   */
  router.post('/cashfree/create-order', async (req: Request, res: Response) => {
    try {
      const { userId, packageId } = req.body;
      if (!userId || !packageId) {
        return ResponseWrapper.error(res, new Error('userId and packageId are required'), 400);
      }

      const user = await findUserByFlexibleInput(String(userId));
      if (!user) return ResponseWrapper.error(res, new Error('User not found with this ID'), 404);

      const resolvedUserId = user._id.toString();
      const result = await coinService.createCashfreeOrder(resolvedUserId, packageId, 'user', 'web');
      return ResponseWrapper.success(res, result, 'Cashfree order created successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * POST /v1/api/web/cashfree/verify-payment
   */
  router.post('/cashfree/verify-payment', async (req: Request, res: Response) => {
    try {
      const { userId, orderId, packageId } = req.body;
      if (!userId || !orderId) {
        return ResponseWrapper.error(res, new Error('userId and orderId are required'), 400);
      }

      const user = await findUserByFlexibleInput(String(userId));
      if (!user) return ResponseWrapper.error(res, new Error('User not found with this ID'), 404);

      const resolvedUserId = user._id.toString();
      const result = await coinService.verifyCashfreePayment(resolvedUserId, orderId, packageId, 'user');
      return ResponseWrapper.success(res, result, result.message || 'Payment verified successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * POST /v1/api/web/team-application
   * Apply to join the team / business inquiry from website
   */
  router.post('/team-application', async (req: Request, res: Response) => {
    try {
      const { name, email, inquiry_type, inquiryType, audience_size, audienceSize, message } = req.body;
      if (!name || !email || !message) {
        return ResponseWrapper.error(res, new Error('Full name, email, and message are required'), 400);
      }

      const type = (inquiry_type || inquiryType || 'host').toString().toLowerCase();
      const validTypes = ['host', 'agency', 'partner'];
      const resolvedType = validTypes.includes(type) ? type : 'host';

      const application = await TeamApplication.create({
        name: String(name).trim(),
        email: String(email).trim().toLowerCase(),
        inquiryType: resolvedType,
        audienceSize: String(audience_size || audienceSize || '').trim(),
        message: String(message).trim(),
        status: 'pending',
      });

      // Dispatch lead notification email to filive@gmail.com
      try {
        const appSettingService = Container.get(AppSettingService);
        const emailService = Container.get(EmailService);
        const settings = await appSettingService.getSettings();
        if (settings.website_contact_notifications_enabled !== false) {
          const destinationEmail = settings.website_enquiry_email || 'filive@gmail.com';
          await emailService.sendWebEnquiryEmail({
            to: destinationEmail,
            type: 'team_application',
            name: application.name,
            email: application.email,
            inquiryType: application.inquiryType,
            audienceSize: application.audienceSize,
            message: application.message,
          });
        }
      } catch (mailErr) {
        console.error('Failed to dispatch team application notification email:', mailErr);
      }

      return ResponseWrapper.success(
        res,
        application,
        'Your application has been received successfully! Our team will reach out soon.'
      );
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * POST /v1/api/web/contact
   * Submit Contact Us inquiry from website
   */
  router.post('/contact', async (req: Request, res: Response) => {
    try {
      const { name, email, subject, message } = req.body;
      if (!name || !email || !message) {
        return ResponseWrapper.error(res, new Error('Name, email, and message are required'), 400);
      }

      const contact = await ContactMessage.create({
        name: String(name).trim(),
        email: String(email).trim().toLowerCase(),
        subject: String(subject || '').trim(),
        message: String(message).trim(),
        status: 'pending',
      });

      // Dispatch lead notification email to filive@gmail.com
      try {
        const appSettingService = Container.get(AppSettingService);
        const emailService = Container.get(EmailService);
        const settings = await appSettingService.getSettings();
        if (settings.website_contact_notifications_enabled !== false) {
          const destinationEmail = settings.website_enquiry_email || 'filive@gmail.com';
          await emailService.sendWebEnquiryEmail({
            to: destinationEmail,
            type: 'contact',
            name: contact.name,
            email: contact.email,
            subject: contact.subject,
            message: contact.message,
          });
        }
      } catch (mailErr) {
        console.error('Failed to dispatch contact message notification email:', mailErr);
      }

      return ResponseWrapper.success(
        res,
        contact,
        'Thank you! Your message has been sent successfully. Our team will get back to you shortly.'
      );
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
