import { Router, Request, Response } from 'express';
import Container from 'typedi';
import mongoose from 'mongoose';
import User from '../../models/User';
import { CoinService } from '../../services/app/CoinService';
import { PaymentMethodService } from '../../services/app/PaymentMethodService';
import { ResponseWrapper } from '../responseWrapper';

export default (router: Router) => {
  const coinService = Container.get(CoinService);
  const paymentMethodService = Container.get(PaymentMethodService);

  /**
   * GET /v1/api/web/packages
   * Public coin packages for users (sorted by coins)
   */
  router.get('/packages', async (req: Request, res: Response) => {
    try {
      const countryId = req.query.countryId?.toString();
      const result = await coinService.getPackages(countryId, 'user');
      return ResponseWrapper.success(res, result, 'Packages fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * GET /v1/api/web/user/lookup
   * Lookup user by numeric userId (e.g. 100238475), MongoDB _id, or username
   */
  router.get('/user/lookup', async (req: Request, res: Response) => {
    try {
      const raw = (req.query.userId || req.query.id || req.query.search || '')?.toString().trim();
      if (!raw) {
        return ResponseWrapper.error(res, new Error('User ID is required'), 400);
      }

      let query: any = {};
      if (/^\d+$/.test(raw)) {
        query = { userId: Number(raw) };
      } else if (mongoose.Types.ObjectId.isValid(raw)) {
        query = { _id: raw };
      } else {
        query = {
          $or: [
            { name: { $regex: `^${raw}$`, $options: 'i' } },
            { email: raw },
            { mobile: raw },
          ],
        };
      }

      const user = await User.findOne(query)
        .populate('profileImage', 'url mimetype')
        .select('userId name email mobile profileImage coins country isVerified isBlocked');

      if (!user) {
        return ResponseWrapper.error(res, new Error('User not found with this Filive ID'), 404);
      }

      if (user.isBlocked) {
        return ResponseWrapper.error(res, new Error('This account is suspended'), 403);
      }

      const avatarUrl = (user.profileImage as any)?.url || null;

      return ResponseWrapper.success(
        res,
        {
          id: user._id,
          userId: user.userId,
          name: user.name || 'Filive User',
          avatar: avatarUrl,
          country: user.country || 'Global',
          coins: user.coins || 0,
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
      const result = await paymentMethodService.getAvailablePaymentMethods(countryCode, 'user');
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

      // Resolve user by numeric userId or _id
      let resolvedUserId = userId;
      if (/^\d+$/.test(String(userId).trim())) {
        const user = await User.findOne({ userId: Number(userId) }).select('_id');
        if (!user) return ResponseWrapper.error(res, new Error('User not found'), 404);
        resolvedUserId = user._id.toString();
      } else if (!mongoose.Types.ObjectId.isValid(userId)) {
        const user = await User.findOne({
          $or: [{ name: userId }, { email: userId }, { mobile: userId }],
        }).select('_id');
        if (!user) return ResponseWrapper.error(res, new Error('User not found'), 404);
        resolvedUserId = user._id.toString();
      }

      const result = await coinService.createRazorpayOrder(resolvedUserId, packageId, 'user');
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

      let resolvedUserId = userId;
      if (/^\d+$/.test(String(userId).trim())) {
        const user = await User.findOne({ userId: Number(userId) }).select('_id');
        if (!user) return ResponseWrapper.error(res, new Error('User not found'), 404);
        resolvedUserId = user._id.toString();
      }

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
      let resolvedUserId = userId;
      if (/^\d+$/.test(String(userId).trim())) {
        const user = await User.findOne({ userId: Number(userId) }).select('_id');
        if (!user) return ResponseWrapper.error(res, new Error('User not found'), 404);
        resolvedUserId = user._id.toString();
      }
      const result = await coinService.createCashfreeOrder(resolvedUserId, packageId, 'user');
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
      let resolvedUserId = userId;
      if (/^\d+$/.test(String(userId).trim())) {
        const user = await User.findOne({ userId: Number(userId) }).select('_id');
        if (!user) return ResponseWrapper.error(res, new Error('User not found'), 404);
        resolvedUserId = user._id.toString();
      }
      const result = await coinService.verifyCashfreePayment(resolvedUserId, orderId, packageId, 'user');
      return ResponseWrapper.success(res, result, result.message || 'Payment verified successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
