import { Router, Response } from 'express';
import Container from 'typedi';
import { GiftService } from '../../../services/app/GiftService';
import { ResponseWrapper } from '../../responseWrapper';
import { adminAuthMiddleware } from '../../middleware/adminAuthMiddleware';

export default (router: Router) => {
  const giftService = Container.get(GiftService);
  const giftTypeRouter = Router();

  router.use('/gift-type', adminAuthMiddleware, giftTypeRouter);

  giftTypeRouter.post('/', async (req: any, res: Response) => {
    try {
      const result = await giftService.createGiftType(req.body);
      return ResponseWrapper.success(res, result, 'Gift type created successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  giftTypeRouter.put('/:id', async (req: any, res: Response) => {
    try {
      const result = await giftService.updateGiftType(req.params.id, req.body);
      return ResponseWrapper.success(res, result, 'Gift type updated successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  giftTypeRouter.get('/', async (req: any, res: Response) => {
    try {
      const result = await giftService.getAdminGiftTypes();
      return ResponseWrapper.success(res, result, 'Gift types fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  giftTypeRouter.delete('/:id', async (req: any, res: Response) => {
    try {
      const result = await giftService.deleteGiftType(req.params.id);
      return ResponseWrapper.success(res, result, 'Gift type deleted successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
