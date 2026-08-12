import { Router, Response } from 'express';
import Container from 'typedi';
import { AnnouncementService } from '../../../services/admin/AnnouncementService';
import { CloudinaryService } from '../../../services/common/CloudinaryService';
import { MediaService } from '../../../services/common/MediaService';
import { ResponseWrapper } from '../../responseWrapper';
import { adminAuthMiddleware } from '../../middleware/adminAuthMiddleware';
import upload from '../../middleware/upload';
import { resolveMediaType } from '../../../utils/mediaType';

export default (router: Router) => {
  const announcementService = Container.get(AnnouncementService);
  const cloudinaryService = Container.get(CloudinaryService);
  const mediaService = Container.get(MediaService);
  const announcementRouter = Router();

  router.use('/announcements', adminAuthMiddleware, announcementRouter);

  announcementRouter.get('/', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '10');
      const search = req.query.search?.toString();
      const status = req.query.status?.toString();
      const result = await announcementService.list({ page, limit, search, status });
      return ResponseWrapper.success(res, result, 'Announcements fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  announcementRouter.get('/stats', async (_req: any, res: Response) => {
    try {
      const result = await announcementService.getSummary();
      return ResponseWrapper.success(res, result, 'Announcement stats fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  announcementRouter.post('/', upload.single('media'), async (req: any, res: Response) => {
    try {
      const { title, message, redirectUrl, audienceType, userId, mediaType } = req.body;
      let mediaId: string | undefined;

      let resolvedMediaType: 'image' | 'video' | 'none' =
        mediaType === 'image' || mediaType === 'video' ? mediaType : 'none';

      if (req.file) {
        const type = resolveMediaType(req.file);
        const uploadResults = await cloudinaryService.uploadMedia(type, [req.file], 'announcements');
        if (uploadResults.length === 0) {
          throw new Error('Failed to upload media');
        }
        const media = await mediaService.createMedia({ ...uploadResults[0] });
        mediaId = media._id.toString();
        resolvedMediaType = String(type) === 'video' ? 'video' : 'image';
      }

      const result = await announcementService.create({
        title,
        message,
        redirectUrl,
        audienceType: audienceType === 'specific_user' ? 'specific_user' : 'all',
        userId,
        mediaType: resolvedMediaType,
        mediaId,
        createdBy: req.user.id,
      });

      return ResponseWrapper.success(res, result, 'Announcement created successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  announcementRouter.patch('/:id', upload.single('media'), async (req: any, res: Response) => {
    try {
      const data: any = { ...req.body };

      if (req.file) {
        const type = resolveMediaType(req.file);
        const uploadResults = await cloudinaryService.uploadMedia(type, [req.file], 'announcements');
        if (uploadResults.length > 0) {
          const media = await mediaService.createMedia({ ...uploadResults[0] });
          data.mediaId = media._id.toString();
          data.mediaType = String(type) === 'video' ? 'video' : 'image';
        }
      }

      const result = await announcementService.update(req.params.id, data);
      return ResponseWrapper.success(res, result, 'Announcement updated successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  announcementRouter.delete('/:id', async (req: any, res: Response) => {
    try {
      const result = await announcementService.delete(req.params.id);
      return ResponseWrapper.success(res, result, 'Announcement deleted successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
