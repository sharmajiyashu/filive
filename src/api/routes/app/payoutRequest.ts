import { Router, Response } from 'express';
import Container from 'typedi';
import { PayoutRequestService } from '../../../services/admin/PayoutRequestService';
import { ResponseWrapper } from '../../responseWrapper';
import { appAuthMiddleware } from '../../middleware/appAuthMiddleware';

export default (router: Router) => {
  const payoutRequestService = Container.get(PayoutRequestService);
  const payoutRequestRouter = Router();

  router.use('/payout-requests', appAuthMiddleware, payoutRequestRouter);

  /**
   * @swagger
   * /app/payout-requests:
   *   post:
   *     summary: Create/Submit a new payout request
   *     tags: [Payout]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - payoutMethodId
   *               - fieldValues
   *               - amount
   *             properties:
   *               payoutMethodId:
   *                 type: string
   *               amount:
   *                 type: number
   *               currency:
   *                 type: string
   *               coins:
   *                 type: number
   *               fieldValues:
   *                 type: array
   *                 items:
   *                   type: object
   *                   properties:
   *                     fieldName:
   *                       type: string
   *                     fieldLabel:
   *                       type: string
   *                     value:
   *                       type: string
   *     responses:
   *       200:
   *         description: Payout request submitted successfully
   */
  payoutRequestRouter.post('/', async (req: any, res: Response) => {
    try {
      const userId = req.user.id || req.user._id;
      const { payoutMethodId, fieldValues, amount, currency, coins } = req.body;

      const result = await payoutRequestService.createPayoutRequest(userId, {
        payoutMethodId,
        fieldValues,
        amount,
        currency,
        coins,
      });

      return ResponseWrapper.success(res, result, 'Payout request submitted successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/payout-requests/my:
   *   get:
   *     summary: Get logged-in user's payout requests history
   *     tags: [Payout]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: User payout request history
   */
  payoutRequestRouter.get('/my', async (req: any, res: Response) => {
    try {
      const userId = req.user.id || req.user._id;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const result = await payoutRequestService.getUserPayoutRequests(userId, page, limit);
      return ResponseWrapper.success(res, result, 'Payout request history fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
