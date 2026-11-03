import { Router, Response } from 'express';
import Container from 'typedi';
import { CoinsManagementService } from '../../../services/admin/CoinsManagementService';
import { ResponseWrapper } from '../../responseWrapper';
import { adminAuthMiddleware } from '../../middleware/adminAuthMiddleware';

export default (router: Router) => {
  const coinsService = Container.get(CoinsManagementService);
  const coinsRouter = Router();

  router.use('/coins', adminAuthMiddleware, coinsRouter);

  /**
   * @swagger
   * /admin/coins/overview:
   *   get:
   *     summary: Get overall platform Coins statistics and circulation overview
   *     tags: [Admin - Coins Management]
   *     responses:
   *       200:
   *         description: Coins overview fetched successfully
   */
  coinsRouter.get('/overview', async (_req: any, res: Response) => {
    try {
      const result = await coinsService.getCoinsOverviewStats();
      return ResponseWrapper.success(res, result, 'Coins overview fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/coins/history:
   *   get:
   *     summary: Get paginated Coins transaction history with filters
   *     tags: [Admin - Coins Management]
   */
  coinsRouter.get('/history', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '20');
      const search = req.query.search?.toString();
      const userId = req.query.userId?.toString();
      const type = req.query.type?.toString();
      const startDate = req.query.startDate?.toString();
      const endDate = req.query.endDate?.toString();

      const result = await coinsService.getCoinsHistory({
        page,
        limit,
        search,
        userId,
        type,
        startDate,
        endDate,
      });

      return ResponseWrapper.success(res, result, 'Coins transaction history fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/coins/users:
   *   get:
   *     summary: Get list of users with Coins balances, wealth level, and recharge stats
   *     tags: [Admin - Coins Management]
   */
  coinsRouter.get('/users', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '10');
      const search = req.query.search?.toString();
      const minCoins = req.query.minCoins !== undefined ? parseFloat(req.query.minCoins?.toString()) : undefined;
      const sortBy = (req.query.sortBy?.toString() as any) || 'coins';
      const sortOrder = (req.query.sortOrder?.toString() as any) || 'desc';

      const result = await coinsService.getCoinsUsers({
        page,
        limit,
        search,
        minCoins,
        sortBy,
        sortOrder,
      });

      return ResponseWrapper.success(res, result, 'Coins users list fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/coins/user/{id}:
   *   get:
   *     summary: Get complete Coins details and transaction history for a single user
   *     tags: [Admin - Coins Management]
   */
  coinsRouter.get('/user/:id', async (req: any, res: Response) => {
    try {
      const { id } = req.params;
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '20');

      const result = await coinsService.getUserCoinsDetails(id, page, limit);
      return ResponseWrapper.success(res, result, 'User coins details fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/coins/adjust:
   *   post:
   *     summary: Manually credit or debit Coins from a user's wallet
   *     tags: [Admin - Coins Management]
   */
  coinsRouter.post('/adjust', async (req: any, res: Response) => {
    try {
      const { identifier, amount, action, description } = req.body;
      const result = await coinsService.adjustCoins({
        identifier,
        amount,
        action,
        description,
      });
      return ResponseWrapper.success(res, result, result.message);
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};

