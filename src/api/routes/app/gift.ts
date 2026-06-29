import { Router, Response } from 'express';
import Container from 'typedi';
import { GiftService } from '../../../services/app/GiftService';
import { ResponseWrapper } from '../../responseWrapper';
import { appAuthMiddleware } from '../../middleware/appAuthMiddleware';

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
      const { channelName, giftId } = req.body;
      if (!channelName || !giftId) {
        throw new Error('channelName and giftId are required');
      }
      const result = await giftService.sendGift(req.user.id, channelName, giftId);
      
      // Try to emit the socket event for realtime updates
      try {
        const io = Container.get('socket') as any;
        if (io) {
          const roomName = `live_${channelName}`;
          io.to(roomName).emit('gift_sent', {
            sender: result.sender,
            host: result.host,
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
};
