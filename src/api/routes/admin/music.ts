import { Router, Response } from 'express';
import { ResponseWrapper } from '../../responseWrapper';
import AppLogger from '../../loaders/logger';
import { adminAuthMiddleware } from '../../middleware/adminAuthMiddleware';
import Music from '../../../models/Music';

export default (router: Router) => {
  const musicRouter = Router();
  router.use('/music', adminAuthMiddleware, musicRouter);

  // Get all music (Admin)
  musicRouter.get('/', async (req: any, res: Response) => {
    try {
      const musicList = await Music.find().sort({ createdAt: -1 });
      return ResponseWrapper.success(res, musicList, 'Music fetched successfully');
    } catch (error: any) {
      AppLogger.error(`[Admin GET /music] Failed: ${error.message}`, error);
      return ResponseWrapper.error(res, error);
    }
  });

  // Add new music
  musicRouter.post('/', async (req: any, res: Response) => {
    try {
      const { title, artist, url, coverImage, duration, isActive } = req.body;
      const newMusic = await Music.create({ title, artist, url, coverImage, duration, isActive });
      return ResponseWrapper.success(res, newMusic, 'Music created successfully');
    } catch (error: any) {
      AppLogger.error(`[Admin POST /music] Failed: ${error.message}`, error);
      return ResponseWrapper.error(res, error);
    }
  });

  // Update music
  musicRouter.put('/:id', async (req: any, res: Response) => {
    try {
      const { title, artist, url, coverImage, duration, isActive } = req.body;
      const updatedMusic = await Music.findByIdAndUpdate(req.params.id, { title, artist, url, coverImage, duration, isActive }, { new: true });
      if (!updatedMusic) throw new Error('Music not found');
      return ResponseWrapper.success(res, updatedMusic, 'Music updated successfully');
    } catch (error: any) {
      AppLogger.error(`[Admin PUT /music/:id] Failed: ${error.message}`, error);
      return ResponseWrapper.error(res, error);
    }
  });

  // Delete music
  musicRouter.delete('/:id', async (req: any, res: Response) => {
    try {
      const deletedMusic = await Music.findByIdAndDelete(req.params.id);
      if (!deletedMusic) throw new Error('Music not found');
      return ResponseWrapper.success(res, deletedMusic, 'Music deleted successfully');
    } catch (error: any) {
      AppLogger.error(`[Admin DELETE /music/:id] Failed: ${error.message}`, error);
      return ResponseWrapper.error(res, error);
    }
  });
};
