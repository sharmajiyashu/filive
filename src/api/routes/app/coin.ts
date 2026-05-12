import { Router, Request, Response } from 'express';
import Container from 'typedi';
import { CoinService } from '../../../services/app/CoinService';
import { ResponseWrapper } from '../../responseWrapper';
import { appAuthMiddleware } from '../../middleware/appAuthMiddleware';

export default (router: Router) => {
  const coinService = Container.get(CoinService);
  const coinRouter = Router();

  router.use('/coins', appAuthMiddleware, coinRouter);

  /**
   * @swagger
   * /app/coins/packages:
   *   get:
   *     summary: Get coin packages
   *     tags: [Coins]
   *     responses:
   *       200:
   *         description: List of packages
   */
  coinRouter.get('/packages', async (req: Request, res: Response) => {
    try {
      const result = await coinService.getPackages();
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
   *       - BearerAuth: []
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
   *       - BearerAuth: []
   *     responses:
   *       200:
   *         description: History details
   */
  coinRouter.get('/history', async (req: any, res: Response) => {
    try {
      const result = await coinService.getHistory(req.user.id);
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
   *       - BearerAuth: []
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
