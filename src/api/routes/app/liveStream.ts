import { Router, Response } from 'express';
import Container from 'typedi';
import { LiveStreamService } from '../../../services/app/LiveStreamService';
import { ResponseWrapper } from '../../responseWrapper';

export default (router: Router) => {
  const liveStreamService = Container.get(LiveStreamService);
  const liveRouter = Router();

  router.use('/live', liveRouter);

  /**
   * @swagger
   * /app/live/start:
   *   post:
   *     summary: Start a live stream
   *     tags: [LiveStream]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - title
   *             properties:
   *               title:
   *                 type: string
   *     responses:
   *       200:
   *         description: Livestream started successfully
   */
  liveRouter.post('/start', async (req: any, res: Response) => {
    try {
      const { title } = req.body;
      if (!title) {
        throw new Error('Title is required to start a livestream');
      }
      const userId = req.user.id;
      const result = await liveStreamService.startLiveStream(userId, title);
      return ResponseWrapper.success(res, result, 'Livestream started successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/live/end:
   *   post:
   *     summary: End active live stream
   *     tags: [LiveStream]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Livestream ended successfully
   */
  liveRouter.post('/end', async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const result = await liveStreamService.endLiveStream(userId);
      return ResponseWrapper.success(res, result, 'Livestream ended successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/live/list:
   *   get:
   *     summary: Get all active live streams
   *     tags: [LiveStream]
   *     security:
   *       - bearerAuth: []
   *     parameters:
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
   *         description: Active live streams fetched successfully
   */
  liveRouter.get('/list', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '10');
      const result = await liveStreamService.getActiveLiveStreams(page, limit);
      return ResponseWrapper.success(res, result, 'Active live streams fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
