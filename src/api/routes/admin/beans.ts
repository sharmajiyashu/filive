import { Router, Response } from 'express';
import Container from 'typedi';
import { BeansManagementService } from '../../../services/admin/BeansManagementService';
import { ResponseWrapper } from '../../responseWrapper';
import { adminAuthMiddleware } from '../../middleware/adminAuthMiddleware';

export default (router: Router) => {
  const beansService = Container.get(BeansManagementService);
  const beansRouter = Router();

  router.use('/beans', adminAuthMiddleware, beansRouter);

  /**
   * @swagger
   * /admin/beans/overview:
   *   get:
   *     summary: Get overall platform Beans statistics and circulation overview
   *     tags: [Admin - Beans Management]
   *     responses:
   *       200:
   *         description: Beans overview fetched successfully
   */
  beansRouter.get('/overview', async (_req: any, res: Response) => {
    try {
      const result = await beansService.getBeansOverviewStats();
      return ResponseWrapper.success(res, result, 'Beans overview fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/beans/history:
   *   get:
   *     summary: Get paginated Beans transaction history with filters
   *     tags: [Admin - Beans Management]
   *     parameters:
   *       - in: query
   *         name: page
   *         schema: { type: integer, default: 1 }
   *       - in: query
   *         name: limit
   *         schema: { type: integer, default: 20 }
   *       - in: query
   *         name: search
   *         schema: { type: string }
   *         description: Search by user name, email, numeric userId, or mobile
   *       - in: query
   *         name: userId
   *         schema: { type: string }
   *         description: Filter by specific User ID or Mongo _id
   *       - in: query
   *         name: type
   *         schema:
   *           type: string
   *           enum: [all, gift_received, call_income, cash_out, beans_to_coins, admin_credit, admin_debit, agency_commission]
   *       - in: query
   *         name: startDate
   *         schema: { type: string, format: date }
   *       - in: query
   *         name: endDate
   *         schema: { type: string, format: date }
   *     responses:
   *       200:
   *         description: Beans transaction history fetched successfully
   */
  beansRouter.get('/history', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '20');
      const search = req.query.search?.toString();
      const userId = req.query.userId?.toString();
      const type = req.query.type?.toString();
      const startDate = req.query.startDate?.toString();
      const endDate = req.query.endDate?.toString();

      const result = await beansService.getBeansHistory({
        page,
        limit,
        search,
        userId,
        type,
        startDate,
        endDate,
      });

      return ResponseWrapper.success(res, result, 'Beans transaction history fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/beans/users:
   *   get:
   *     summary: Get list of users with Beans balances, earnings, and level stats
   *     tags: [Admin - Beans Management]
   *     parameters:
   *       - in: query
   *         name: page
   *         schema: { type: integer, default: 1 }
   *       - in: query
   *         name: limit
   *         schema: { type: integer, default: 10 }
   *       - in: query
   *         name: search
   *         schema: { type: string }
   *       - in: query
   *         name: minBeans
   *         schema: { type: integer }
   *       - in: query
   *         name: sortBy
   *         schema: { type: string, enum: [beans, charmCoins, createdAt] }
   *       - in: query
   *         name: sortOrder
   *         schema: { type: string, enum: [asc, desc] }
   *     responses:
   *       200:
   *         description: Beans users list fetched successfully
   */
  beansRouter.get('/users', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '10');
      const search = req.query.search?.toString();
      const minBeans = req.query.minBeans ? parseInt(req.query.minBeans.toString()) : undefined;
      const sortBy = req.query.sortBy?.toString() as any;
      const sortOrder = req.query.sortOrder?.toString() as any;

      const result = await beansService.getBeansUsersList({
        page,
        limit,
        search,
        minBeans,
        sortBy,
        sortOrder,
      });

      return ResponseWrapper.success(res, result, 'Beans users list fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/beans/user/{id}:
   *   get:
   *     summary: Get detailed Beans profile & statistics for a specific user
   *     tags: [Admin - Beans Management]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *       - in: query
   *         name: page
   *         schema: { type: integer, default: 1 }
   *       - in: query
   *         name: limit
   *         schema: { type: integer, default: 20 }
   *     responses:
   *       200:
   *         description: User beans details fetched successfully
   */
  beansRouter.get('/user/:id', async (req: any, res: Response) => {
    try {
      const userId = req.params.id;
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '20');

      const result = await beansService.getUserBeansDetails(userId, page, limit);
      return ResponseWrapper.success(res, result, 'User beans details fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/beans/adjust:
   *   post:
   *     summary: Adjust user beans by identifier (Numeric User ID, Mongo ID, Email, or Mobile)
   *     tags: [Admin - Beans Management]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [identifier, amount, action]
   *             properties:
   *               identifier:
   *                 type: string
   *                 description: Numeric User ID, Mongo _id, email, or mobile
   *               amount:
   *                 type: number
   *                 minimum: 1
   *               action:
   *                 type: string
   *                 enum: [add, deduct]
   *               description:
   *                 type: string
   *     responses:
   *       200:
   *         description: User beans adjusted successfully
   */
  beansRouter.post('/adjust', async (req: any, res: Response) => {
    try {
      const { identifier, amount, action, description } = req.body;
      const result = await beansService.adjustBeans({
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
