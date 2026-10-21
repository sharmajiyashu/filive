import { Router, Request, Response } from 'express';
import Hashtag from '../../../models/Hashtag';
import { ResponseWrapper } from '../../responseWrapper';
import { seedHashtags } from '../../../seeders/HashtagSeeder';

export default (router: Router) => {
  const appRouter = Router();

  router.use('/hashtags', appRouter);

  /**
   * @swagger
   * /app/hashtags:
   *   get:
   *     summary: Get dynamic active hashtags for mobile app (e.g. creating stories, trending topics)
   *     tags: [Hashtags]
   */
  appRouter.get('/', async (req: Request, res: Response) => {
    try {
      const search = req.query.search?.toString().trim();
      const trending = req.query.trending?.toString();
      const category = req.query.category?.toString();
      const limit = req.query.limit ? parseInt(req.query.limit.toString(), 10) : 50;

      // Auto-bootstrap default hashtags if none exist
      const count = await Hashtag.countDocuments();
      if (count === 0) {
        await seedHashtags();
      }

      const query: any = { isActive: true };

      if (trending === 'true') {
        query.isTrending = true;
      }

      if (category && category !== 'all') {
        query.category = category;
      }

      if (search) {
        const cleanSearch = search.replace(/^#+/, '').trim();
        query.$or = [
          { name: new RegExp(cleanSearch, 'i') },
          { description: new RegExp(cleanSearch, 'i') },
        ];
      }

      const hashtags = await Hashtag.find(query)
        .populate('image')
        .sort({ isTrending: -1, order: 1, usageCount: -1, name: 1 })
        .limit(limit);

      return ResponseWrapper.success(res, hashtags, 'Hashtags fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/hashtags/trending:
   *   get:
   *     summary: Get trending hashtags for mobile app
   *     tags: [Hashtags]
   */
  appRouter.get('/trending', async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit.toString(), 10) : 20;

      // Auto-bootstrap default hashtags if none exist
      const count = await Hashtag.countDocuments();
      if (count === 0) {
        await seedHashtags();
      }

      const hashtags = await Hashtag.find({ isActive: true, isTrending: true })
        .populate('image')
        .sort({ order: 1, usageCount: -1, name: 1 })
        .limit(limit);

      return ResponseWrapper.success(res, hashtags, 'Trending hashtags fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
