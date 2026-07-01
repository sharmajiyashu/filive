import { Router, Response } from 'express';
import Container from 'typedi';
import { LiveStreamService } from '../../../services/app/LiveStreamService';
import { ResponseWrapper } from '../../responseWrapper';
import { adminAuthMiddleware } from '../../middleware/adminAuthMiddleware';
import LiveStream from '../../../models/LiveStream';
import User from '../../../models/User';
import CoinHistory from '../../../models/CoinHistory';

export default (router: Router) => {
  const liveStreamService = Container.get(LiveStreamService);
  const liveRouter = Router();

  router.use('/live', adminAuthMiddleware, liveRouter);

  // List all active streams/rooms
  liveRouter.get('/list', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '10');
      const result = await liveStreamService.getActiveLiveStreams(page, limit);
      return ResponseWrapper.success(res, result, 'Active live streams/rooms fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  // Start / Create a room (e.g. party_room)
  liveRouter.post('/start', async (req: any, res: Response) => {
    try {
      const { hostId, title, roomType, partyRoomOption, roomTheme } = req.body;
      if (!hostId || !title) {
        throw new Error('Host user ID and room title are required');
      }
      const result = await liveStreamService.startLiveStream(hostId, title, roomType || 'party_room', partyRoomOption || 'live', roomTheme);
      return ResponseWrapper.success(res, result, 'Room started successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  // End / Delete a room
  liveRouter.delete('/:id', async (req: any, res: Response) => {
    try {
      const streamId = req.params.id;
      const liveStream = await LiveStream.findById(streamId);
      if (!liveStream) {
        throw new Error('Room not found');
      }
      const result = await liveStreamService.endLiveStream(liveStream.hostId.toString(), liveStream.channelName);
      return ResponseWrapper.success(res, result, 'Room ended successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  // Get audience sorted by priority logic
  liveRouter.get('/audience/:channelName', async (req: any, res: Response) => {
    try {
      let { channelName } = req.params;
      if (channelName && (channelName.includes('&') || channelName.includes('?'))) {
        channelName = channelName.split(/[&?]/)[0];
      }
      const liveStream = await LiveStream.findOne({ channelName, status: 'live' })
        .populate({
          path: 'viewers',
          select: 'userId name profileImage email mobile isPremium wealthCoins charmCoins gender country location',
          populate: {
            path: 'profileImage'
          }
        });

      if (!liveStream) {
        throw new Error('Active room not found');
      }

      // Map to preserve original join order (index in the viewers array)
      const viewersWithIndex = liveStream.viewers.map((user: any, index: number) => {
        return {
          user,
          joinIndex: index
        };
      });

      // Sorting logic
      viewersWithIndex.sort((a: any, b: any) => {
        const uA = a.user;
        const uB = b.user;

        // 1. VIP (isPremium) users first
        if (uA.isPremium && !uB.isPremium) return -1;
        if (!uA.isPremium && uB.isPremium) return 1;

        // 2 & 3. Sort by Rich Level (wealthCoins) highest -> lowest
        const levelA = uA.wealthCoins || 0;
        const levelB = uB.wealthCoins || 0;
        if (levelA !== levelB) {
          return levelB - levelA; // Highest -> Lowest
        }

        // 5. If same Rich Level, sort by join order (earlier index first)
        return a.joinIndex - b.joinIndex;
      });

      // Extract the sorted users
      const hostIdStr = liveStream.hostId.toString();
      const sortedUsers = viewersWithIndex.map((item: any) => {
        const userObj = item.user.toObject ? item.user.toObject() : item.user;
        return {
          ...userObj,
          isHost: userObj._id ? userObj._id.toString() === hostIdStr : false
        };
      });

      return ResponseWrapper.success(res, sortedUsers, 'Audience fetched and sorted successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  // Get contribution rankings for a room
  liveRouter.get('/contribution/:channelName', async (req: any, res: Response) => {
    try {
      let { channelName } = req.params;
      if (channelName && (channelName.includes('&') || channelName.includes('?'))) {
        channelName = channelName.split(/[&?]/)[0];
      }
      const period = req.query.period?.toString() || 'daily'; // 'daily' | 'weekly'

      const liveStream = await LiveStream.findOne({ channelName, status: 'live' });
      if (!liveStream) {
        throw new Error('Active room not found');
      }

      const hostId = liveStream.hostId;

      // Determine date limit
      const now = new Date();
      let dateLimit = new Date(liveStream.startedAt); // default to when room started

      if (period === 'daily') {
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        if (oneDayAgo > dateLimit) {
          dateLimit = oneDayAgo;
        }
      } else if (period === 'weekly') {
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        if (oneWeekAgo > dateLimit) {
          dateLimit = oneWeekAgo;
        }
      }

      // Aggregate CoinHistory
      const contributions = await CoinHistory.aggregate([
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
        {
          $sort: { totalContribution: -1 }
        }
      ]);

      // Populate user info for each contributor
      const populatedContributions = await Promise.all(
        contributions.map(async (c: any) => {
          const user = await User.findById(c._id)
            .populate('profileImage')
            .select('userId name profileImage isPremium wealthCoins country');
          return {
            user,
            totalContribution: c.totalContribution
          };
        })
      );

      const result = populatedContributions.filter((c: any) => c.user !== null);

      return ResponseWrapper.success(res, result, 'Contribution ranking fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
