import { Router, Response } from 'express';
import Container from 'typedi';
import { PaymentMethodService } from '../../../services/admin/PaymentMethodService';
import { ResponseWrapper } from '../../responseWrapper';
import { adminAuthMiddleware } from '../../middleware/adminAuthMiddleware';

export default (router: Router) => {
  const paymentMethodService = Container.get(PaymentMethodService);
  const paymentMethodRouter = Router();

  router.use('/payment-method', adminAuthMiddleware, paymentMethodRouter);

  /**
   * GET /admin/payment-method
   */
  paymentMethodRouter.get('/', async (_req: any, res: Response) => {
    try {
      const methods = await paymentMethodService.getAllPaymentMethods();
      return ResponseWrapper.success(res, methods, 'Payment methods fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * GET /admin/payment-method/:gateway
   */
  paymentMethodRouter.get('/:gateway', async (req: any, res: Response) => {
    try {
      const method = await paymentMethodService.getPaymentMethodByGateway(req.params.gateway);
      return ResponseWrapper.success(res, method, 'Payment method fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * PUT /admin/payment-method/:gateway
   */
  paymentMethodRouter.put('/:gateway', async (req: any, res: Response) => {
    try {
      const method = await paymentMethodService.updatePaymentMethod(req.params.gateway, req.body);
      return ResponseWrapper.success(res, method, 'Payment method updated successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
