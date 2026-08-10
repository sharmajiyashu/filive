import { Router, Response } from 'express';
import Container from 'typedi';
import { AppSettingService } from '../../../services/common/AppSettingService';
import { CloudinaryService } from '../../../services/common/CloudinaryService';
import { MediaService } from '../../../services/common/MediaService';
import { ResponseWrapper } from '../../responseWrapper';
import upload from '../../middleware/upload';
import { resolveMediaType } from '../../../utils/mediaType';

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
  settingsRouter.put(
    '/',
    upload.fields([
      { name: 'home_banners', maxCount: 10 },
      { name: 'party_room_banners', maxCount: 10 },
      { name: 'recharge_offer_banners', maxCount: 10 },
    ]),
    async (req: any, res: Response) => {
      try {
        const payload = { ...req.body };
        const cloudinaryService = Container.get(CloudinaryService);
        const mediaService = Container.get(MediaService);

        // Helper to handle multiple banner file uploads
        const processBannerFiles = async (fieldName: string, existingKey: string) => {
          let currentList: string[] = [];
          if (payload[existingKey]) {
            try {
              currentList = typeof payload[existingKey] === 'string' ? JSON.parse(payload[existingKey]) : payload[existingKey];
            } catch (e) {
              currentList = [];
            }
          }

          if (req.files && req.files[fieldName]) {
            const files = req.files[fieldName];
            for (const file of files) {
              const mediaType = resolveMediaType(file);
              const uploadResults = await cloudinaryService.uploadMedia(mediaType, [file], 'banners');
              if (uploadResults.length > 0) {
                const media = await mediaService.createMedia({ ...uploadResults[0] });
                currentList.push(media.url);
              }
            }
          }
          payload[existingKey] = currentList;
          if (currentList.length > 0) {
            // Also maintain primary banner URL for single-banner fallback
            const singleKey = existingKey.replace('_banners', '_banner_image_url');
            payload[singleKey] = currentList[0];
          }
        };

        await processBannerFiles('home_banners', 'home_banners');
        await processBannerFiles('party_room_banners', 'party_room_banners');
        await processBannerFiles('recharge_offer_banners', 'recharge_offer_banners');

        const result = await appSettingService.updateSettings(payload);
        return ResponseWrapper.success(res, result, 'Settings updated successfully');
      } catch (error: any) {
        return ResponseWrapper.error(res, error);
      }
    }
  );

  /**
   * @swagger
   * /admin/app-settings/invite-reward:
   *   get:
   *     summary: Get Invite Reward setting and DeepLink base URL (Admin)
   *     tags: [Admin - Settings]
   *     responses:
   *       200:
   *         description: Invite reward settings fetched successfully
   */
  settingsRouter.get('/invite-reward', async (req: any, res: Response) => {
    try {
      const inviteRewardCoins = await appSettingService.getSettingValue('invite_reward_coins');
      const deepLinkBaseUrl = await appSettingService.getSettingValue('deep_link_base_url');
      return ResponseWrapper.success(res, {
        invite_reward_coins: Number(inviteRewardCoins || 2000),
        deep_link_base_url: deepLinkBaseUrl || 'https://filive.app/invite'
      }, 'Invite reward settings fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/app-settings/invite-reward:
   *   put:
   *     summary: Set Invite Rewards (e.g., 2,000 Coins per invite) and DeepLink base URL (Admin)
   *     tags: [Admin - Settings]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               invite_reward_coins:
   *                 type: number
   *                 example: 2000
   *               deep_link_base_url:
   *                 type: string
   *                 example: https://filive.app/invite
   *     responses:
   *       200:
   *         description: Invite reward settings updated successfully
   */
  settingsRouter.put('/invite-reward', async (req: any, res: Response) => {
    try {
      const { invite_reward_coins, deep_link_base_url } = req.body;
      const updatePayload: any = {};
      if (invite_reward_coins !== undefined) {
        updatePayload.invite_reward_coins = Number(invite_reward_coins);
      }
      if (deep_link_base_url !== undefined) {
        updatePayload.deep_link_base_url = String(deep_link_base_url);
      }
      await appSettingService.updateSettings(updatePayload);
      const updatedCoins = await appSettingService.getSettingValue('invite_reward_coins');
      const updatedBaseUrl = await appSettingService.getSettingValue('deep_link_base_url');
      return ResponseWrapper.success(res, {
        invite_reward_coins: Number(updatedCoins),
        deep_link_base_url: updatedBaseUrl
      }, 'Invite reward settings updated successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
