import { Router, Response } from 'express';
import Container from 'typedi';
import { LiveDataService } from '../../../services/app/LiveDataService';
import { ResponseWrapper } from '../../responseWrapper';

export default (router: Router) => {
  const liveDataService = Container.get(LiveDataService);
  const liveDataRouter = Router();

  router.use('/live-data', liveDataRouter);

  /**
   * @swagger
   * /admin/live-data:
   *   get:
   *     summary: Platform Live / Party / Call revenue for a day or month
   *     tags: [Admin - Live Data]
   *     parameters:
   *       - in: query
   *         name: type
   *         schema:
   *           type: string
   *           enum: [daily, monthly]
   *       - in: query
   *         name: date
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Platform live data fetched successfully
   */
  liveDataRouter.get('/', async (req: any, res: Response) => {
    try {
      const type = (req.query.type as 'daily' | 'monthly') || 'daily';
      const date = req.query.date?.toString();
      const data = await liveDataService.getPlatformLiveData(date, type);
      return ResponseWrapper.success(res, data, 'Live Data fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
