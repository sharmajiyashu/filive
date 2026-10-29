import { Router, Response } from 'express';
import Container from 'typedi';
import { CallService } from '../../../services/app/CallService';
import { RandomMatchService } from '../../../services/app/RandomMatchService';
import { ResponseWrapper } from '../../responseWrapper';

import { HostFeedService } from '../../../services/app/HostFeedService';

export default (router: Router) => {
  const callService = Container.get(CallService);
  const hostFeedService = Container.get(HostFeedService);
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
   * /app/calls/hosts/new:
   *   get:
   *     summary: Get promoted new hosts (first 7 days with decay boost)
   *     tags: [Calls]
   */
  callRouter.get('/hosts/new', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page?.toString() || '1', 10);
      const limit = parseInt(req.query.limit?.toString() || '10', 10);
      const callType = (req.query.callType || 'both') as 'voice' | 'video' | 'both';
      const country = (req.query.country || req.query.countryId || req.query.countryCode)?.toString();
      const userId = req.user.id;
      const result = await hostFeedService.getNewFeed({ callerId: userId, page, limit, callType, countryCode: country });
      return ResponseWrapper.success(res, result, 'New hosts fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/calls/hosts:
   *   get:
   *     summary: Get hosts available for voice/video calling using 100-point ranking system
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
   *           enum: [voice, video, new, popular]
   *         description: Filter hosts by enabled call type
   *       - in: query
   *         name: tab
   *         schema:
   *           type: string
   *           enum: [meet, talk, new, popular]
   *       - in: query
   *         name: country
   *         schema:
   *           type: string
   *         description: Filter hosts by country (name, ISO code, or countryId)
   *       - in: query
   *         name: countryId
   *         schema:
   *           type: string
   *         description: Filter hosts by countryId
   *       - in: query
   *         name: countryCode
   *         schema:
   *           type: string
   *         description: Filter hosts by ISO country code
   *     responses:
   *       200:
   *         description: Calling hosts fetched successfully
   */
  callRouter.get('/hosts', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page?.toString() || '1', 10);
      const limit = parseInt(req.query.limit?.toString() || '10', 10);
      const callType = req.query.callType?.toString()?.toLowerCase();
      const tab = (req.query.tab || req.query.type)?.toString()?.toLowerCase();
      const country = (req.query.country || req.query.countryId || req.query.countryCode)?.toString();
      const userId = req.user.id;

      let result;
      if (tab === 'new' || callType === 'new') {
        result = await hostFeedService.getNewFeed({ callerId: userId, page, limit, callType: 'both', countryCode: country });
      } else if (tab === 'popular' || callType === 'popular') {
        result = await hostFeedService.getPopularFeed({ callerId: userId, page, limit, countryCode: country });
      } else if (callType === 'voice' || tab === 'talk') {
        result = await hostFeedService.getTalkFeed({ callerId: userId, page, limit, countryCode: country });
      } else if (callType === 'video' || tab === 'meet') {
        result = await hostFeedService.getMeetFeed({ callerId: userId, page, limit, countryCode: country });
      } else {
        result = await callService.getCallingHosts(page, limit, userId, callType as any, country);
      }

      return ResponseWrapper.success(res, result, 'Calling hosts fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/calls/available-hosts:
   *   get:
   *     summary: Get female hosts currently opted into random video/voice match
   *     tags: [Calls]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: callType
   *         schema:
   *           type: string
   *           enum: [voice, video]
   *     responses:
   *       200:
   *         description: Available random-match hosts
   */
  callRouter.get('/available-hosts', async (req: any, res: Response) => {
    try {
      const callType = req.query.callType as 'voice' | 'video' | undefined;
      if (callType && !['voice', 'video'].includes(callType)) {
        throw new Error('Invalid callType filter. Use "voice" or "video".');
      }
      const randomMatchService = Container.get(RandomMatchService);
      const result = await randomMatchService.getAvailableHostProfiles(callType, req.user.id);
      return ResponseWrapper.success(res, result, 'Available hosts fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/random-match/available-hosts:
   *   get:
   *     summary: Get female hosts currently opted into random video/voice match
   *     tags: [Calls]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: callType
   *         schema:
   *           type: string
   *           enum: [voice, video]
   */
  router.get('/random-match/available-hosts', async (req: any, res: Response) => {
    try {
      const callType = req.query.callType as 'voice' | 'video' | undefined;
      if (callType && !['voice', 'video'].includes(callType)) {
        throw new Error('Invalid callType filter. Use "voice" or "video".');
      }
      const randomMatchService = Container.get(RandomMatchService);
      const result = await randomMatchService.getAvailableHostProfiles(callType, req.user.id);
      return ResponseWrapper.success(res, result, 'Available hosts fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/calls/{callId}/end:
   *   post:
   *     summary: End a call and return role-specific after-call summary
   *     description: >
   *       Caller sees coinsSpent and remainingCoins (viewerWallet=coins). Host sees beansIncome
   *       and beansBalance (viewerWallet=beans). Use displayCallId on the After Call screen
   *       (e.g. Call #55FF0EA). Full callId stays in the payload for API follow-up.
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
   *         description: After-call summary for the current user
   */
  callRouter.post('/:callId/end', async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const callId = req.params.callId;
      const call = await callService.endCall(userId, callId);
      const result = await callService.buildAfterCallSummary(call, userId);
      return ResponseWrapper.success(res, result, 'Call ended successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/calls/{callId}:
   *   get:
   *     summary: Get after-call summary for the logged-in caller or host
   *     description: >
   *       Role-aware compact payload. Caller gets coinsSpent + remainingCoins (viewerWallet=coins).
   *       Host gets beansIncome + beansBalance (viewerWallet=beans). Use displayCallId on the After Call screen.
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
   *         description: After-call summary fetched successfully
   */
  callRouter.get('/:callId', async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const callId = req.params.callId;
      const result = await callService.getAfterCallView(userId, callId);
      return ResponseWrapper.success(res, result, 'Call details fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
