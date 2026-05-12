import { Router, Request, Response } from 'express';
import AppSetting from '../../../models/AppSetting';
import { ResponseWrapper } from '../../responseWrapper';

export default (router: Router) => {
  const settingsRouter = Router();

  router.use('/settings', settingsRouter);

  /**
   * @swagger
   * /app/settings:
   *   get:
   *     summary: Get all app settings
   *     tags: [Settings]
   *     responses:
   *       200:
   *         description: List of settings
   */
  settingsRouter.get('/', async (req: Request, res: Response) => {
    try {
      const settings = await AppSetting.find();
      const result = settings.reduce((acc: any, curr) => {
        acc[curr.key] = curr.value;
        return acc;
      }, {});
      return ResponseWrapper.success(res, result, 'Settings fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
