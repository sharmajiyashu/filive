import { Router, Response } from 'express';
import Container from 'typedi';
import { BannerService } from '../../../services/admin/BannerService';
import { ResponseWrapper } from '../../responseWrapper';

export default (router: Router) => {
  const bannerService = Container.get(BannerService);
  const bannerRouter = Router();

  router.use('/banners', bannerRouter);

  bannerRouter.get('/', async (req: any, res: Response) => {
    try {
      const type = req.query.type?.toString();
      const banners = await bannerService.listActiveByType(type);
      return ResponseWrapper.success(res, banners, 'Banners fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
