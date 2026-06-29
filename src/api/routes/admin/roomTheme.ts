import { Router, Response } from 'express';
import Container from 'typedi';
import { RoomThemeService } from '../../../services/app/RoomThemeService';
import { CloudinaryService } from '../../../services/common/CloudinaryService';
import { MediaService } from '../../../services/common/MediaService';
import { ResponseWrapper } from '../../responseWrapper';
import { adminAuthMiddleware } from '../../middleware/adminAuthMiddleware';
import upload from '../../middleware/upload';
import { resolveMediaType } from '../../../utils/mediaType';

export default (router: Router) => {
  const roomThemeService = Container.get(RoomThemeService);
  const cloudinaryService = Container.get(CloudinaryService);
  const mediaService = Container.get(MediaService);
  const themeRouter = Router();

  router.use('/room-theme', adminAuthMiddleware, themeRouter);

  themeRouter.post('/', upload.single('media'), async (req: any, res: Response) => {
    try {
      const data = { ...req.body };
      
      if (!req.file) {
        throw new Error('Background image file is required');
      }

      const mediaType = resolveMediaType(req.file);
      const uploadResults = await cloudinaryService.uploadMedia(mediaType, [req.file], 'themes');
      if (uploadResults.length > 0) {
        const media = await mediaService.createMedia({ ...uploadResults[0] });
        data.media = media._id.toString();
      } else {
        throw new Error('Failed to upload theme image to Cloudinary');
      }

      const result = await roomThemeService.createTheme(data);
      return ResponseWrapper.success(res, result, 'Room theme created successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  themeRouter.put('/:id', upload.single('media'), async (req: any, res: Response) => {
    try {
      const data = { ...req.body };

      if (req.file) {
        const mediaType = resolveMediaType(req.file);
        const uploadResults = await cloudinaryService.uploadMedia(mediaType, [req.file], 'themes');
        if (uploadResults.length > 0) {
          const media = await mediaService.createMedia({ ...uploadResults[0] });
          data.media = media._id.toString();
        }
      }

      const result = await roomThemeService.updateTheme(req.params.id, data);
      return ResponseWrapper.success(res, result, 'Room theme updated successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  themeRouter.get('/', async (req: any, res: Response) => {
    try {
      const page = req.query.page ? parseInt(req.query.page) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit) : 20;
      const result = await roomThemeService.getAdminThemes(page, limit);
      return ResponseWrapper.success(res, result, 'Room themes fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  themeRouter.delete('/:id', async (req: any, res: Response) => {
    try {
      const result = await roomThemeService.deleteTheme(req.params.id);
      return ResponseWrapper.success(res, result, 'Room theme deleted successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
