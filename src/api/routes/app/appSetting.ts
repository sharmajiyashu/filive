import { Router, Request, Response } from 'express';
import AppSetting from '../../../models/AppSetting';
import Country from '../../../models/Country';
import Language from '../../../models/Language';
import Career from '../../../models/Career';
import Hobby from '../../../models/Hobby';
import GiftType from '../../../models/GiftType';
import { ResponseWrapper } from '../../responseWrapper';

export default (router: Router) => {
  const settingsRouter = Router();

  router.use('/settings', settingsRouter);

  /**
   * @swagger
   * /app/settings:
   *   get:
   *     summary: Get all app settings, countries, languages, careers, hobbies and gift types
   *     tags: [Settings]
   *     responses:
   *       200:
   *         description: Combined app configuration
   */
  settingsRouter.get('/', async (req: Request, res: Response) => {
    try {
      let [settings, countries, languages, careers, hobbies, giftTypes] = await Promise.all([
        AppSetting.find(),
        Country.find({ isActive: true }).sort({ name: 1 }),
        Language.find({ isActive: true }).sort({ name: 1 }),
        Career.find({ isActive: true }).populate('image').sort({ name: 1 }),
        Hobby.find({ isActive: true }).populate('image').sort({ type: 1, name: 1 }),
        GiftType.find({ isActive: true }).sort({ name: 1 })
      ]);

      if (!giftTypes || giftTypes.length === 0) {
        const defaultTypes = ['Love', 'Popular', 'Normal', 'VIP', 'Luxury'];
        for (const typeName of defaultTypes) {
          await GiftType.findOneAndUpdate(
            { name: typeName },
            { name: typeName, isActive: true },
            { upsert: true, new: true }
          );
        }
        giftTypes = await GiftType.find({ isActive: true }).sort({ name: 1 });
      }

      const settingsMap = settings.reduce((acc: any, curr) => {
        acc[curr.key] = curr.value;
        return acc;
      }, {});

      const result = {
        settings: settingsMap,
        countries,
        languages,
        careers,
        hobbies,
        giftTypes
      };

      return ResponseWrapper.success(res, result, 'Configuration fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/settings/call-prices:
   *   get:
   *     summary: Get level-wise audio and video call price tiers
   *     tags: [Settings]
   *     responses:
   *       200:
   *         description: Call price tiers
   */
  settingsRouter.get('/call-prices', async (req: Request, res: Response) => {
    try {
      const setting = await AppSetting.findOne({ key: 'call_price_tiers' });
      const defaultTiers = [
        { minLevel: 1, maxLevel: 7, audioPrice: 1200, videoPrice: 2500, label: 'Level 1–7' },
        { minLevel: 8, maxLevel: 15, audioPrice: 1500, videoPrice: 3000, label: 'Level 8–15' },
        { minLevel: 16, maxLevel: 25, audioPrice: 2000, videoPrice: 4000, label: 'Level 16–25' },
        { minLevel: 26, maxLevel: 35, audioPrice: 2500, videoPrice: 5000, label: 'Level 26–35' },
        { minLevel: 36, maxLevel: 42, audioPrice: 3000, videoPrice: 6500, label: 'Level 36–42' },
        { minLevel: 43, maxLevel: 45, audioPrice: 4000, videoPrice: 8000, label: 'Level 43–45' },
      ];
      const tiers = setting?.value || defaultTiers;
      return ResponseWrapper.success(res, tiers, 'Call price tiers fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
