import { Router, Response } from 'express';
import Container from 'typedi';
import { AdminVipService } from '../../../services/admin/VipService';
import { ResponseWrapper } from '../../responseWrapper';
import { adminAuthMiddleware } from '../../middleware/adminAuthMiddleware';

export default (router: Router) => {
  const vipRouter = Router();
  const vipService = Container.get(AdminVipService);

  router.use('/vip-plans', adminAuthMiddleware, vipRouter);

  /**
   * @swagger
   * /admin/vip-plans:
   *   get:
   *     summary: Get all VIP plans for admin
   *     tags: [Admin VIP Plans]
   */
  vipRouter.get('/', async (req: any, res: Response) => {
    try {
      const plans = await vipService.getAllPlans();
      return ResponseWrapper.success(res, plans, 'VIP plans fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/vip-plans/{id}:
   *   get:
   *     summary: Get single VIP plan by ID
   *     tags: [Admin VIP Plans]
   */
  vipRouter.get('/:id', async (req: any, res: Response) => {
    try {
      const plan = await vipService.getPlanById(req.params.id);
      if (!plan) {
        return ResponseWrapper.error(res, 'VIP plan not found');
      }
      return ResponseWrapper.success(res, plan, 'VIP plan fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/vip-plans:
   *   post:
   *     summary: Create a new VIP plan
   *     tags: [Admin VIP Plans]
   */
  vipRouter.post('/', async (req: any, res: Response) => {
    try {
      const plan = await vipService.createPlan(req.body);
      return ResponseWrapper.success(res, plan, 'VIP plan created successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/vip-plans/{id}:
   *   put:
   *     summary: Update an existing VIP plan
   *     tags: [Admin VIP Plans]
   */
  vipRouter.put('/:id', async (req: any, res: Response) => {
    try {
      const plan = await vipService.updatePlan(req.params.id, req.body);
      return ResponseWrapper.success(res, plan, 'VIP plan updated successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/vip-plans/{id}:
   *   delete:
   *     summary: Delete a VIP plan
   *     tags: [Admin VIP Plans]
   */
  vipRouter.delete('/:id', async (req: any, res: Response) => {
    try {
      await vipService.deletePlan(req.params.id);
      return ResponseWrapper.success(res, null, 'VIP plan deleted successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/vip-plans/{id}/toggle-status:
   *   post:
   *     summary: Toggle VIP plan active/inactive status
   *     tags: [Admin VIP Plans]
   */
  vipRouter.post('/:id/toggle-status', async (req: any, res: Response) => {
    try {
      const plan = await vipService.toggleStatus(req.params.id);
      return ResponseWrapper.success(res, plan, 'VIP plan status toggled successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
