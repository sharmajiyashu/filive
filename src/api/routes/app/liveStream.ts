import { Router, Response } from 'express';
import Container from 'typedi';
import { LiveStreamService } from '../../../services/app/LiveStreamService';
import { ResponseWrapper } from '../../responseWrapper';
import AppLogger from '../../loaders/logger';
import { appAuthMiddleware } from '../../middleware/appAuthMiddleware';
import Room from '../../../models/Room';
import User from '../../../models/User';
import CoinHistory from '../../../models/CoinHistory';

export default (router: Router) => {
  const liveStreamService = Container.get(LiveStreamService);
  const liveRouter = Router();

  router.use('/room', appAuthMiddleware, liveRouter);

  /**
   * @swagger
   * /app/room/start:
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
    AppLogger.info(`[HTTP POST /app/room/start] Request received. userId=${userId}, body=${JSON.stringify(req.body)}`);
    try {
      const { title, roomType, partyRoomOption, roomTheme, announcement } = req.body;
      if (!title) {
        AppLogger.warn(`[HTTP POST /app/room/start] Missing title in body. userId=${userId}`);
        throw new Error('Title is required to start a livestream/room');
      }
      const result = await liveStreamService.startLiveStream(userId, title, roomType, partyRoomOption, roomTheme, announcement);
      AppLogger.info(`[HTTP POST /app/room/start] Success. userId=${userId}`);
      return ResponseWrapper.success(res, result, 'Livestream/Room started successfully');
    } catch (error: any) {
      AppLogger.error(`[HTTP POST /app/room/start] Failed for userId=${userId}: ${error.message}`, error);
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/room/edit:
   *   post:
   *     summary: Edit active room details
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
   *               - channelName
   *             properties:
   *               channelName:
   *                 type: string
   *               title:
   *                 type: string
   *               roomTheme:
   *                 type: string
   *               partyRoomOption:
   *                 type: string
   *                 enum: [live, chat]
   *               announcement:
   *                 type: string
   *     responses:
   *       200:
   *         description: Room details updated successfully
   */
  liveRouter.post('/edit', async (req: any, res: Response) => {
    const userId = req.user?.id;
    AppLogger.info(`[HTTP POST /app/room/edit] Request received. userId=${userId}, body=${JSON.stringify(req.body)}`);
    try {
      const { channelName, title, roomTheme, partyRoomOption, announcement } = req.body;
      if (!channelName) {
        throw new Error('channelName is required');
      }
      const result = await liveStreamService.updateLiveStream(userId, channelName, { title, roomTheme, partyRoomOption, announcement });

      // Emit room_updated socket event
      try {
        const io = Container.get('socket') as any;
        if (io) {
          io.to(`live_${channelName}`).to(`room_${channelName}`).emit('room_updated', result);
        }
      } catch (e) {
        AppLogger.error('Failed to emit room_updated socket event', e);
      }

      return ResponseWrapper.success(res, result, 'Room details updated successfully');
    } catch (error: any) {
      AppLogger.error(`[HTTP POST /app/room/edit] Failed for userId=${userId}: ${error.message}`, error);
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/room/block:
   *   post:
   *     summary: Block a user from the room (kick & block)
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
   *               - channelName
   *               - userIdToBlock
   *             properties:
   *               channelName:
   *                 type: string
   *               userIdToBlock:
   *                 type: string
   *     responses:
   *       200:
   *         description: User blocked and kicked successfully
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
   * @swagger
   * /app/room/unblock:
   *   post:
   *     summary: Unblock a user from the room
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
   *               - channelName
   *               - userIdToUnblock
   *             properties:
   *               channelName:
   *                 type: string
   *               userIdToUnblock:
   *                 type: string
   *     responses:
   *       200:
   *         description: User unblocked successfully
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
   * @swagger
   * /app/room/audience/{channelName}:
   *   get:
   *     summary: Fetch room audience list
   *     tags: [LiveStream]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: channelName
   *         required: true
   *         schema:
   *           type: string
   *         description: Channel name of the room
   *     responses:
   *       200:
   *         description: Audience list fetched successfully
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
   * @swagger
   * /app/room/seat/join:
   *   post:
   *     summary: Join a seat in a party room
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
   *               - channelName
   *               - seatIndex
   *             properties:
   *               channelName:
   *                 type: string
   *               seatIndex:
   *                 type: integer
   *     responses:
   *       200:
   *         description: Joined seat successfully
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
   * @swagger
   * /app/room/seat/leave:
   *   post:
   *     summary: Leave a seat in a party room
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
   *               - channelName
   *             properties:
   *               channelName:
   *                 type: string
   *     responses:
   *       200:
   *         description: Left seat successfully
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
   * /app/room/end:
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
    AppLogger.info(`[HTTP POST /app/room/end] Request received. userId=${userId}`);
    try {
      const result = await liveStreamService.endLiveStream(userId);
      AppLogger.info(`[HTTP POST /app/room/end] Success. userId=${userId}`);
      return ResponseWrapper.success(res, result, 'Livestream ended successfully');
    } catch (error: any) {
      AppLogger.error(`[HTTP POST /app/room/end] Failed for userId=${userId}: ${error.message}`, error);
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/room/list:
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
    AppLogger.info(`[HTTP GET /app/room/list] Request received. userId=${userId}, query=${JSON.stringify(req.query)}`);
    try {
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '10');
      const result = await liveStreamService.getActiveLiveStreams(page, limit, userId);
      AppLogger.info(`[HTTP GET /app/room/list] Success. Found ${result.streams?.length || 0} active streams.`);
      return ResponseWrapper.success(res, result, 'Active live streams fetched successfully');
    } catch (error: any) {
      AppLogger.error(`[HTTP GET /app/room/list] Failed for userId=${userId}: ${error.message}`, error);
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/room/active:
   *   get:
   *     summary: Get active room details for the logged-in host
   *     tags: [LiveStream]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Active room details fetched successfully
   */
  liveRouter.get('/active', async (req: any, res: Response) => {
    const userId = req.user?.id;
    AppLogger.info(`[HTTP GET /app/room/active] Request received. userId=${userId}`);
    try {
      const result = await liveStreamService.getActiveRoomForHost(userId);
      return ResponseWrapper.success(res, result, 'Active room details fetched successfully');
    } catch (error: any) {
      AppLogger.error(`[HTTP GET /app/room/active] Failed: ${error.message}`, error);
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/room/details/{channelName}:
   *   get:
   *     summary: Get details of any room by channelName
   *     tags: [LiveStream]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: channelName
   *         required: true
   *         schema:
   *           type: string
   *         description: Channel name of the room
   *     responses:
   *       200:
   *         description: Room details fetched successfully
   */
  liveRouter.get('/details/:channelName', async (req: any, res: Response) => {
    let { channelName } = req.params;
    if (channelName && (channelName.includes('&') || channelName.includes('?'))) {
      channelName = channelName.split(/[&?]/)[0];
    }
    AppLogger.info(`[HTTP GET /app/room/details/:channelName] Request received. channelName=${channelName}`);
    try {
      const result = await liveStreamService.getRoomDetails(channelName);
      return ResponseWrapper.success(res, result, 'Room details fetched successfully');
    } catch (error: any) {
      AppLogger.error(`[HTTP GET /app/room/details/:channelName] Failed for channelName=${channelName}: ${error.message}`, error);
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/room/contribution/{channelName}:
   *   get:
   *     summary: Get contribution rankings for a live room (paginated)
   *     tags: [LiveStream]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: channelName
   *         required: true
   *         schema:
   *           type: string
   *         description: Channel name of the room
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *         description: Page number
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *         description: Page limit
   *       - in: query
   *         name: period
   *         schema:
   *           type: string
   *           enum: [daily, weekly, all]
   *         description: Date range/period for rankings
   *     responses:
   *       200:
   *         description: Contribution ranking fetched successfully
   */
  liveRouter.get('/contribution/:channelName', async (req: any, res: Response) => {
    const userId = req.user?.id;
    try {
      let { channelName } = req.params;
      // Sanitize channelName in case client sends query params joined with & instead of ?
      if (channelName && (channelName.includes('&') || channelName.includes('?'))) {
        channelName = channelName.split(/[&?]/)[0];
      }

      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '10');
      const period = req.query.period?.toString() || 'daily'; // 'daily' | 'weekly' | 'all'

      AppLogger.info(`[HTTP GET /app/room/contribution] channelName=${channelName}, userId=${userId}, page=${page}, limit=${limit}, period=${period}`);

      const liveStream = await Room.findOne({ channelName, status: 'live' });
      if (!liveStream) {
        throw new Error('Active room not found');
      }

      const hostId = liveStream.hostId;

      // Determine date range based on period
      const now = new Date();
      let dateLimit = new Date(liveStream.startedAt); // default: since room started

      if (period === 'daily') {
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        if (oneDayAgo > dateLimit) dateLimit = oneDayAgo;
      } else if (period === 'weekly') {
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        if (oneWeekAgo > dateLimit) dateLimit = oneWeekAgo;
      }
      // 'all' → use room start time (already set)

      // Aggregate contributions from CoinHistory
      const allContributions = await CoinHistory.aggregate([
        {
          $match: {
            relatedUserId: hostId,
            type: 'transfer',
            amount: { $lt: 0 },
            createdAt: { $gte: dateLimit }
          }
        },
        {
          $group: {
            _id: '$userId',
            totalContribution: { $sum: { $abs: '$amount' } }
          }
        },
        { $sort: { totalContribution: -1 } },
        { $skip: (page - 1) * limit },
        { $limit: limit }
      ]);

      // Total contributors count (for pagination)
      const totalContributorsAgg = await CoinHistory.aggregate([
        {
          $match: {
            relatedUserId: hostId,
            type: 'transfer',
            amount: { $lt: 0 },
            createdAt: { $gte: dateLimit }
          }
        },
        { $group: { _id: '$userId' } },
        { $count: 'total' }
      ]);
      const total = totalContributorsAgg[0]?.total || 0;

      // Populate user info
      const populatedContributions = await Promise.all(
        allContributions.map(async (c: any) => {
          const user = await User.findById(c._id)
            .populate('profileImage')
            .select('name profileImage isPremium wealthCoins country');
          return {
            user,
            totalContribution: c.totalContribution
          };
        })
      );

      const result = populatedContributions.filter((c: any) => c.user !== null);

      // Calculate total gift revenue for this stream
      const giftHistories = await CoinHistory.find({ channelName: liveStream.channelName, type: 'charm_received' });
      const totalGiftRevenue = giftHistories.reduce((sum, history) => sum + Math.abs(history.amount), 0);

      AppLogger.info(`[HTTP GET /app/room/contribution] Success. channelName=${channelName}, contributors=${result.length}`);
      return ResponseWrapper.success(res, {
        totalGiftRevenue,
        contributions: result,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      }, 'Contribution ranking fetched successfully');
    } catch (error: any) {
      AppLogger.error(`[HTTP GET /app/room/contribution] Failed: ${error.message}`, error);
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/room/history:
   *   get:
   *     summary: Get history of ended rooms/sessions
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
   *       - in: query
   *         name: hostId
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Room history fetched successfully
   */
  liveRouter.get('/history', async (req: any, res: Response) => {
    const userId = req.user?.id;
    AppLogger.info(`[HTTP GET /app/room/history] Request received. userId=${userId}, query=${JSON.stringify(req.query)}`);
    try {
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '10');
      const hostId = req.query.hostId?.toString() || undefined;
      const result = await liveStreamService.getRoomHistory(hostId, page, limit);
      AppLogger.info(`[HTTP GET /app/room/history] Success. Found ${result.streams?.length || 0} ended streams.`);
      return ResponseWrapper.success(res, result, 'Room history fetched successfully');
    } catch (error: any) {
      AppLogger.error(`[HTTP GET /app/room/history] Failed for userId=${userId}: ${error.message}`, error);
      return ResponseWrapper.error(res, error);
    }
  });
};
