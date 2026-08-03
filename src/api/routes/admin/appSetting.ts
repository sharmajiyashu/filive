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
};
