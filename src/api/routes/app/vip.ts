import { Router, Response } from 'express';
import Container from 'typedi';
import { VipService } from '../../../services/app/VipService';
import { ResponseWrapper } from '../../responseWrapper';

export default (router: Router) => {
  const vipRouter = Router();
  const vipService = Container.get(VipService);

  router.use('/vip', vipRouter);

  /**
   * @swagger
   * /app/vip/plans:
   *   get:
   *     summary: Get all active VIP plans for purchase
   *     tags: [VIP]
   */
  vipRouter.get('/plans', async (req: any, res: Response) => {
    try {
      const plans = await vipService.getActivePlans();
      return ResponseWrapper.success(res, plans, 'Active VIP plans fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/vip/status:
   *   get:
   *     summary: Get VIP status and details for logged in user
   *     tags: [VIP]
   */
  vipRouter.get('/status', async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const status = await vipService.getUserVipStatus(userId);
      return ResponseWrapper.success(res, status, 'VIP status fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/vip/purchase:
   *   post:
   *     summary: Purchase a VIP plan using in-app coins
   *     tags: [VIP]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               planId:
   *                 type: string
   */
  vipRouter.post('/purchase', async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const { planId } = req.body;
      if (!planId) {
        return ResponseWrapper.error(res, 'planId is required', 400);
      }

      const result = await vipService.purchaseVipPlan(userId, planId);
      return ResponseWrapper.success(res, result, result.message);
    } catch (error: any) {
      if (error.code === 'INSUFFICIENT_COINS') {
        return res.status(400).json({
          success: false,
          code: 'INSUFFICIENT_COINS',
          message: error.message,
        });
      }
      return ResponseWrapper.error(res, error);
    }
  });
};
