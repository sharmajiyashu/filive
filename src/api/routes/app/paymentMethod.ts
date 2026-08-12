import { Router, Response } from 'express';
import Container from 'typedi';
import { PaymentMethodService } from '../../../services/app/PaymentMethodService';
import { ResponseWrapper } from '../../responseWrapper';
import { appAuthMiddleware } from '../../middleware/appAuthMiddleware';

export default (router: Router) => {
  const paymentMethodService = Container.get(PaymentMethodService);
  const paymentMethodRouter = Router();

  router.use('/payment-methods', paymentMethodRouter);

  /**
   * @swagger
   * /app/payment-methods:
   *   get:
   *     summary: Get available pay-in gateways filtered by country and recharge audience
   *     tags: [Payment]
   *     parameters:
   *       - in: query
   *         name: countryCode
   *         schema:
   *           type: string
   *         description: ISO country code (e.g. IN, US)
   *       - in: query
   *         name: audience
   *         schema:
   *           type: string
   *           enum: [user, seller]
   *         description: Recharge context (user or seller). Defaults to user.
   */
  paymentMethodRouter.get('/', appAuthMiddleware, async (req: any, res: Response) => {
    try {
      const audienceRaw = (req.query.audience || 'user').toString().toLowerCase();
      const audience = audienceRaw === 'seller' ? 'seller' : 'user';

      const countryFromQuery = (req.query.countryCode || req.headers['x-country-code']) as
        | string
        | undefined;
      const countryCode = await paymentMethodService.resolveUserCountryCode(
        req.user?.id,
        countryFromQuery
      );

      const methods = await paymentMethodService.getAvailablePaymentMethods(
        countryCode,
        audience
      );

      return ResponseWrapper.success(
        res,
        {
          countryCode: countryCode || null,
          audience,
          methods,
        },
        'Payment methods fetched successfully'
      );
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
