import { Router, Request, Response } from 'express';
import Container from 'typedi';
import { CoinService } from '../../../services/app/CoinService';
import User from '../../../models/User';
import { ResponseWrapper } from '../../responseWrapper';
import { appAuthMiddleware } from '../../middleware/appAuthMiddleware';

export default (router: Router) => {
  const coinService = Container.get(CoinService);
  const coinRouter = Router();

  router.use('/coins', coinRouter);

  /**
   * @swagger
   * /app/coins/packages:
   *   get:
   *     summary: Get coin packages with local pricing
   *     tags: [Coins]
   *     parameters:
   *       - in: query
   *         name: countryId
   *         schema:
   *           type: string
   *         description: Optional country ID for local pricing
   *     responses:
   *       200:
   *         description: List of packages with local pricing
   */
  coinRouter.get('/packages', async (req: any, res: Response) => {
    try {
      let countryId = req.query.countryId;

      // If no countryId in query but user is logged in, try user's country
      if (!countryId && req.user) {
        const user = await User.findById(req.user.id);
        if (user?.countryId) {
          countryId = user.countryId.toString();
        }
      }

      const result = await coinService.getPackages(countryId);
      return ResponseWrapper.success(res, result, 'Packages fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/coins/wallet:
   *   get:
   *     summary: Get user coin wallet
   *     tags: [Coins]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Wallet details
   */
  coinRouter.get('/wallet', async (req: any, res: Response) => {
    try {
      const result = await coinService.getWallet(req.user.id);
      return ResponseWrapper.success(res, result, 'Wallet fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/coins/history:
   *   get:
   *     summary: Get coin transaction history
   *     tags: [Coins]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *           default: 1
   *         description: Page number
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 20
   *         description: Number of items per page
   *     responses:
   *       200:
   *         description: History details
   */
  coinRouter.get('/history', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const result = await coinService.getHistory(req.user.id, page, limit);
      return ResponseWrapper.success(res, result, 'History fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/coins/beans-wallet:
   *   get:
   *     summary: Get user beans wallet details (Total Beans, Withdrawal Beans, Beans to be confirmed)
   *     tags: [Coins]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Beans Wallet details
   */
  coinRouter.get('/beans-wallet', appAuthMiddleware, async (req: any, res: Response) => {
    try {
      const result = await coinService.getBeansWallet(req.user.id);
      return ResponseWrapper.success(res, result, 'Beans wallet fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/coins/beans-history:
   *   get:
   *     summary: Get beans transaction history
   *     tags: [Coins]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *           default: 1
   *         description: Page number
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 20
   *         description: Number of items per page
   *     responses:
   *       200:
   *         description: Beans history details
   */
  coinRouter.get('/beans-history', appAuthMiddleware, async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const result = await coinService.getBeansHistory(req.user.id, page, limit);
      return ResponseWrapper.success(res, result, 'Beans history fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/coins/recharge:
   *   post:
   *     summary: Recharge coins (simulated)
   *     tags: [Coins]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               packageId:
   *                 type: string
   *               transactionId:
   *                 type: string
   *     responses:
   *       200:
   *         description: Recharge successful
   */
  coinRouter.post('/recharge', async (req: any, res: Response) => {
    try {
      const { packageId, transactionId } = req.body;
      const result = await coinService.recharge(req.user.id, packageId, transactionId);
      return ResponseWrapper.success(res, result, 'Recharge successful');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/coins/razorpay/create-order:
   *   post:
   *     summary: Create Razorpay Order for Coin Recharge
   *     tags: [Coins]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - packageId
   *             properties:
   *               packageId:
   *                 type: string
   *                 description: Coin package ID
   *     responses:
   *       200:
   *         description: Razorpay order created successfully
   */
  coinRouter.post('/razorpay/create-order', appAuthMiddleware, async (req: any, res: Response) => {
    try {
      const { packageId } = req.body;
      if (!packageId) {
        return ResponseWrapper.error(res, new Error('packageId is required'), 400);
      }
      const result = await coinService.createRazorpayOrder(req.user.id, packageId);
      return ResponseWrapper.success(res, result, 'Razorpay order created successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/coins/razorpay/verify-payment:
   *   post:
   *     summary: Verify Razorpay Payment Signature and Add Coins
   *     tags: [Coins]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - packageId
   *               - razorpayOrderId
   *               - razorpayPaymentId
   *               - razorpaySignature
   *             properties:
   *               packageId:
   *                 type: string
   *               razorpayOrderId:
   *                 type: string
   *               razorpayPaymentId:
   *                 type: string
   *               razorpaySignature:
   *                 type: string
   *     responses:
   *       200:
   *         description: Payment verified and coins added successfully
   */
  coinRouter.post('/razorpay/verify-payment', appAuthMiddleware, async (req: any, res: Response) => {
    try {
      const { packageId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
      if (!packageId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
        return ResponseWrapper.error(
          res,
          new Error('packageId, razorpayOrderId, razorpayPaymentId, and razorpaySignature are required'),
          400
        );
      }
      const result = await coinService.verifyRazorpayPayment(
        req.user.id,
        packageId,
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature
      );
      return ResponseWrapper.success(res, result, 'Payment verified successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/coins/cash-out:
   *   post:
   *     summary: Cash out Beans
   *     tags: [Coins]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - amountBeans
   *             properties:
   *               amountBeans:
   *                 type: number
   *               paymentMethodDetails:
   *                 type: string
   *     responses:
   *       200:
   *         description: Cash out requested successfully
   */
  coinRouter.post('/cash-out', appAuthMiddleware, async (req: any, res: Response) => {
    try {
      const { amountBeans, paymentMethodDetails } = req.body;
      const result = await coinService.cashOutBeans(req.user.id, Number(amountBeans), paymentMethodDetails || 'Bank/UPI');
      return ResponseWrapper.success(res, result, 'Cash out requested successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
