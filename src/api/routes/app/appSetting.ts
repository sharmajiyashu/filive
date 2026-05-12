import { Router, Request, Response } from 'express';
import AppSetting from '../../../models/AppSetting';
import Country from '../../../models/Country';
import Language from '../../../models/Language';
import { ResponseWrapper } from '../../responseWrapper';

export default (router: Router) => {
  const settingsRouter = Router();

  router.use('/settings', settingsRouter);

  /**
   * @swagger
   * /app/settings:
   *   get:
   *     summary: Get all app settings, countries and languages
   *     tags: [Settings]
   *     responses:
   *       200:
   *         description: Combined app configuration
   */
  settingsRouter.get('/', async (req: Request, res: Response) => {
    try {
      const [settings, countries, languages] = await Promise.all([
        AppSetting.find(),
        Country.find({ isActive: true }).sort({ name: 1 }),
        Language.find({ isActive: true }).sort({ name: 1 })
      ]);

      const settingsMap = settings.reduce((acc: any, curr) => {
        acc[curr.key] = curr.value;
        return acc;
      }, {});

      const result = {
        settings: settingsMap,
        countries,
        languages
      };

      return ResponseWrapper.success(res, result, 'Configuration fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
