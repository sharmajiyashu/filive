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
   *     summary: Get Live Data statistics for the authenticated host (Daily/Monthly)
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
   *         description: Selected date in YYYY-MM-DD or month in YYYY-MM format
   *     responses:
   *       200:
   *         description: Live Data stats fetched successfully
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
   *     summary: Log/Update Live Data statistics (Internal/Socket/App update)
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
   *               totalBeansIncome:
   *                 type: number
   *               totalCallIncome:
   *                 type: number
   *               liveBeansIncome:
   *                 type: number
   *               partyBeansIncome:
   *                 type: number
   *               liveDurationSeconds:
   *                 type: number
   *               totalDurationSeconds:
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
