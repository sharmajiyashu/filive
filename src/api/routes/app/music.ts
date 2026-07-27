import { Router, Response } from 'express';
import { ResponseWrapper } from '../../responseWrapper';
import AppLogger from '../../loaders/logger';
import { appAuthMiddleware } from '../../middleware/appAuthMiddleware';
import Music from '../../../models/Music';

export default (router: Router) => {
  const musicRouter = Router();
  router.use('/music', appAuthMiddleware, musicRouter);

  /**
   * @swagger
   * /app/music:
   *   get:
   *     summary: Get all active music for rooms
   *     tags: [Music]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Music list fetched successfully
   */
  musicRouter.get('/', async (req: any, res: Response) => {
    try {
      const musicList = await Music.find({ isActive: true }).sort({ createdAt: -1 });
      return ResponseWrapper.success(res, musicList, 'Music fetched successfully');
    } catch (error: any) {
      AppLogger.error(`[HTTP GET /app/music] Failed: ${error.message}`, error);
      return ResponseWrapper.error(res, error);
    }
  });
};
