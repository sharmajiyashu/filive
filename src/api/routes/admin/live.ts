import { Router, Response } from 'express';
import Container from 'typedi';
import { LiveStreamService } from '../../../services/app/LiveStreamService';
import { AdminLiveService } from '../../../services/admin/AdminLiveService';
import { ResponseWrapper } from '../../responseWrapper';
import { adminAuthMiddleware } from '../../middleware/adminAuthMiddleware';
import Room from '../../../models/Room';
import User from '../../../models/User';
import CoinHistory from '../../../models/CoinHistory';

export default (router: Router) => {
  const liveStreamService = Container.get(LiveStreamService);
  const adminLiveService = Container.get(AdminLiveService);
  const liveRouter = Router();

  router.use('/live', adminAuthMiddleware, liveRouter);

  liveRouter.get('/list', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '10');
      const country = (req.query.country || req.query.countryId || req.query.countryCode)?.toString();
      const search = req.query.search?.toString();
      const roomTypeParam = req.query.roomType?.toString();
      const roomType =
        roomTypeParam === 'livestream' || roomTypeParam === 'party_room' ? roomTypeParam : undefined;

      const result = await adminLiveService.getActiveList({ page, limit, country, search, roomType });
      return ResponseWrapper.success(res, result, 'Active live streams/rooms fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  liveRouter.get('/stats', async (req: any, res: Response) => {
    try {
      const roomTypeParam = req.query.roomType?.toString();
      const roomType =
        roomTypeParam === 'livestream' || roomTypeParam === 'party_room' ? roomTypeParam : undefined;
      const result = await adminLiveService.getActiveStats(roomType);
      return ResponseWrapper.success(res, result, 'Live stats fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  liveRouter.get('/details/:channelName', async (req: any, res: Response) => {
    try {
      let { channelName } = req.params;
      if (channelName && (channelName.includes('&') || channelName.includes('?'))) {
        channelName = channelName.split(/[&?]/)[0];
      }
      const result = await adminLiveService.getDetails(channelName);
      return ResponseWrapper.success(res, result, 'Live details fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  liveRouter.get('/history/stats', async (_req: any, res: Response) => {
    try {
      const result = await adminLiveService.getHistoryStats();
      return ResponseWrapper.success(res, result, 'Live history stats fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  liveRouter.get('/history', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '10');
      const search = req.query.search?.toString();
      const roomTypeParam = (req.query.roomType || req.query.liveType)?.toString();
      const roomType =
        roomTypeParam === 'livestream' || roomTypeParam === 'party_room'
          ? roomTypeParam
          : roomTypeParam === 'all'
            ? 'all'
            : undefined;
      const result = await adminLiveService.getHistory({ page, limit, search, roomType });
      return ResponseWrapper.success(res, result, 'Live history fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  liveRouter.get('/bans/stats', async (_req: any, res: Response) => {
    try {
      const result = await adminLiveService.getBanStats();
      return ResponseWrapper.success(res, result, 'Live ban stats fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  liveRouter.get('/bans', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '10');
      const search = req.query.search?.toString();
      const status = req.query.status?.toString();
      const result = await adminLiveService.getBans({ page, limit, search, status });
      return ResponseWrapper.success(res, result, 'Live bans fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  liveRouter.post('/ban', async (req: any, res: Response) => {
    try {
      const { userId, reason, banType, expiresAt, endActiveRooms } = req.body;
      if (!userId) throw new Error('userId is required');
      const result = await adminLiveService.banUser({
        userId,
        adminId: req.user.id,
        reason,
        banType,
        expiresAt,
        endActiveRooms,
      });
      return ResponseWrapper.success(res, result, 'User banned from live streaming');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  liveRouter.delete('/bans/:id', async (req: any, res: Response) => {
    try {
      const result = await adminLiveService.unbanUser(req.params.id);
      return ResponseWrapper.success(res, result, 'User unbanned from live streaming');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  liveRouter.post('/start', async (req: any, res: Response) => {
    try {
      const { hostId, title, roomType, partyRoomOption, roomTheme } = req.body;
      if (!hostId || !title) {
        throw new Error('Host user ID and room title are required');
      }
      const result = await liveStreamService.startLiveStream(
        hostId,
        title,
        roomType || 'party_room',
        partyRoomOption || 'live',
        roomTheme
      );
      return ResponseWrapper.success(res, result, 'Room started successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  liveRouter.put('/:id', async (req: any, res: Response) => {
    try {
      const { id } = req.params;
      const { title, announcement, roomType, partyRoomOption, maxSeats, roomTheme, status } = req.body;
      const result = await adminLiveService.updateRoom(id, {
        title,
        announcement,
        roomType,
        partyRoomOption,
        maxSeats: maxSeats !== undefined ? Number(maxSeats) : undefined,
        roomTheme,
        status,
      });
      return ResponseWrapper.success(res, result, 'Room updated successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  liveRouter.put('/update/:channelName', async (req: any, res: Response) => {
    try {
      const { channelName } = req.params;
      const { title, announcement, roomType, partyRoomOption, maxSeats, roomTheme, status } = req.body;
      const result = await adminLiveService.updateRoom(channelName, {
        title,
        announcement,
        roomType,
        partyRoomOption,
        maxSeats: maxSeats !== undefined ? Number(maxSeats) : undefined,
        roomTheme,
        status,
      });
      return ResponseWrapper.success(res, result, 'Room updated successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  liveRouter.delete('/:id', async (req: any, res: Response) => {
    try {
      const streamId = req.params.id;
      const permanent = req.query.permanent === 'true';
      const result = await adminLiveService.endOrDeleteRoom(streamId, permanent);
      return ResponseWrapper.success(res, result, result.message || 'Room ended successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  liveRouter.post('/:id/end', async (req: any, res: Response) => {
    try {
      const streamId = req.params.id;
      const result = await adminLiveService.endOrDeleteRoom(streamId, false);
      return ResponseWrapper.success(res, result, 'Room ended successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  liveRouter.post('/seat/leave', async (req: any, res: Response) => {
    try {
      const { channelName, userId, seatIndex } = req.body;
      if (!channelName || (!userId && seatIndex === undefined)) {
        throw new Error('channelName and userId or seatIndex are required');
      }
      const result = await liveStreamService.leaveSeat(
        userId || '',
        channelName,
        req.user?.id || 'admin',
        seatIndex !== undefined ? Number(seatIndex) : undefined
      );
      return ResponseWrapper.success(res, result, 'User removed from seat successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  liveRouter.post('/kick', async (req: any, res: Response) => {
    try {
      const { channelName, userIdToKick } = req.body;
      if (!channelName || !userIdToKick) {
        throw new Error('channelName and userIdToKick are required');
      }
      const result = await liveStreamService.kickUser(
        req.user?.id || 'admin',
        channelName,
        userIdToKick
      );
      return ResponseWrapper.success(res, result, 'User kicked from room successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  liveRouter.post('/block', async (req: any, res: Response) => {
    try {
      const { channelName, userIdToBlock } = req.body;
      if (!channelName || !userIdToBlock) {
        throw new Error('channelName and userIdToBlock are required');
      }
      const room = await liveStreamService.blockUserFromRoom(
        req.user?.id || 'admin',
        channelName,
        userIdToBlock
      );
      return ResponseWrapper.success(res, room, 'User blocked and kicked from room successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  liveRouter.post('/unblock', async (req: any, res: Response) => {
    try {
      const { channelName, userIdToUnblock } = req.body;
      if (!channelName || !userIdToUnblock) {
        throw new Error('channelName and userIdToUnblock are required');
      }
      const room = await Room.findOneAndUpdate(
        { channelName },
        { $pull: { blockedUsers: userIdToUnblock } },
        { new: true }
      );
      if (!room) {
        throw new Error('Room not found');
      }
      return ResponseWrapper.success(res, room, 'User unblocked in room successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  liveRouter.get('/audience/:channelName', async (req: any, res: Response) => {
    try {
      let { channelName } = req.params;
      if (channelName && (channelName.includes('&') || channelName.includes('?'))) {
        channelName = channelName.split(/[&?]/)[0];
      }
      const liveStream = await Room.findOne({ channelName, status: 'live' }).populate({
        path: 'viewers',
        select: 'userId name profileImage email mobile isPremium wealthCoins charmCoins gender country location',
        populate: { path: 'profileImage' },
      });

      if (!liveStream) {
        throw new Error('Active room not found');
      }

      const validViewers = (liveStream.viewers || []).filter((u: any) => u != null);
      const viewersWithIndex = validViewers.map((user: any, index: number) => ({
        user,
        joinIndex: index,
      }));

      viewersWithIndex.sort((a: any, b: any) => {
        const uA = a.user;
        const uB = b.user;
        if (!uA && !uB) return 0;
        if (!uA) return 1;
        if (!uB) return -1;
        if (uA.isPremium && !uB.isPremium) return -1;
        if (!uA.isPremium && uB.isPremium) return 1;
        const levelA = uA.wealthCoins || 0;
        const levelB = uB.wealthCoins || 0;
        if (levelA !== levelB) return levelB - levelA;
        return a.joinIndex - b.joinIndex;
      });

      const hostIdStr = liveStream.hostId ? liveStream.hostId.toString() : '';
      const sortedUsers = viewersWithIndex.map((item: any) => {
        const userObj = item.user.toObject ? item.user.toObject() : item.user;
        return {
          ...userObj,
          isHost: userObj._id ? userObj._id.toString() === hostIdStr : false,
        };
      });

      return ResponseWrapper.success(res, sortedUsers, 'Audience fetched and sorted successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  liveRouter.get('/contribution/:channelName', async (req: any, res: Response) => {
    try {
      let { channelName } = req.params;
      if (channelName && (channelName.includes('&') || channelName.includes('?'))) {
        channelName = channelName.split(/[&?]/)[0];
      }
      const period = req.query.period?.toString() || 'daily';

      const liveStream = await Room.findOne({ channelName, status: 'live' });
      if (!liveStream) {
        throw new Error('Active room not found');
      }

      const hostId = liveStream.hostId;
      const now = new Date();
      let dateLimit = new Date(liveStream.startedAt);

      if (period === 'daily') {
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        if (oneDayAgo > dateLimit) dateLimit = oneDayAgo;
      } else if (period === 'weekly') {
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        if (oneWeekAgo > dateLimit) dateLimit = oneWeekAgo;
      }

      const contributions = await CoinHistory.aggregate([
        {
          $match: {
            relatedUserId: hostId,
            type: 'transfer',
            amount: { $lt: 0 },
            createdAt: { $gte: dateLimit },
          },
        },
        {
          $group: {
            _id: '$userId',
            totalContribution: { $sum: { $abs: '$amount' } },
          },
        },
        { $sort: { totalContribution: -1 } },
      ]);

      const populatedContributions = await Promise.all(
        contributions.map(async (c: any) => {
          const user = await User.findById(c._id)
            .populate('profileImage')
            .select('userId name profileImage isPremium wealthCoins country');
          return { user, totalContribution: c.totalContribution };
        })
      );

      const result = populatedContributions.filter((c: any) => c.user !== null);
      const giftHistories = await CoinHistory.find({
        channelName: liveStream.channelName,
        type: 'charm_received',
      });
      const totalGiftRevenue = giftHistories.reduce((sum, history) => sum + Math.abs(history.amount), 0);

      return ResponseWrapper.success(
        res,
        { totalGiftRevenue, contributions: result },
        'Contribution ranking fetched successfully'
      );
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
