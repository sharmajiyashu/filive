import { Router, Response } from 'express';
import Container from 'typedi';
import { AppSettingService } from '../../../services/common/AppSettingService';
import { EmailService } from '../../../services/common/emailService';
import CoinPackage from '../../../models/CoinPackage';
import ContactMessage from '../../../models/ContactMessage';
import TeamApplication from '../../../models/TeamApplication';
import User from '../../../models/User';
import { ResponseWrapper } from '../../responseWrapper';
import { adminAuthMiddleware } from '../../middleware/adminAuthMiddleware';

export default (router: Router) => {
  const websiteRouter = Router();
  const appSettingService = Container.get(AppSettingService);
  const emailService = Container.get(EmailService);

  router.use('/website-settings', adminAuthMiddleware, websiteRouter);

  /**
   * Helper: check if authenticated admin has website permission
   */
  async function resolveAdminEmailAndPermission(userId: string) {
    const user = await User.findById(userId).select('email userRole name');
    const userEmail = (user?.email || '').trim().toLowerCase();

    // STRICT: Website management is ONLY permitted for filive@gmail.com
    const hasPermission = userEmail === 'filive@gmail.com';

    return { user, userEmail, allowedEmails: ['filive@gmail.com'], hasPermission };
  }

  /**
   * GET /v1/api/admin/website-settings
   * Fetch current website settings, permission list, and quick stats
   */
  websiteRouter.get('/', async (req: any, res: Response) => {
    try {
      const { userEmail, allowedEmails, hasPermission } =
        await resolveAdminEmailAndPermission(req.user?.id);

      if (!hasPermission) {
        return ResponseWrapper.error(
          res,
          new Error('Access denied. Website management is strictly reserved for filive@gmail.com'),
          403
        );
      }

      const settings = await appSettingService.getSettings();

      const [
        websitePackagesCount,
        activeWebsitePackagesCount,
        totalContactMessages,
        pendingContactMessages,
        totalTeamApplications,
        pendingTeamApplications,
      ] = await Promise.all([
        CoinPackage.countDocuments({ targetAudience: 'website' }),
        CoinPackage.countDocuments({ targetAudience: 'website', isActive: true }),
        ContactMessage.countDocuments(),
        ContactMessage.countDocuments({ status: 'pending' }),
        TeamApplication.countDocuments(),
        TeamApplication.countDocuments({ status: 'pending' }),
      ]);

      const enquiryEmail = settings.website_enquiry_email || 'filive@gmail.com';
      const rechargeEnabled = settings.website_recharge_enabled !== false;
      const notificationsEnabled = settings.website_contact_notifications_enabled !== false;

      return ResponseWrapper.success(
        res,
        {
          settings: {
            website_enquiry_email: enquiryEmail,
            website_permission_emails: allowedEmails,
            website_recharge_enabled: rechargeEnabled,
            website_contact_notifications_enabled: notificationsEnabled,
          },
          currentUser: {
            email: userEmail,
            hasPermission,
            isPrimaryWebAdmin: userEmail === 'filive@gmail.com',
          },
          stats: {
            websitePackagesCount,
            activeWebsitePackagesCount,
            totalContactMessages,
            pendingContactMessages,
            totalTeamApplications,
            pendingTeamApplications,
          },
        },
        'Website settings fetched successfully'
      );
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * PUT /v1/api/admin/website-settings
   * Update enquiry email and website toggles
   */
  websiteRouter.put('/', async (req: any, res: Response) => {
    try {
      const { userEmail, allowedEmails, hasPermission } =
        await resolveAdminEmailAndPermission(req.user?.id);

      if (!hasPermission) {
        return ResponseWrapper.error(
          res,
          new Error('Access denied. Website management is strictly reserved for filive@gmail.com'),
          403
        );
      }

      const {
        website_enquiry_email,
        website_recharge_enabled,
        website_contact_notifications_enabled,
        website_permission_emails,
      } = req.body;

      if (website_enquiry_email !== undefined) {
        const cleanEmail = String(website_enquiry_email).trim().toLowerCase();
        if (!cleanEmail || !cleanEmail.includes('@')) {
          return ResponseWrapper.error(res, new Error('Valid enquiry email address is required'), 400);
        }
        await appSettingService.updateSetting('website_enquiry_email', cleanEmail);
      }

      if (website_recharge_enabled !== undefined) {
        await appSettingService.updateSetting(
          'website_recharge_enabled',
          Boolean(website_recharge_enabled)
        );
      }

      if (website_contact_notifications_enabled !== undefined) {
        await appSettingService.updateSetting(
          'website_contact_notifications_enabled',
          Boolean(website_contact_notifications_enabled)
        );
      }

      if (Array.isArray(website_permission_emails)) {
        const cleaned = Array.from(
          new Set(
            website_permission_emails
              .map((e: any) => String(e).trim().toLowerCase())
              .filter((e: string) => e.length > 0 && e.includes('@'))
          )
        );
        if (!cleaned.includes('filive@gmail.com')) {
          cleaned.unshift('filive@gmail.com');
        }
        await appSettingService.updateSetting('website_permission_emails', cleaned);
      }

      const updated = await appSettingService.getSettings();

      return ResponseWrapper.success(
        res,
        {
          website_enquiry_email: updated.website_enquiry_email || 'filive@gmail.com',
          website_permission_emails: updated.website_permission_emails || ['filive@gmail.com'],
          website_recharge_enabled: updated.website_recharge_enabled !== false,
          website_contact_notifications_enabled:
            updated.website_contact_notifications_enabled !== false,
        },
        'Website settings updated successfully'
      );
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * POST /v1/api/admin/website-settings/permissions/add
   * Add a user email to website management permissions
   */
  websiteRouter.post('/permissions/add', async (req: any, res: Response) => {
    try {
      const { hasPermission } = await resolveAdminEmailAndPermission(req.user?.id);
      if (!hasPermission) {
        return ResponseWrapper.error(
          res,
          new Error('Access denied. Website management is strictly reserved for filive@gmail.com'),
          403
        );
      }

      const emailToAdd = String(req.body.email || '').trim().toLowerCase();
      if (!emailToAdd || !emailToAdd.includes('@')) {
        return ResponseWrapper.error(res, new Error('Please enter a valid email address'), 400);
      }

      const settings = await appSettingService.getSettings();
      const currentList: string[] = Array.isArray(settings.website_permission_emails)
        ? [...settings.website_permission_emails]
        : ['filive@gmail.com'];

      if (!currentList.includes('filive@gmail.com')) {
        currentList.push('filive@gmail.com');
      }

      if (!currentList.includes(emailToAdd)) {
        currentList.push(emailToAdd);
        await appSettingService.updateSetting('website_permission_emails', currentList);
      }

      return ResponseWrapper.success(
        res,
        { website_permission_emails: currentList },
        `Website permission granted to ${emailToAdd}`
      );
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * POST /v1/api/admin/website-settings/permissions/remove
   * Remove a user email from website management permissions
   */
  websiteRouter.post('/permissions/remove', async (req: any, res: Response) => {
    try {
      const { hasPermission } = await resolveAdminEmailAndPermission(req.user?.id);
      if (!hasPermission) {
        return ResponseWrapper.error(
          res,
          new Error('Access denied. Website management is strictly reserved for filive@gmail.com'),
          403
        );
      }

      const emailToRemove = String(req.body.email || '').trim().toLowerCase();
      if (!emailToRemove) {
        return ResponseWrapper.error(res, new Error('Email is required'), 400);
      }

      if (emailToRemove === 'filive@gmail.com') {
        return ResponseWrapper.error(
          res,
          new Error('filive@gmail.com is the primary website administrator and cannot be removed'),
          400
        );
      }

      const settings = await appSettingService.getSettings();
      const currentList: string[] = Array.isArray(settings.website_permission_emails)
        ? settings.website_permission_emails.map((e: string) => e.trim().toLowerCase())
        : ['filive@gmail.com'];

      const updated = currentList.filter((e) => e !== emailToRemove);
      if (!updated.includes('filive@gmail.com')) {
        updated.unshift('filive@gmail.com');
      }

      await appSettingService.updateSetting('website_permission_emails', updated);

      return ResponseWrapper.success(
        res,
        { website_permission_emails: updated },
        `Website permission revoked for ${emailToRemove}`
      );
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * POST /v1/api/admin/website-settings/test-email
   * Send a test inquiry notification email to filive@gmail.com
   */
  websiteRouter.post('/test-email', async (req: any, res: Response) => {
    try {
      const { hasPermission } = await resolveAdminEmailAndPermission(req.user?.id);
      if (!hasPermission) {
        return ResponseWrapper.error(
          res,
          new Error('Access denied. Website management is strictly reserved for filive@gmail.com'),
          403
        );
      }

      const settings = await appSettingService.getSettings();
      const targetEmail = settings.website_enquiry_email || 'filive@gmail.com';

      await emailService.sendWebEnquiryEmail({
        to: targetEmail,
        type: 'contact',
        name: 'FiLive Verification Test',
        email: 'test@filive.app',
        subject: 'Test Notification Verification',
        message:
          'This is a test notification confirming that website enquiries are properly routed to this inbox in real-time.',
      });

      return ResponseWrapper.success(
        res,
        { targetEmail },
        `Test notification successfully dispatched to ${targetEmail}`
      );
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
