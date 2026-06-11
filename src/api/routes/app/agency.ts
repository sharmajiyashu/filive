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
   * /app/agencies/my:
   *   get:
   *     summary: Get my agency details with commission info
   *     tags: [Agencies]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Agency details with commission fetched successfully
   */
  agencyRouter.get('/my', async (req: any, res: Response) => {
    try {
      const result = await agencyService.getMyAgency(req.user.id);
      return ResponseWrapper.success(res, result, 'Agency details fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/agencies/dashboard:
   *   get:
   *     summary: Get agency commission dashboard stats
   *     tags: [Agencies]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Agency dashboard stats fetched successfully
   */
  agencyRouter.get('/dashboard', async (req: any, res: Response) => {
    try {
      const result = await agencyService.getAgencyDashboard(req.user.id);
      return ResponseWrapper.success(res, result, 'Agency dashboard fetched successfully');
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
   * /app/agencies/host-requests/pending:
   *   get:
   *     summary: Get pending agency host invites for current user
   *     description: Lists pending host invites received via chat from agencies.
   *     tags: [Agencies]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: page
   *         schema: { type: integer, default: 1 }
   *       - in: query
   *         name: limit
   *         schema: { type: integer, default: 10 }
   *     responses:
   *       200:
   *         description: Pending host invites fetched successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/HostInviteListResponse'
   */
  agencyRouter.get('/host-requests/pending', async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const page = req.query.page ? parseInt(req.query.page) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit) : 10;
      const result = await agencyService.getPendingHostInvites(userId, page, limit);
      return ResponseWrapper.success(res, result, 'Pending host invites fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/agencies/host-requests/{requestId}:
   *   get:
   *     summary: Get agency host invite details
   *     description: View full invite details including agency data, open and verify flags.
   *     tags: [Agencies]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: requestId
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Host invite details fetched successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   $ref: '#/components/schemas/HostInviteDetail'
   */
  agencyRouter.get('/host-requests/:requestId', async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const result = await agencyService.getHostInviteDetails(userId, req.params.requestId);
      return ResponseWrapper.success(res, result, 'Host invite details fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/agencies/host-requests/{requestId}/open:
   *   post:
   *     summary: Mark host invite as opened
   *     description: Call when user opens the chat or invite message. Sets isOpened flag on request and chat message.
   *     tags: [Agencies]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: requestId
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Host invite marked as opened
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   $ref: '#/components/schemas/HostInviteDetail'
   */
  agencyRouter.post('/host-requests/:requestId/open', async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const result = await agencyService.markHostInviteOpened(userId, req.params.requestId);
      return ResponseWrapper.success(res, result, 'Host invite marked as opened');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/agencies/host-requests/{requestId}/verify-view:
   *   post:
   *     summary: Mark host invite as verified/viewed
   *     description: Call when user opens and verifies agency host request details. Sets isVerified and isOpened flags.
   *     tags: [Agencies]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: requestId
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Host invite marked as verified
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   $ref: '#/components/schemas/HostInviteDetail'
   */
  agencyRouter.post('/host-requests/:requestId/verify-view', async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const result = await agencyService.markHostInviteVerified(userId, req.params.requestId);
      return ResponseWrapper.success(res, result, 'Host invite marked as verified');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/agencies/host-requests/{requestId}/respond:
   *   post:
   *     summary: Accept or reject agency host invite from chat
   *     description: User responds to a pending host invite received via chat message. Only works for agency-initiated invites.
   *     tags: [Agencies]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: requestId
   *         required: true
   *         schema:
   *           type: string
   *         description: Agency host request ID from message metadata
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/HostInviteRespondRequest'
   *     responses:
   *       200:
   *         description: Host invite responded successfully
   *       400:
   *         description: Invite not found or already responded
   */
  agencyRouter.post('/host-requests/:requestId/respond', async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const requestId = req.params.requestId;
      const { status } = req.body;
      if (!status || !['ACCEPTED', 'REJECTED'].includes(status)) {
        throw new Error('status must be ACCEPTED or REJECTED');
      }
      const result = await agencyService.respondToHostInvite(userId, requestId, status);
      return ResponseWrapper.success(res, result, `Host invite ${status.toLowerCase()} successfully`);
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/agencies/{id}/join:
   *   post:
   *     summary: Join an agency as host by agency MongoDB ID
   *     description: Join as host using agency document MongoDB _id. Host is accepted immediately.
   *     tags: [Agencies]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Agency MongoDB _id
   *     responses:
   *       200:
   *         description: Joined agency successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   $ref: '#/components/schemas/AgencyHostDetail'
   *       400:
   *         description: Already a host or invalid agency
   */
  agencyRouter.post('/:id/join', async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const agencyId = req.params.id;
      const result = await agencyService.requestToJoinAgency(userId, agencyId);
      return ResponseWrapper.success(res, result, 'Joined agency successfully');
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
   *     summary: Send host invite to user via chat
   *     description: Agency admin sends a host invite when numeric user ID and host verification code match. User receives a chat message and can accept or reject from chats.
   *     tags: [Agencies]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Agency MongoDB _id
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/AddHostRequest'
   *     responses:
   *       200:
   *         description: Host invite sent successfully via chat
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   $ref: '#/components/schemas/AddHostResponse'
   *       400:
   *         description: Invalid user ID or host code, or invite already pending
   */
  agencyRouter.post('/:id/add-host', async (req: any, res: Response) => {
    try {
      const adminUserId = req.user.id;
      const agencyId = req.params.id;
      const { targetUserId, verificationCode } = req.body;
      if (!targetUserId || !verificationCode) {
        throw new Error('targetUserId and verificationCode are required');
      }
      const result = await agencyService.addHostToAgency(agencyId, adminUserId, String(targetUserId), verificationCode);
      return ResponseWrapper.success(res, result, 'Host invite sent successfully');
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
   *       - in: query
   *         name: page
   *         schema: { type: integer, default: 1 }
   *       - in: query
   *         name: limit
   *         schema: { type: integer, default: 10 }
   *     responses:
   *       200:
   *         description: Agency hosts fetched successfully with pagination
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
   * /app/agencies/{id}/host-history:
   *   get:
   *     summary: Get agency host add history
   *     tags: [Agencies]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *       - in: query
   *         name: page
   *         schema: { type: integer, default: 1 }
   *       - in: query
   *         name: limit
   *         schema: { type: integer, default: 10 }
   *     responses:
   *       200:
   *         description: Host add history fetched successfully
   */
  agencyRouter.get('/:id/host-history', async (req: any, res: Response) => {
    try {
      const adminUserId = req.user.id;
      const agencyId = req.params.id;
      const page = req.query.page ? parseInt(req.query.page) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit) : 10;
      const result = await agencyService.getHostAddHistory(agencyId, adminUserId, page, limit);
      return ResponseWrapper.success(res, result, 'Host add history fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/agencies/verify-user/{userId}:
   *   post:
   *     summary: Check user for host invite (country, level, agency status)
   *     tags: [Agencies]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: userId
   *         required: true
   *         schema: { type: number }
   *     requestBody:
   *       required: false
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               agencyId: { type: string }
   *     responses:
   *       200:
   *         description: User checked successfully for host invite
   */
  agencyRouter.post('/verify-user/:userId', async (req: any, res: Response) => {
    try {
      const adminUserId = req.user.id;
      const targetUserId = parseInt(req.params.userId);
      const { agencyId } = req.body || {};
      
      if (isNaN(targetUserId)) {
        throw new Error('userId must be a valid number');
      }
      
      const result = await agencyService.verifyUserForHost(targetUserId, adminUserId, agencyId);
      return ResponseWrapper.success(res, result, 'User checked successfully for host invite');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/agencies/become-host:
   *   post:
   *     summary: Become a host by joining an agency
   *     description: Join as host using agency MongoDB _id, owner MongoDB _id, or owner numeric user ID. Host is accepted immediately.
   *     tags: [Agencies]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/BecomeHostRequest'
   *     responses:
   *       200:
   *         description: Joined agency successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   $ref: '#/components/schemas/AgencyHostDetail'
   *       400:
   *         description: Agency not found or already a host
   */
  agencyRouter.post('/become-host', async (req: any, res: Response) => {
    try {
      const currentUserId = req.user.id;
      const { agentId } = req.body;
      if (!agentId) {
        throw new Error('agentId is required');
      }
      const result = await agencyService.userJoinAgency(currentUserId, agentId);
      return ResponseWrapper.success(res, result, 'Joined agency successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/agencies/verify-agency-user/{userId}:
   *   get:
   *     summary: Verify agency owner user ID and get agency data
   *     description: Check whether a numeric app user ID belongs to an agency owner and return agency details if found.
   *     tags: [Agencies]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: userId
   *         required: true
   *         schema:
   *           type: integer
   *           example: 100001
   *         description: Agency owner numeric app user ID
   *     responses:
   *       200:
   *         description: User verified successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   $ref: '#/components/schemas/VerifyAgencyUserResponse'
   *       400:
   *         description: User not found or invalid userId
   */
  agencyRouter.get('/verify-agency-user/:userId', async (req: any, res: Response) => {
    try {
      const numericUserId = parseInt(req.params.userId);
      if (isNaN(numericUserId)) {
        throw new Error('userId must be a valid number');
      }
      const result = await agencyService.verifyAgencyUserId(numericUserId);
      return ResponseWrapper.success(res, result, result.hasAgency ? 'Agency found for this user' : 'User found but has no agency');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/agencies/join-by-user-id:
   *   post:
   *     summary: Join agency as host using owner numeric user ID
   *     description: Join an agency as host by providing the agency owner numeric app user ID. Agency must be verified and approved. Host is accepted immediately.
   *     tags: [Agencies]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/JoinByUserIdRequest'
   *     responses:
   *       200:
   *         description: Joined agency successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   $ref: '#/components/schemas/AgencyHostDetail'
   *       400:
   *         description: Agency user not found, no agency, not verified, or already a host
   */
  agencyRouter.post('/join-by-user-id', async (req: any, res: Response) => {
    try {
      const currentUserId = req.user.id;
      const agencyUserId = parseInt(req.body.agencyUserId);
      if (isNaN(agencyUserId)) {
        throw new Error('agencyUserId must be a valid number');
      }
      const result = await agencyService.joinAgencyByUserId(currentUserId, agencyUserId);
      return ResponseWrapper.success(res, result, 'Joined agency successfully');
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
      const result = await agencyService.getAgency(req.params.id, req.user.id);
      return ResponseWrapper.success(res, result, 'Agency details fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
