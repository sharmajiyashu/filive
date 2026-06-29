import { Router, Response } from 'express';
import Container from 'typedi';
import { GiftService } from '../../../services/app/GiftService';
import { CloudinaryService } from '../../../services/common/CloudinaryService';
import { MediaService } from '../../../services/common/MediaService';
import { ResponseWrapper } from '../../responseWrapper';
import { adminAuthMiddleware } from '../../middleware/adminAuthMiddleware';
import upload from '../../middleware/upload';
import { resolveMediaType } from '../../../utils/mediaType';

export default (router: Router) => {
  const giftService = Container.get(GiftService);
  const cloudinaryService = Container.get(CloudinaryService);
  const mediaService = Container.get(MediaService);
  const giftRouter = Router();

  router.use('/gift', adminAuthMiddleware, giftRouter);

  giftRouter.post('/', upload.single('media'), async (req: any, res: Response) => {
    try {
      const data = { ...req.body };
      
      if (!req.file) {
        throw new Error('Gift image file is required');
      }

      const mediaType = resolveMediaType(req.file);
      const uploadResults = await cloudinaryService.uploadMedia(mediaType, [req.file], 'gifts');
      if (uploadResults.length > 0) {
        const media = await mediaService.createMedia({ ...uploadResults[0] });
        data.media = media._id.toString();
      } else {
        throw new Error('Failed to upload gift image to Cloudinary');
      }

      const result = await giftService.createGift(data);
      return ResponseWrapper.success(res, result, 'Gift created successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  giftRouter.put('/:id', upload.single('media'), async (req: any, res: Response) => {
    try {
      const data = { ...req.body };

      if (req.file) {
        const mediaType = resolveMediaType(req.file);
        const uploadResults = await cloudinaryService.uploadMedia(mediaType, [req.file], 'gifts');
        if (uploadResults.length > 0) {
          const media = await mediaService.createMedia({ ...uploadResults[0] });
          data.media = media._id.toString();
        }
      }

      const result = await giftService.updateGift(req.params.id, data);
      return ResponseWrapper.success(res, result, 'Gift updated successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  giftRouter.get('/', async (req: any, res: Response) => {
    try {
      const page = req.query.page ? parseInt(req.query.page) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit) : 20;
      const type = req.query.type ? req.query.type.toString() : undefined;
      const result = await giftService.getAdminGifts(page, limit, type);
      return ResponseWrapper.success(res, result, 'Gifts fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  giftRouter.delete('/:id', async (req: any, res: Response) => {
    try {
      const result = await giftService.deleteGift(req.params.id);
      return ResponseWrapper.success(res, result, 'Gift deleted successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
