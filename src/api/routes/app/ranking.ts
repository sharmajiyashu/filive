import { Router, Response } from 'express';
import Container from 'typedi';
import { RankingService } from '../../../services/app/RankingService';
import { ResponseWrapper } from '../../responseWrapper';

export default (router: Router) => {
  const rankingRouter = Router();

  router.use('/rankings', rankingRouter);

  /**
   * @swagger
   * /app/rankings:
   *   get:
   *     summary: Get rankings for Rich or Charm categories (daily, weekly, monthly, alltime)
   *     tags: [Rankings]
   *     parameters:
   *       - in: query
   *         name: type
   *         required: true
   *         schema:
   *           type: string
   *           enum: [rich, charm]
   *       - in: query
   *         name: period
   *         required: true
   *         schema:
   *           type: string
   *           enum: [daily, weekly, monthly, alltime]
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
   *         description: Rankings fetched successfully
   */
  rankingRouter.get('/', async (req: any, res: Response) => {
    try {
      const type = req.query.type as 'rich' | 'charm';
      const period = req.query.period as 'daily' | 'weekly' | 'monthly' | 'alltime';
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '20');

      if (!type || !['rich', 'charm'].includes(type)) {
        throw new Error('Invalid type parameter. Must be "rich" or "charm".');
      }

      if (!period || !['daily', 'weekly', 'monthly', 'alltime'].includes(period)) {
        throw new Error('Invalid period parameter. Must be "daily", "weekly", "monthly", or "alltime".');
      }

      const rankingService = Container.get(RankingService);
      const data = await rankingService.getRanking(type, period, page, limit);

      return ResponseWrapper.success(res, data, 'Rankings fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
