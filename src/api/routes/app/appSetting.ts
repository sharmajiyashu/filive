import { Router, Request, Response } from 'express';
import Container from 'typedi';
import AppSetting from '../../../models/AppSetting';
import { AppSettingService } from '../../../services/common/AppSettingService';
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
      const appSettingService = Container.get(AppSettingService);
      let [settingsMap, countries, languages, careers, hobbies, giftTypes] = await Promise.all([
        appSettingService.getSettings(),
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

      // Sync active banners from Banner collection into settingsMap
      try {
        const Banner = (await import('../../../models/Banner')).default;
        const activeBanners = await Banner.find({ isActive: true })
          .populate('image')
          .sort({ sortOrder: 1, createdAt: -1 })
          .lean();

        const homeList = activeBanners
          .filter((b: any) => b.type === 'home' && b.image && (b.image.url || typeof b.image === 'string'))
          .map((b: any) => (typeof b.image === 'string' ? b.image : b.image.url));
        if (homeList.length > 0) {
          settingsMap.home_banners = homeList;
          settingsMap.home_banner_image_url = homeList[0];
        }

        const partyList = activeBanners
          .filter((b: any) => b.type === 'party' && b.image && (b.image.url || typeof b.image === 'string'))
          .map((b: any) => (typeof b.image === 'string' ? b.image : b.image.url));
        if (partyList.length > 0) {
          settingsMap.party_room_banners = partyList;
          settingsMap.party_room_banner_image_url = partyList[0];
        }

        const splashList = activeBanners
          .filter((b: any) => b.type === 'splash' && b.image && (b.image.url || typeof b.image === 'string'))
          .map((b: any) => (typeof b.image === 'string' ? b.image : b.image.url));
        if (splashList.length > 0) {
          settingsMap.splash_banners = splashList;
          settingsMap.splash_banner_image_url = splashList[0];
        }
      } catch (bannerErr) {
        console.warn('[appSetting] Error populating active banners:', bannerErr);
      }

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

  /**
   * @swagger
   * /app/settings/legal:
   *   get:
   *     summary: Get legal policies (Privacy Policy, User Agreement)
   *     tags: [Settings]
   *     responses:
   *       200:
   *         description: Legal content retrieved successfully
   */
  settingsRouter.get('/legal', async (req: Request, res: Response) => {
    try {
      const appSettingService = Container.get(AppSettingService);
      const settings = await appSettingService.getSettings();
      return ResponseWrapper.success(
        res,
        {
          privacy_policy_content: settings.privacy_policy_content || '',
          privacy_policy_updated_at: settings.privacy_policy_updated_at || '17 November 2026',
          privacy_policy_url: settings.privacy_policy_url || 'https://filive.in/privacy-policy',
          user_agreement_content: settings.user_agreement_content || '',
          user_agreement_updated_at: settings.user_agreement_updated_at || '17 November 2026',
          user_agreement_url: settings.terms_conditions_url || 'https://filive.in/user-agreement',
          refund_policy_content: settings.refund_policy_content || '',
          refund_policy_updated_at: settings.refund_policy_updated_at || '17 November 2026',
          refund_policy_url: settings.refund_policy_url || 'https://filive.in/refund-policy',
          child_safety_policy_content: settings.child_safety_policy_content || '',
          child_safety_policy_updated_at: settings.child_safety_policy_updated_at || '17 November 2026',
          child_safety_policy_url: settings.child_safety_policy_url || 'https://filive.in/child-safety',
          about_us_title: settings.about_us_title || 'About FiLive',
          about_us_content: settings.about_us_content || '',
          company_name: settings.company_name || 'FiLive Entertainment Private Limited',
          official_website_url: settings.official_website_url || 'https://filive.in',
          contact_us_email: settings.contact_us_email || 'support@filive.in',
          contact_us_phone: settings.contact_us_phone || '',
          contact_us_address: settings.contact_us_address || '',
        },
        'Legal information retrieved successfully'
      );
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
