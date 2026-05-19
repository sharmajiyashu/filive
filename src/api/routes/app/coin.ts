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
};
