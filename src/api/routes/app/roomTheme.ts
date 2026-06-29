import { Router, Response } from 'express';
import Container from 'typedi';
import { RoomThemeService } from '../../../services/app/RoomThemeService';
import { ResponseWrapper } from '../../responseWrapper';
import { appAuthMiddleware } from '../../middleware/appAuthMiddleware';

export default (router: Router) => {
  const roomThemeService = Container.get(RoomThemeService);
  const themeRouter = Router();

  router.use('/room-theme', appAuthMiddleware, themeRouter);

  themeRouter.get('/list', async (req: any, res: Response) => {
    try {
      const result = await roomThemeService.getActiveThemes();
      return ResponseWrapper.success(res, result, 'Active room themes fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
