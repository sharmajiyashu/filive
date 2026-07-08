import { Router, Response } from 'express';
import Container from 'typedi';
import { GiftService } from '../../../services/app/GiftService';
import { ResponseWrapper } from '../../responseWrapper';
import { appAuthMiddleware } from '../../middleware/appAuthMiddleware';
import Room from '../../../models/Room';

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
      const { channelName, giftId, receiverId, contextType, quantity } = req.body;
      if (!giftId) {
        throw new Error('giftId is required');
      }

      let actualReceiverId = receiverId;
      if (!actualReceiverId && channelName) {
        const liveStream = await Room.findOne({ channelName, status: 'live' });
        if (liveStream) {
          actualReceiverId = liveStream.hostId.toString();
        }
      }

      if (!actualReceiverId) {
        throw new Error('receiverId is required');
      }

      const parsedQuantity = quantity ? Number(quantity) : 1;
      const result = await giftService.sendGift(req.user.id, channelName, giftId, actualReceiverId, contextType, parsedQuantity);

      // Try to emit the socket event for realtime updates
      try {
        const io = Container.get('socket') as any;
        if (io) {
          if (channelName) {
            io.to(`live_${channelName}`).to(`room_${channelName}`).emit('gift_sent', {
              sender: result.sender,
              host: result.host,
              receiver: result.receiver,
              gift: result.gift,
              quantity: result.quantity,
              createdAt: new Date(),
            });
          } else {
            // Direct/personal gift: Emit to both sender and receiver's private rooms
            const eventPayload = {
              sender: result.sender,
              receiver: result.receiver,
              gift: result.gift,
              quantity: result.quantity,
              contextType: contextType || 'direct',
              createdAt: new Date(),
            };
            io.to(`user_${req.user.id}`).emit('personal_gift_sent', eventPayload);
            io.to(`user_${actualReceiverId}`).emit('personal_gift_received', eventPayload);
          }
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
      let { channelName } = req.params;
      if (!channelName) {
        throw new Error('channelName parameter is required');
      }
      if (channelName && (channelName.includes('&') || channelName.includes('?'))) {
        channelName = channelName.split(/[&?]/)[0];
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
      let { channelName } = req.params;
      if (!channelName) {
        throw new Error('channelName parameter is required');
      }
      if (channelName && (channelName.includes('&') || channelName.includes('?'))) {
        channelName = channelName.split(/[&?]/)[0];
      }
      const result = await giftService.getEligibleReceivers(req.user.id, channelName);
      return ResponseWrapper.success(res, result, 'Eligible gift receivers fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
