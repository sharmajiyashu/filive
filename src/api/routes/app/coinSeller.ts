import { Router, Response } from 'express';
import Container from 'typedi';
import { CoinSellerService } from '../../../services/app/CoinSellerService';
import { ResponseWrapper } from '../../responseWrapper';

export default (router: Router) => {
  const coinSellerService = Container.get(CoinSellerService);
  const sellerRouter = Router();

  router.use('/coin-seller', sellerRouter);

  /**
   * @swagger
   * /app/coin-seller/transfer:
   *   post:
   *     summary: Transfer coins to another user by their 10-digit unique userId
   *     tags: [Coin Seller]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - targetUserId
   *               - amount
   *             properties:
   *               targetUserId:
   *                 type: integer
   *                 description: The 10-digit unique userId integer of the recipient
   *               amount:
   *                 type: integer
   *                 description: The number of coins to transfer
   *     responses:
   *       200:
   *         description: Coins transferred successfully
   */
  sellerRouter.post('/transfer', async (req: any, res: Response) => {
    try {
      const { targetUserId, amount } = req.body;
      const result = await coinSellerService.transferCoins(req.user.id, Number(targetUserId), Number(amount));
      return ResponseWrapper.success(res, result, 'Coins transferred successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/coin-seller/sales:
   *   get:
   *     summary: Get coin seller statistics and transfer/sales history
   *     tags: [Coin Seller]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *           default: 1
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 20
   *     responses:
   *       200:
   *         description: Sales stats and paginated buyer history list fetched successfully
   */
  sellerRouter.get('/sales', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '20');
      const result = await coinSellerService.getSellerSalesHistory(req.user.id, page, limit);
      return ResponseWrapper.success(res, result, 'Sales history fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/coin-seller/dashboard:
   *   get:
   *     summary: Get coin seller dashboard data
   *     tags: [Coin Seller]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Coin seller dashboard statistics retrieved successfully
   */
  sellerRouter.get('/dashboard', async (req: any, res: Response) => {
    try {
      const result = await coinSellerService.getSellerDashboard(req.user.id);
      return ResponseWrapper.success(res, result, 'Dashboard data fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
