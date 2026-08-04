import { Router, Request, Response } from 'express';
import Container from 'typedi';
import { PayoutMethodService } from '../../../services/admin/PayoutMethodService';
import { ResponseWrapper } from '../../responseWrapper';

export default (router: Router) => {
  const payoutMethodService = Container.get(PayoutMethodService);
  const payoutMethodRouter = Router();

  router.use('/payout-methods', payoutMethodRouter);

  /**
   * @swagger
   * /app/payout-methods:
   *   get:
   *     summary: Get list of active payment methods filtered by country code
   *     tags: [Payout]
   *     parameters:
   *       - in: query
   *         name: countryCode
   *         schema:
   *           type: string
   *         description: ISO Country code (e.g., IN, KH, US)
   *     responses:
   *       200:
   *         description: List of active payout methods
   */
  payoutMethodRouter.get('/', async (req: Request, res: Response) => {
    try {
      const countryCode = (req.query.countryCode || req.headers['x-country-code']) as string | undefined;
      const methods = await payoutMethodService.getActivePayoutMethodsByCountry(countryCode);
      return ResponseWrapper.success(res, methods, 'Payout methods fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
