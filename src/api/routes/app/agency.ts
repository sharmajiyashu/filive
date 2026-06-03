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
   * /app/agencies/requests/my:
   *   get:
   *     summary: Get user's agency join requests
   *     tags: [Agencies]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Requests fetched successfully
   */
  agencyRouter.get('/requests/my', async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const page = req.query.page ? parseInt(req.query.page) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit) : 10;
      const result = await agencyService.getUserAgencyRequests(userId, page, limit);
      return ResponseWrapper.success(res, result, 'Requests fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/agencies/{id}/join:
   *   post:
   *     summary: Request to join an agency
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
   *         description: Join request sent successfully
   */
  agencyRouter.post('/:id/join', async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const agencyId = req.params.id;
      const result = await agencyService.requestToJoinAgency(userId, agencyId);
      return ResponseWrapper.success(res, result, 'Join request sent successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/agencies/{id}/requests/{requestId}/handle:
   *   post:
   *     summary: Agency admin accepts or rejects a join request
   *     tags: [Agencies]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *       - in: path
   *         name: requestId
   *         required: true
   *         schema: { type: string }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               status: { type: string, enum: [ACCEPTED, REJECTED] }
   *     responses:
   *       200:
   *         description: Request handled successfully
   */
  agencyRouter.post('/:id/requests/:requestId/handle', async (req: any, res: Response) => {
    try {
      const adminUserId = req.user.id;
      const agencyId = req.params.id;
      const requestId = req.params.requestId;
      const { status } = req.body;
      const result = await agencyService.handleJoinRequest(agencyId, adminUserId, requestId, status);
      return ResponseWrapper.success(res, result, 'Request handled successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/agencies/{id}/add-host:
   *   post:
   *     summary: Agency admin adds a host directly
   *     tags: [Agencies]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               targetUserId: { type: string }
   *               verificationCode: { type: string }
   *     responses:
   *       200:
   *         description: Host added successfully
   */
  agencyRouter.post('/:id/add-host', async (req: any, res: Response) => {
    try {
      const adminUserId = req.user.id;
      const agencyId = req.params.id;
      const { targetUserId, verificationCode } = req.body;
      const result = await agencyService.addHostToAgency(agencyId, adminUserId, targetUserId, verificationCode);
      return ResponseWrapper.success(res, result, 'Host added successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/agencies/{id}/hosts:
   *   get:
   *     summary: Get agency hosts
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
   *         description: Agency hosts fetched successfully
   */
  agencyRouter.get('/:id/hosts', async (req: any, res: Response) => {
    try {
      const adminUserId = req.user.id;
      const agencyId = req.params.id;
      const page = req.query.page ? parseInt(req.query.page) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit) : 10;
      const result = await agencyService.getAgencyHosts(agencyId, adminUserId, page, limit);
      return ResponseWrapper.success(res, result, 'Agency hosts fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/agencies/{id}/requests:
   *   get:
   *     summary: Get agency pending requests
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
   *         description: Agency requests fetched successfully
   */
  agencyRouter.get('/:id/requests', async (req: any, res: Response) => {
    try {
      const adminUserId = req.user.id;
      const agencyId = req.params.id;
      const page = req.query.page ? parseInt(req.query.page) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit) : 10;
      const result = await agencyService.getAgencyPendingRequests(agencyId, adminUserId, page, limit);
      return ResponseWrapper.success(res, result, 'Agency requests fetched successfully');
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
