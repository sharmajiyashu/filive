import { Router, Response } from 'express';
import Container from 'typedi';
import { AppSettingService } from '../../../services/common/AppSettingService';
import { ResponseWrapper } from '../../responseWrapper';

export default (router: Router) => {
  const appSettingService = Container.get(AppSettingService);
  const settingsRouter = Router();

  router.use('/app-settings', settingsRouter);

  /**
   * @swagger
   * /admin/app-settings:
   *   get:
   *     summary: Get all app settings (Admin)
   *     tags: [Admin - Settings]
   *     responses:
   *       200:
   *         description: Settings list fetched successfully
   */
  settingsRouter.get('/', async (req: any, res: Response) => {
    try {
      const result = await appSettingService.getSettings();
      return ResponseWrapper.success(res, result, 'Settings fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/app-settings:
   *   put:
   *     summary: Update app settings (Admin)
   *     tags: [Admin - Settings]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *     responses:
   *       200:
   *         description: Settings updated successfully
   */
  settingsRouter.put('/', async (req: any, res: Response) => {
    try {
      const result = await appSettingService.updateSettings(req.body);
      return ResponseWrapper.success(res, result, 'Settings updated successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
