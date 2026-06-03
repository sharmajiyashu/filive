import { Router, Response } from 'express';
import Container from 'typedi';
import { StoreService } from '../../../services/app/StoreService';
import { CloudinaryService } from '../../../services/common/CloudinaryService';
import { MediaService } from '../../../services/common/MediaService';
import { MediaType } from '../../../constants/enum';
import { ResponseWrapper } from '../../responseWrapper';
import { adminAuthMiddleware } from '../../middleware/adminAuthMiddleware';
import upload from '../../middleware/upload';

export default (router: Router) => {
  const storeService = Container.get(StoreService);
  const cloudinaryService = Container.get(CloudinaryService);
  const mediaService = Container.get(MediaService);
  const storeRouter = Router();

  router.use('/store', adminAuthMiddleware, storeRouter);

  storeRouter.post('/', upload.single('media'), async (req: any, res: Response) => {
    try {
      let data = { ...req.body };
      if (typeof data.priceOptions === 'string') {
        data.priceOptions = JSON.parse(data.priceOptions);
      }
      
      if (req.file) {
        const uploadResults = await cloudinaryService.uploadMedia(MediaType.image, [req.file], 'stores');
        if (uploadResults.length > 0) {
          const media = await mediaService.createMedia({ ...uploadResults[0] });
          data.media = media._id;
        }
      }

      const result = await storeService.createStoreItem(data);
      return ResponseWrapper.success(res, result, 'Store item created successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  storeRouter.put('/:id', upload.single('media'), async (req: any, res: Response) => {
    try {
      let data = { ...req.body };
      if (data.priceOptions && typeof data.priceOptions === 'string') {
        data.priceOptions = JSON.parse(data.priceOptions);
      }

      if (req.file) {
        const uploadResults = await cloudinaryService.uploadMedia(MediaType.image, [req.file], 'stores');
        if (uploadResults.length > 0) {
          const media = await mediaService.createMedia({ ...uploadResults[0] });
          data.media = media._id;
        }
      }

      const result = await storeService.updateStoreItem(req.params.id, data);
      return ResponseWrapper.success(res, result, 'Store item updated successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  storeRouter.get('/', async (req: any, res: Response) => {
    try {
      const page = req.query.page ? parseInt(req.query.page) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit) : 20;
      const result = await storeService.getAdminStoreItems(page, limit);
      return ResponseWrapper.success(res, result, 'Store items fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  storeRouter.delete('/:id', async (req: any, res: Response) => {
    try {
      const result = await storeService.deleteStoreItem(req.params.id);
      return ResponseWrapper.success(res, result, 'Store item deleted successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
