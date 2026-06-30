import { Router, Response } from 'express';
import Container from 'typedi';
import { GiftService } from '../../../services/app/GiftService';
import { ResponseWrapper } from '../../responseWrapper';
import { appAuthMiddleware } from '../../middleware/appAuthMiddleware';
import LiveStream from '../../../models/LiveStream';

export default (router: Router) => {
  const giftService = Container.get(GiftService);
  const giftRouter = Router();

  router.use('/gift', appAuthMiddleware, giftRouter);

  giftRouter.get('/list', async (req: any, res: Response) => {
    try {
      const type = req.query.type?.toString();
      const result = await giftService.getActiveGifts(type);
      return ResponseWrapper.success(res, result, 'Gifts fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  giftRouter.post('/send', async (req: any, res: Response) => {
    try {
      const { channelName, giftId, receiverId, contextType } = req.body;
      if (!giftId) {
        throw new Error('giftId is required');
      }

      let actualReceiverId = receiverId;
      if (!actualReceiverId && channelName) {
        const liveStream = await LiveStream.findOne({ channelName, status: 'live' });
        if (liveStream) {
          actualReceiverId = liveStream.hostId.toString();
        }
      }

      if (!actualReceiverId) {
        throw new Error('receiverId is required');
      }

      const result = await giftService.sendGift(req.user.id, channelName, giftId, actualReceiverId, contextType);
      
      // Try to emit the socket event for realtime updates
      try {
        const io = Container.get('socket') as any;
        if (io) {
          const roomName = `live_${channelName}`;
          io.to(roomName).emit('gift_sent', {
            sender: result.sender,
            host: result.host,
            receiver: result.receiver,
            gift: result.gift,
            createdAt: new Date(),
          });
        }
      } catch (ioError) {
        // Log error but do not fail the request
        console.error('Failed to emit gift_sent socket event', ioError);
      }

      return ResponseWrapper.success(res, result, 'Gift sent successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * Get the list of users in this room whom the current user has sent gifts to
   */
  giftRouter.get('/sent-recipients/:channelName', async (req: any, res: Response) => {
    try {
      const { channelName } = req.params;
      if (!channelName) {
        throw new Error('channelName parameter is required');
      }
      const result = await giftService.getGiftedUsersInRoom(req.user.id, channelName);
      return ResponseWrapper.success(res, result, 'Gifted users list fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * Get the list of users in this room eligible to receive gifts from the current user
   */
  giftRouter.get('/eligible-receivers/:channelName', async (req: any, res: Response) => {
    try {
      const { channelName } = req.params;
      if (!channelName) {
        throw new Error('channelName parameter is required');
      }
      const result = await giftService.getEligibleReceivers(req.user.id, channelName);
      return ResponseWrapper.success(res, result, 'Eligible gift receivers fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
