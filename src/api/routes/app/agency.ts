import { Router, Response } from 'express';
import Container from 'typedi';
import { AgencyService } from '../../../services/app/AgencyService';
import { ResponseWrapper } from '../../responseWrapper';
import { appAuthMiddleware } from '../../middleware/appAuthMiddleware';

export default (router: Router) => {
  const agencyService = Container.get(AgencyService);
  const agencyRouter = Router();

  router.use('/agencies', appAuthMiddleware, agencyRouter);

  /**
   * @swagger
   * /app/agencies/create:
   *   post:
   *     summary: Create an agency and send OTP
   *     tags: [Agencies]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               name: { type: string }
   *               countryId: { type: string }
   *               mobile: { type: string }
   *               email: { type: string }
   *               description: { type: string }
   *     responses:
   *       200:
   *         description: OTP sent
   */
  agencyRouter.post('/create', async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const result = await agencyService.createAgency(userId, req.body);
      return ResponseWrapper.success(res, result, 'OTP sent to mobile number');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/agencies/verify:
   *   post:
   *     summary: Verify agency OTP
   *     tags: [Agencies]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               agencyId: { type: string }
   *               otp: { type: string }
   *     responses:
   *       200:
   *         description: Agency verified successfully
   */
  agencyRouter.post('/verify', async (req: any, res: Response) => {
    try {
      const { agencyId, otp } = req.body;
      const result = await agencyService.verifyAgency(agencyId, otp);
      return ResponseWrapper.success(res, result, 'Agency verified successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
