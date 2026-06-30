import { Router, Response } from 'express';
import Container from 'typedi';
import { LiveStreamService } from '../../../services/app/LiveStreamService';
import { ResponseWrapper } from '../../responseWrapper';
import AppLogger from '../../loaders/logger';
import { appAuthMiddleware } from '../../middleware/appAuthMiddleware';

export default (router: Router) => {
  const liveStreamService = Container.get(LiveStreamService);
  const liveRouter = Router();

  router.use('/live', appAuthMiddleware, liveRouter);

  /**
   * @swagger
   * /app/live/start:
   *   post:
   *     summary: Start a live stream or party room
   *     tags: [LiveStream]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - title
   *             properties:
   *               title:
   *                 type: string
   *               roomType:
   *                 type: string
   *                 enum: [livestream, party_room]
   *               partyRoomOption:
   *                 type: string
   *                 enum: [live, chat]
   *               roomTheme:
   *                 type: string
   *     responses:
   *       200:
   *         description: Livestream/Room started successfully
   */
  liveRouter.post('/start', async (req: any, res: Response) => {
    const userId = req.user?.id;
    AppLogger.info(`[HTTP POST /app/live/start] Request received. userId=${userId}, body=${JSON.stringify(req.body)}`);
    try {
      const { title, roomType, partyRoomOption, roomTheme } = req.body;
      if (!title) {
        AppLogger.warn(`[HTTP POST /app/live/start] Missing title in body. userId=${userId}`);
        throw new Error('Title is required to start a livestream/room');
      }
      const result = await liveStreamService.startLiveStream(userId, title, roomType, partyRoomOption, roomTheme);
      AppLogger.info(`[HTTP POST /app/live/start] Success. userId=${userId}`);
      return ResponseWrapper.success(res, result, 'Livestream/Room started successfully');
    } catch (error: any) {
      AppLogger.error(`[HTTP POST /app/live/start] Failed for userId=${userId}: ${error.message}`, error);
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * Edit active room details
   */
  liveRouter.post('/edit', async (req: any, res: Response) => {
    const userId = req.user?.id;
    AppLogger.info(`[HTTP POST /app/live/edit] Request received. userId=${userId}, body=${JSON.stringify(req.body)}`);
    try {
      const { channelName, title, roomTheme, partyRoomOption } = req.body;
      if (!channelName) {
        throw new Error('channelName is required');
      }
      const result = await liveStreamService.updateLiveStream(userId, channelName, { title, roomTheme, partyRoomOption });

      // Emit room_updated socket event
      try {
        const io = Container.get('socket') as any;
        if (io) {
          io.to(`live_${channelName}`).emit('room_updated', result);
        }
      } catch (e) {
        AppLogger.error('Failed to emit room_updated socket event', e);
      }

      return ResponseWrapper.success(res, result, 'Room details updated successfully');
    } catch (error: any) {
      AppLogger.error(`[HTTP POST /app/live/edit] Failed for userId=${userId}: ${error.message}`, error);
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * Block a user from the room (kick & block)
   */
  liveRouter.post('/block', async (req: any, res: Response) => {
    const userId = req.user?.id;
    try {
      const { channelName, userIdToBlock } = req.body;
      if (!channelName || !userIdToBlock) {
        throw new Error('channelName and userIdToBlock are required');
      }
      const result = await liveStreamService.blockUserFromRoom(userId, channelName, userIdToBlock);
      return ResponseWrapper.success(res, result, 'User blocked and kicked successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * Unblock a user from the room
   */
  liveRouter.post('/unblock', async (req: any, res: Response) => {
    const userId = req.user?.id;
    try {
      const { channelName, userIdToUnblock } = req.body;
      if (!channelName || !userIdToUnblock) {
        throw new Error('channelName and userIdToUnblock are required');
      }
      const result = await liveStreamService.unblockUserFromRoom(userId, channelName, userIdToUnblock);
      return ResponseWrapper.success(res, result, 'User unblocked successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * Fetch room audience list
   */
  liveRouter.get('/audience/:channelName', async (req: any, res: Response) => {
    try {
      let { channelName } = req.params;
      if (channelName && (channelName.includes('&') || channelName.includes('?'))) {
        channelName = channelName.split(/[&?]/)[0];
      }
      const result = await liveStreamService.getAudienceList(channelName);
      return ResponseWrapper.success(res, result, 'Audience list fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * Join a seat in a party room
   */
  liveRouter.post('/seat/join', async (req: any, res: Response) => {
    const userId = req.user?.id;
    try {
      const { channelName, seatIndex } = req.body;
      if (!channelName || seatIndex === undefined) {
        throw new Error('channelName and seatIndex are required');
      }
      const result = await liveStreamService.joinSeat(userId, channelName, Number(seatIndex));
      return ResponseWrapper.success(res, result, 'Joined seat successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * Leave a seat in a party room
   */
  liveRouter.post('/seat/leave', async (req: any, res: Response) => {
    const userId = req.user?.id;
    try {
      const { channelName } = req.body;
      if (!channelName) {
        throw new Error('channelName is required');
      }
      const result = await liveStreamService.leaveSeat(userId, channelName);
      return ResponseWrapper.success(res, result, 'Left seat successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/live/end:
   *   post:
   *     summary: End active live stream
   *     tags: [LiveStream]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Livestream ended successfully
   */
  liveRouter.post('/end', async (req: any, res: Response) => {
    const userId = req.user?.id;
    AppLogger.info(`[HTTP POST /app/live/end] Request received. userId=${userId}`);
    try {
      const result = await liveStreamService.endLiveStream(userId);
      AppLogger.info(`[HTTP POST /app/live/end] Success. userId=${userId}`);
      return ResponseWrapper.success(res, result, 'Livestream ended successfully');
    } catch (error: any) {
      AppLogger.error(`[HTTP POST /app/live/end] Failed for userId=${userId}: ${error.message}`, error);
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/live/list:
   *   get:
   *     summary: Get all active live streams
   *     tags: [LiveStream]
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
   *         description: Active live streams fetched successfully
   */
  liveRouter.get('/list', async (req: any, res: Response) => {
    const userId = req.user?.id;
    AppLogger.info(`[HTTP GET /app/live/list] Request received. userId=${userId}, query=${JSON.stringify(req.query)}`);
    try {
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '10');
      const result = await liveStreamService.getActiveLiveStreams(page, limit);
      AppLogger.info(`[HTTP GET /app/live/list] Success. Found ${result.streams?.length || 0} active streams.`);
      return ResponseWrapper.success(res, result, 'Active live streams fetched successfully');
    } catch (error: any) {
      AppLogger.error(`[HTTP GET /app/live/list] Failed for userId=${userId}: ${error.message}`, error);
      return ResponseWrapper.error(res, error);
    }
  });
};
