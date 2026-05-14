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

  /**
   * @swagger
   * /app/agencies:
   *   get:
   *     summary: Get all verified agencies
   *     tags: [Agencies]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Agencies fetched successfully
   */
  agencyRouter.get('/', async (req: any, res: Response) => {
    try {
      const result = await agencyService.getAgencies();
      return ResponseWrapper.success(res, result, 'Agencies fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/agencies/{id}:
   *   get:
   *     summary: Get agency details
   *     tags: [Agencies]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Agency details fetched successfully
   */
  agencyRouter.get('/:id', async (req: any, res: Response) => {
    try {
      const result = await agencyService.getAgency(req.params.id);
      return ResponseWrapper.success(res, result, 'Agency details fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
