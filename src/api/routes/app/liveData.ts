import { Router, Response } from 'express';
import Container from 'typedi';
import { LiveDataService } from '../../../services/app/LiveDataService';
import { ResponseWrapper } from '../../responseWrapper';

export default (router: Router) => {
  const liveDataService = Container.get(LiveDataService);
  const appRouter = Router();

  router.use('/live-data', appRouter);

  /**
   * @swagger
   * /app/live-data:
   *   get:
   *     summary: Get Live Data statistics computed from gifts, live sessions, and party rooms
   *     description: >
   *       Server-computed daily/monthly stats from CoinHistory, Room, and Call records.
   *       Live Beans Income and Party Beans Income are beans actually received
   *       (charm_received / gift_received) in livestream or party rooms — never sender
   *       spend. Call UI still uses gender for accountRole, coinsSpent, and uniqueHosts.
   *       Client logs never count as revenue. Response keys are stable for Flutter mapping.
   *     tags: [Live Data]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: type
   *         schema:
   *           type: string
   *           enum: [daily, monthly]
   *         description: Filter view type (daily or monthly, default daily)
   *       - in: query
   *         name: date
   *         schema:
   *           type: string
   *         description: Selected date in YYYY-MM-DD (daily) or month in YYYY-MM (monthly)
   *     responses:
   *       200:
   *         description: Live Data stats fetched successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   properties:
   *                     accountRole:
   *                       type: string
   *                       enum: [host, caller]
   *                     type:
   *                       type: string
   *                       enum: [daily, monthly]
   *                     selectedDate:
   *                       type: string
   *                     selectedMonth:
   *                       type: string
   *                     summary:
   *                       type: object
   *                       properties:
   *                         totalBeansIncome:
   *                           type: number
   *                     callData:
   *                       type: object
   *                       properties:
   *                         totalBeansIncome:
   *                           type: number
   *                         totalCallIncome:
   *                           type: number
   *                         voiceIncome:
   *                           type: number
   *                         videoIncome:
   *                           type: number
   *                         coinsSpent:
   *                           type: number
   *                         totalCalls:
   *                           type: number
   *                         totalDuration:
   *                           type: string
   *                         totalDurationSeconds:
   *                           type: number
   *                         giftSenders:
   *                           type: number
   *                         uniqueCallers:
   *                           type: number
   *                         uniqueHosts:
   *                           type: number
   *                         repeatUsers:
   *                           type: number
   *                     liveStreamData:
   *                       type: object
   *                       properties:
   *                         liveBeansIncome:
   *                           type: number
   *                         eHours:
   *                           type: number
   *                         viewers:
   *                           type: number
   *                         liveDuration:
   *                           type: string
   *                         liveDurationSeconds:
   *                           type: number
   *                         giftSenders:
   *                           type: number
   *                     partyRoomData:
   *                       type: object
   *                       properties:
   *                         partyBeansIncome:
   *                           type: number
   *                         roomOwnerHour:
   *                           type: string
   *                         roomOwnerSeconds:
   *                           type: number
   *                         eHours:
   *                           type: number
   *                         totalMicHour:
   *                           type: string
   *                         totalMicSeconds:
   *                           type: number
   *                         eDay:
   *                           type: number
   *                         userOnMic:
   *                           type: number
   *                         audience:
   *                           type: number
   *                         giftSenders:
   *                           type: number
   */
  appRouter.get('/', async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const type = (req.query.type as 'daily' | 'monthly') || 'daily';
      const date = req.query.date?.toString();

      const data = await liveDataService.getLiveData(userId, date, type);
      return ResponseWrapper.success(res, data, 'Live Data fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/live-data/log:
   *   post:
   *     summary: Optional internal increment for Live Data log (session/mic helpers)
   *     description: >
   *       Optional/internal session and mic logging only. Income fields
   *       (totalCallIncome, totalBeansIncome, liveBeansIncome, partyBeansIncome, voiceIncome, videoIncome)
   *       are ignored so the client cannot write Call Revenue.
   *     tags: [Live Data]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               date:
   *                 type: string
   *               liveDurationSeconds:
   *                 type: number
   *               totalDurationSeconds:
   *                 type: number
   *               liveGiftSendersCount:
   *                 type: number
   *               partyGiftSendersCount:
   *                 type: number
   *               partyEDay:
   *                 type: number
   *     responses:
   *       200:
   *         description: Live Data updated successfully
   */
  appRouter.post('/log', async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const result = await liveDataService.updateLiveData(userId, req.body);
      return ResponseWrapper.success(res, result, 'Live Data updated successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
