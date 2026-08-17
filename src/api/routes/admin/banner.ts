import { Router, Response } from 'express';
import Container from 'typedi';
import { BannerService } from '../../../services/admin/BannerService';
import { CloudinaryService } from '../../../services/common/CloudinaryService';
import { MediaService } from '../../../services/common/MediaService';
import { ResponseWrapper } from '../../responseWrapper';
import { adminAuthMiddleware } from '../../middleware/adminAuthMiddleware';
import upload from '../../middleware/upload';
import { resolveMediaType } from '../../../utils/mediaType';
import { BANNER_TYPES } from '../../../models/Banner';

export default (router: Router) => {
  const bannerService = Container.get(BannerService);
  const cloudinaryService = Container.get(CloudinaryService);
  const mediaService = Container.get(MediaService);
  const bannerRouter = Router();

  router.use('/banners', adminAuthMiddleware, bannerRouter);

  bannerRouter.get('/', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '10');
      const type = req.query.type?.toString();
      const status = req.query.status?.toString();
      const result = await bannerService.list({ page, limit, type, status });
      return ResponseWrapper.success(res, result, 'Banners fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  bannerRouter.post('/', upload.array('images', 10), async (req: any, res: Response) => {
    try {
      const { type, redirectUrl, route } = req.body;
      if (!BANNER_TYPES.includes(type)) {
        throw new Error('Invalid banner type');
      }

      const files: Express.Multer.File[] = Array.isArray(req.files) ? req.files : [];
      if (files.length === 0) {
        throw new Error('Please upload at least one banner image');
      }

      const imageIds: string[] = [];
      for (const file of files) {
        const mediaType = resolveMediaType(file);
        if (String(mediaType) === 'video') {
          throw new Error('Only jpeg, jpg, and png images are allowed');
        }
        const uploadResults = await cloudinaryService.uploadMedia(mediaType, [file], 'banners');
        if (!uploadResults[0]) {
          throw new Error('Failed to upload banner image');
        }
        const media = await mediaService.createMedia({ ...uploadResults[0] });
        imageIds.push(media._id.toString());
      }

      const result = await bannerService.createMany({
        type,
        imageIds,
        redirectUrl,
        route,
      });
      return ResponseWrapper.success(res, result, 'Banners created successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  bannerRouter.put('/:id', upload.single('image'), async (req: any, res: Response) => {
    try {
      const data: { redirectUrl?: string; route?: string; isActive?: boolean; imageId?: string } = {
        redirectUrl: req.body.redirectUrl,
        route: req.body.route,
      };
      if (req.body.isActive !== undefined) {
        data.isActive = req.body.isActive === true || req.body.isActive === 'true';
      }

      if (req.file) {
        const mediaType = resolveMediaType(req.file);
        const uploadResults = await cloudinaryService.uploadMedia(mediaType, [req.file], 'banners');
        if (!uploadResults[0]) {
          throw new Error('Failed to upload banner image');
        }
        const media = await mediaService.createMedia({ ...uploadResults[0] });
        data.imageId = media._id.toString();
      }

      const result = await bannerService.update(req.params.id, data);
      return ResponseWrapper.success(res, result, 'Banner updated successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  bannerRouter.put('/:id/status', async (req: any, res: Response) => {
    try {
      const result = await bannerService.toggleActive(req.params.id);
      return ResponseWrapper.success(
        res,
        result,
        result.isActive ? 'Banner activated successfully' : 'Banner deactivated successfully'
      );
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  bannerRouter.delete('/:id', async (req: any, res: Response) => {
    try {
      await bannerService.remove(req.params.id);
      return ResponseWrapper.success(res, null, 'Banner deleted successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
