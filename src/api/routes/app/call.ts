import { Router, Response } from 'express';
import Container from 'typedi';
import { CallService } from '../../../services/app/CallService';
import { ResponseWrapper } from '../../responseWrapper';

export default (router: Router) => {
  const callService = Container.get(CallService);
  const callRouter = Router();

  router.use('/calls', callRouter);

  /**
   * @swagger
   * /app/calls/history:
   *   get:
   *     summary: Get call history of the logged-in user
   *     tags: [Calls]
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
   *         description: Call history fetched successfully
   */
  callRouter.get('/history', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page?.toString() || '1', 10);
      const limit = parseInt(req.query.limit?.toString() || '20', 10);
      const userId = req.user.id;
      const result = await callService.getCallHistory(userId, page, limit);
      return ResponseWrapper.success(res, result, 'Call history fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/calls/hosts:
   *   get:
   *     summary: Get hosts available for voice/video calling
   *     tags: [Calls]
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
   *       - in: query
   *         name: callType
   *         schema:
   *           type: string
   *           enum: [voice, video]
   *         description: Filter hosts by enabled call type
   *     responses:
   *       200:
   *         description: Calling hosts fetched successfully
   */
  callRouter.get('/hosts', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page?.toString() || '1', 10);
      const limit = parseInt(req.query.limit?.toString() || '10', 10);
      const callType = req.query.callType as 'voice' | 'video' | undefined;
      
      if (callType && !['voice', 'video'].includes(callType)) {
        throw new Error('Invalid callType filter. Use "voice" or "video".');
      }

      const userId = req.user.id;
      const result = await callService.getCallingHosts(page, limit, userId, callType);
      return ResponseWrapper.success(res, result, 'Calling hosts fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/calls/{callId}:
   *   get:
   *     summary: Get details of a call session
   *     tags: [Calls]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: callId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Call details fetched successfully
   */
  callRouter.get('/:callId', async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const callId = req.params.callId;
      const result = await callService.getCallDetails(userId, callId);
      return ResponseWrapper.success(res, result, 'Call details fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
