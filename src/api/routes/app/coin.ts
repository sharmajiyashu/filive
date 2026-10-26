import { Router, Request, Response } from 'express';
import Container from 'typedi';
import { CoinService } from '../../../services/app/CoinService';
import { CoinSellerService } from '../../../services/app/CoinSellerService';
import User from '../../../models/User';
import { ResponseWrapper } from '../../responseWrapper';
import { appAuthMiddleware } from '../../middleware/appAuthMiddleware';

export default (router: Router) => {
  const coinService = Container.get(CoinService);
  const coinSellerService = Container.get(CoinSellerService);
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
  coinRouter.get('/packages', appAuthMiddleware, async (req: any, res: Response) => {
    try {
      let countryId = (req.query.countryId || req.query.countryCode || req.headers['x-country-code']) as string | undefined;
      const audience = (req.query.audience || 'user').toString().toLowerCase() === 'seller'
        ? 'seller'
        : 'user';

      // If no countryId in query but user is logged in, try user's country
      if (!countryId && req.user) {
        const user = await User.findById(req.user.id);
        if (user?.countryId) {
          countryId = user.countryId.toString();
        }
      }

      const result = await coinService.getPackages(countryId, audience);
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
   *       - in: query
   *         name: type
   *         schema:
   *           type: string
   *           enum: [all, cash_out, gift_income, call_income, bean_to_coin_exchange, user_transfer, coinseller_transfer]
   *           default: all
   *         description: Filter by transaction type
   *     responses:
   *       200:
   *         description: >
   *           Beans history with display title (username), subtitle (public User ID),
   *           relatedUser, callType, iconType, and gift name/icon/quantity.
   *           Call ID and Gift ID are not returned.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   properties:
   *                     history:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           title:
   *                             type: string
   *                             description: Primary display text (other user's name)
   *                           subtitle:
   *                             type: string
   *                             description: Secondary display text (public numeric User ID)
   *                           relatedUser:
   *                             type: object
   *                             nullable: true
   *                             properties:
   *                               name:
   *                                 type: string
   *                                 nullable: true
   *                               userId:
   *                                 type: integer
   *                                 nullable: true
   *                           callType:
   *                             type: string
   *                             nullable: true
   *                             enum: [voice, video]
   *                           iconType:
   *                             type: string
   *                             enum: [voice_call, video_call, gift, cash_out, exchange, user_transfer, coinseller_transfer, agency_commission]
   *                           transactionType:
   *                             type: string
   *                           amount:
   *                             type: number
   *                           gift:
   *                             type: object
   *                             nullable: true
   *                             properties:
   *                               name:
   *                                 type: string
   *                               icon:
   *                                 type: string
   *                                 nullable: true
   *                               quantity:
   *                                 type: integer
   *                                 nullable: true
   */
  coinRouter.get('/beans-history', appAuthMiddleware, async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const type = req.query.type as string | undefined;
      const result = await coinService.getBeansHistory(req.user.id, page, limit, type);
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
      const { packageId, transactionId, audience } = req.body;
      const result = await coinService.recharge(req.user.id, packageId, transactionId, audience);
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
      const { packageId, audience } = req.body;
      if (!packageId) {
        return ResponseWrapper.error(res, new Error('packageId is required'), 400);
      }
      const result = await coinService.createRazorpayOrder(req.user.id, packageId, audience);
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
      const { packageId, razorpayOrderId, razorpayPaymentId, razorpaySignature, audience } = req.body;
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
        razorpaySignature,
        audience
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
  /**
   * @swagger
   * /app/coins/convert-beans-to-coins:
   *   post:
   *     summary: Convert user beans to coins (Self, User to User, or User to CoinSeller transfer)
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
   *               - beansAmount
   *             properties:
   *               beansAmount:
   *                 type: integer
   *                 description: Amount of beans to convert
   *               targetUserId:
   *                 type: integer
   *                 description: Optional 10-digit numeric ID of recipient user for direct transfer (omit for self conversion)
   *     responses:
   *       200:
   *         description: Beans converted to coins successfully
   */
  coinRouter.post('/convert-beans-to-coins', appAuthMiddleware, async (req: any, res: Response) => {
    try {
      const { beansAmount } = req.body;
      const targetId = req.body.targetUserId || req.body.userId;
      const result = await coinSellerService.convertBeansToCoins(
        req.user.id,
        Number(beansAmount),
        targetId ? Number(targetId) : undefined
      );
      return ResponseWrapper.success(res, result, result.message || 'Beans converted to coins successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
  /**
   * @swagger
   * /app/coins/pandapay/create-order:
   *   post:
   *     summary: Create PandaPay Order for Coin Recharge
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
   *         description: PandaPay order created successfully
   */
  coinRouter.post('/pandapay/create-order', appAuthMiddleware, async (req: any, res: Response) => {
    try {
      const { packageId, audience } = req.body;
      if (!packageId) {
        return ResponseWrapper.error(res, new Error('packageId is required'), 400);
      }
      const result = await coinService.createPandaPayOrder(req.user.id, packageId, audience);
      return ResponseWrapper.success(res, result, 'PandaPay order created successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/coins/pandapay/callback:
   *   post:
   *     summary: Webhook Callback for PandaPay Payment Notification
   *     tags: [Coins]
   */
  coinRouter.post('/pandapay/callback', async (req: Request, res: Response) => {
    try {
      const payload = req.body;
      const result = await coinService.processPandaPayCallback(payload);
      return res.send('SUCCESS');
    } catch (error: any) {
      return res.status(400).send('FAIL');
    }
  });

  /**
   * @swagger
   * /app/coins/cashfree/create-order:
   *   post:
   *     summary: Create Cashfree Order for Coin Recharge (returns payment_session_id for Android/iOS SDK)
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
   *               audience:
   *                 type: string
   *                 enum: [user, seller]
   *     responses:
   *       200:
   *         description: Cashfree order created successfully with paymentSessionId
   */
  coinRouter.post('/cashfree/create-order', appAuthMiddleware, async (req: any, res: Response) => {
    try {
      const { packageId, audience } = req.body;
      if (!packageId) {
        return ResponseWrapper.error(res, new Error('packageId is required'), 400);
      }
      const result = await coinService.createCashfreeOrder(req.user.id, packageId, audience);
      return ResponseWrapper.success(res, result, 'Cashfree order created successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * Cashfree Hosted JS Checkout Page
   * Works on all devices, emulators, and local APKs without native installer package restrictions.
   */
  coinRouter.get('/cashfree/checkout', async (req: Request, res: Response) => {
    try {
      const paymentSessionId = (req.query.session_id || req.query.payment_session_id)?.toString();
      const orderId = (req.query.order_id || req.query.orderId)?.toString() || '';
      const envRaw = (req.query.env || req.query.environment)?.toString() || 'production';
      const mode = envRaw.toLowerCase() === 'sandbox' ? 'sandbox' : 'production';

      if (!paymentSessionId) {
        return res.status(400).send(`
          <html>
            <body style="font-family:sans-serif;text-align:center;padding:50px;">
              <h2 style="color:#EF0083;">Missing Payment Session</h2>
              <p>Payment session ID is required to launch Cashfree checkout.</p>
            </body>
          </html>
        `);
      }

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>FiLive Secure Checkout</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      background: #FAFAFB;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      color: #1a1a1a;
    }
    .card {
      background: #FFFFFF;
      padding: 32px 24px;
      border-radius: 16px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.06);
      text-align: center;
      max-width: 380px;
      width: 90%;
    }
    .brand {
      font-size: 24px;
      font-weight: 800;
      color: #EF0083;
      margin-bottom: 20px;
      letter-spacing: 0.5px;
    }
    .spinner {
      width: 44px;
      height: 44px;
      border: 4px solid #F3F3F3;
      border-top: 4px solid #EF0083;
      border-radius: 50%;
      animation: spin 0.9s cubic-bezier(0.5, 0.1, 0.4, 0.9) infinite;
      margin: 0 auto 16px auto;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    .title {
      font-size: 17px;
      font-weight: 600;
      color: #111827;
      margin-bottom: 6px;
    }
    .subtitle {
      font-size: 13px;
      color: #6B7280;
      line-height: 1.4;
    }
    .btn-manual {
      margin-top: 18px;
      display: none;
      background: #EF0083;
      color: #ffffff;
      border: none;
      padding: 10px 20px;
      font-size: 14px;
      font-weight: 600;
      border-radius: 8px;
      cursor: pointer;
    }
  </style>
  <script src="https://sdk.cashfree.com/js/v3/cashfree.js"></script>
</head>
<body>
  <div class="card" id="mainCard">
    <div class="brand">FiLive</div>
    <div class="spinner"></div>
    <div class="title">Loading Secure Checkout...</div>
    <div class="subtitle">Opening Cashfree Payment Gateway (UPI, Cards, NetBanking)</div>
    <button class="btn-manual" id="manualBtn">Click to Pay</button>
  </div>

  <script>
    (function() {
      let triggered = false;
      function launchCashfree() {
        if (triggered) return;
        triggered = true;
        try {
          const cashfree = Cashfree({
            mode: "${mode}"
          });
          cashfree.checkout({
            paymentSessionId: "${paymentSessionId}",
            redirectTarget: "_self"
          }).then(function(result) {
            if (result && result.error) {
              document.querySelector('.title').innerText = 'Payment Initialization Failed';
              document.querySelector('.subtitle').innerText = result.error.message || 'Please try again.';
              document.querySelector('.spinner').style.display = 'none';
              document.getElementById('manualBtn').style.display = 'inline-block';
              triggered = false;
            }
          });
        } catch (e) {
          document.querySelector('.title').innerText = 'Error Loading Gateway';
          document.querySelector('.subtitle').innerText = e.message || 'Please reload the page.';
          document.querySelector('.spinner').style.display = 'none';
          document.getElementById('manualBtn').style.display = 'inline-block';
          triggered = false;
        }
      }

      window.addEventListener('load', function() {
        setTimeout(launchCashfree, 200);
      });

      document.getElementById('manualBtn').addEventListener('click', function() {
        triggered = false;
        launchCashfree();
      });
    })();
  </script>
</body>
</html>`;

      res.setHeader('Content-Type', 'text/html');
      return res.send(html);
    } catch (err: any) {
      return res.status(500).send(`Error: ${err.message}`);
    }
  });

  /**
   * @swagger
   * /app/coins/cashfree/verify-payment:
   *   post:
   *     summary: Verify Cashfree Payment and credit coins
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
   *               - orderId
   *             properties:
   *               orderId:
   *                 type: string
   *                 description: Order ID returned during create-order
   *               packageId:
   *                 type: string
   *               audience:
   *                 type: string
   *     responses:
   *       200:
   *         description: Payment verified and coins credited
   */
  coinRouter.post('/cashfree/verify-payment', appAuthMiddleware, async (req: any, res: Response) => {
    try {
      const { orderId, packageId, audience } = req.body;
      if (!orderId) {
        return ResponseWrapper.error(res, new Error('orderId is required'), 400);
      }
      const result = await coinService.verifyCashfreePayment(
        req.user.id,
        orderId,
        packageId,
        audience
      );
      return ResponseWrapper.success(res, result, result.message || 'Payment verified successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/coins/cashfree/callback:
   *   post:
   *     summary: Webhook Callback for Cashfree Payment Notifications
   *     tags: [Coins]
   */
  coinRouter.post('/cashfree/callback', async (req: Request, res: Response) => {
    try {
      const payload = req.body;
      const result = await coinService.processCashfreeCallback(payload);
      return res.status(200).json({ status: 'OK', result });
    } catch (error: any) {
      return res.status(400).json({ status: 'ERROR', error: error.message });
    }
  });
};
