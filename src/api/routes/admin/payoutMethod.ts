import { Router, Response } from 'express';
import Container from 'typedi';
import { PayoutMethodService } from '../../../services/admin/PayoutMethodService';
import { CloudinaryService } from '../../../services/common/CloudinaryService';
import { MediaService } from '../../../services/common/MediaService';
import { ResponseWrapper } from '../../responseWrapper';
import { adminAuthMiddleware } from '../../middleware/adminAuthMiddleware';
import upload from '../../middleware/upload';
import { resolveMediaType } from '../../../utils/mediaType';

export default (router: Router) => {
  const payoutMethodService = Container.get(PayoutMethodService);
  const cloudinaryService = Container.get(CloudinaryService);
  const mediaService = Container.get(MediaService);
  const payoutMethodRouter = Router();

  router.use('/payout-method', adminAuthMiddleware, payoutMethodRouter);

  /**
   * CREATE Payout Method
   */
  payoutMethodRouter.post('/', upload.single('media'), async (req: any, res: Response) => {
    try {
      const data = { ...req.body };

      if (req.file) {
        const mediaType = resolveMediaType(req.file);
        const uploadResults = await cloudinaryService.uploadMedia(mediaType, [req.file], 'payout_methods');
        if (uploadResults.length > 0) {
          const media = await mediaService.createMedia({ ...uploadResults[0] });
          data.media = media._id.toString();
        }
      }

      const result = await payoutMethodService.createPayoutMethod(data);
      return ResponseWrapper.success(res, result, 'Payout method created successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * UPDATE Payout Method
   */
  payoutMethodRouter.put('/:id', upload.single('media'), async (req: any, res: Response) => {
    try {
      const data = { ...req.body };

      if (req.file) {
        const mediaType = resolveMediaType(req.file);
        const uploadResults = await cloudinaryService.uploadMedia(mediaType, [req.file], 'payout_methods');
        if (uploadResults.length > 0) {
          const media = await mediaService.createMedia({ ...uploadResults[0] });
          data.media = media._id.toString();
        }
      }

      const result = await payoutMethodService.updatePayoutMethod(req.params.id, data);
      return ResponseWrapper.success(res, result, 'Payout method updated successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * GET Payout Methods (Admin List)
   */
  payoutMethodRouter.get('/', async (req: any, res: Response) => {
    try {
      const page = req.query.page ? parseInt(req.query.page) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit) : 20;
      const search = req.query.search ? req.query.search.toString() : undefined;
      const result = await payoutMethodService.getAdminPayoutMethods(page, limit, search);
      return ResponseWrapper.success(res, result, 'Payout methods fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * GET Payout Method Details
   */
  payoutMethodRouter.get('/:id', async (req: any, res: Response) => {
    try {
      const result = await payoutMethodService.getPayoutMethodById(req.params.id);
      return ResponseWrapper.success(res, result, 'Payout method details fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * DELETE Payout Method
   */
  payoutMethodRouter.delete('/:id', async (req: any, res: Response) => {
    try {
      const result = await payoutMethodService.deletePayoutMethod(req.params.id);
      return ResponseWrapper.success(res, result, 'Payout method deleted successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
