import { Router, Response } from 'express';
import Container from 'typedi';
import { StoreService } from '../../../services/app/StoreService';
import { ResponseWrapper } from '../../responseWrapper';
import { appAuthMiddleware } from '../../middleware/appAuthMiddleware';

export default (router: Router) => {
  const storeService = Container.get(StoreService);
  const storeRouter = Router();

  router.use('/store', appAuthMiddleware, storeRouter);

  storeRouter.get('/', async (req: any, res: Response) => {
    try {
      const type = req.query.type;
      const page = req.query.page ? parseInt(req.query.page) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit) : 20;
      const result = await storeService.getStoreItems(type, page, limit);
      return ResponseWrapper.success(res, result, 'Store items fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  storeRouter.get('/mine', async (req: any, res: Response) => {
    try {
      const type = req.query.type;
      const page = req.query.page ? parseInt(req.query.page) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit) : 20;
      const result = await storeService.getUserPurchasedItems(req.user.id, type, page, limit);
      return ResponseWrapper.success(res, result, 'Purchased items fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/store/purchase:
   *   post:
   *     summary: Purchase store item (supports quantity)
   *     tags: [Store]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - storeItemId
   *               - validityIndex
   *             properties:
   *               storeItemId:
   *                 type: string
   *               validityIndex:
   *                 type: integer
   *                 description: Index of price option on the store item
   *               quantity:
   *                 type: integer
   *                 minimum: 1
   *                 default: 1
   *                 description: Number of items to buy in one request
   *     responses:
   *       200:
   *         description: Store item purchased successfully
   */
  storeRouter.post('/purchase', async (req: any, res: Response) => {
    try {
      const { storeItemId, validityIndex, quantity } = req.body;

      if (!storeItemId) {
        throw new Error('storeItemId is required');
      }
      if (validityIndex === undefined || validityIndex === null) {
        throw new Error('validityIndex is required');
      }

      const parsedQuantity = quantity !== undefined && quantity !== null
        ? parseInt(String(quantity), 10)
        : 1;

      const result = await storeService.purchaseStoreItem(
        req.user.id,
        storeItemId,
        Number(validityIndex),
        parsedQuantity
      );
      return ResponseWrapper.success(res, result, 'Store item purchased successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  storeRouter.post('/mine/:id/use', async (req: any, res: Response) => {
    try {
      const { inUse } = req.body;
      const result = await storeService.toggleItemInUse(req.user.id, req.params.id, inUse);
      return ResponseWrapper.success(res, result, 'Item status updated successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
