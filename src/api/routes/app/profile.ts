import { Router, Response } from 'express';
import Container from 'typedi';
import { ProfileService } from '../../../services/app/ProfileService';
import { ResponseWrapper } from '../../responseWrapper';
import { validate } from '../../validators';
import { updateProfileSchema } from '../../validators/user';
import { appAuthMiddleware } from '../../middleware/appAuthMiddleware';
import upload from '../../middleware/upload';

export default (router: Router) => {
  const profileService = Container.get(ProfileService);

  /**
   * @swagger
   * /app/profile:
   *   get:
   *     summary: Get user profile
   *     tags: [Profile]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Profile fetched successfully
   *       401:
   *         description: Unauthorized
   */
  router.get('/profile',
    async (req: any, res: Response) => {
      try {
        const userId = req.user.id;
        const profile = await profileService.getProfile(userId);
        return ResponseWrapper.success(res, profile, 'Profile fetched successfully');
      } catch (error: any) {
        return ResponseWrapper.error(res, error);
      }
    });

  /**
   * @swagger
   * /app/profile/settings:
   *   get:
   *     summary: Get profile-related settings (careers, marital statuses)
   *     tags: [Profile]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Settings fetched successfully
   */
  router.get('/profile/settings',
    async (req: any, res: Response) => {
      try {
        const settings = await profileService.getProfileSettings();
        return ResponseWrapper.success(res, settings, 'Settings fetched successfully');
      } catch (error: any) {
        return ResponseWrapper.error(res, error);
      }
    });

  /**
   * @swagger
   * /app/profile/preferences:
   *   post:
   *     summary: Update notification and privacy preferences
   *     tags: [Profile]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               notificationPreferences:
   *                 type: object
   *                 properties:
   *                   inApp: { type: boolean }
   *                   newMessage: { type: boolean }
   *                   vibrations: { type: boolean }
   *               privacySettings:
   *                 type: object
   *                 properties:
   *                   hideWealthLevel: { type: boolean }
   *                   hideCharmLevel: { type: boolean }
   *                   anonymousRanking: { type: boolean }
   *     responses:
   *       200:
   *         description: Preferences updated successfully
   */
  router.post('/profile/preferences',
    async (req: any, res: Response) => {
      try {
        const userId = req.user.id;
        const updatedUser = await profileService.updatePreferences(userId, req.body);
        return ResponseWrapper.success(res, updatedUser, 'Preferences updated successfully');
      } catch (error: any) {
        return ResponseWrapper.error(res, error);
      }
    });

  /**
   * @swagger
   * /app/profile:
   *   post:
   *     summary: Update user profile (includes image upload)
   *     tags: [Profile]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               name:
   *                 type: string
   *               bio:
   *                 type: string
   *               email:
   *                 type: string
   *               dob:
   *                 type: string
   *                 format: date
   *               gender:
   *                 type: string
   *                 enum: [Male, Female, Other]
   *               selfIntroduce:
   *                 type: string
   *               height:
   *                 type: string
   *               country:
   *                 type: string
   *               maritalStatus:
   *                 type: string
   *               location:
   *                 type: object
   *                 properties:
   *                   lat:
   *                     type: number
   *                   lng:
   *                     type: number
   *                   address:
   *                     type: string
   *                   city:
   *                     type: string
   *                   state:
   *                     type: string
   *                   zipcode:
   *                     type: string
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               name:
   *                 type: string
   *               bio:
   *                 type: string
   *               email:
   *                 type: string
   *               dob:
   *                 type: string
   *                 format: date
   *               gender:
   *                 type: string
   *                 enum: [Male, Female, Other]
   *               selfIntroduce:
   *                 type: string
   *               height:
   *                 type: string
   *               country:
   *                 type: string
   *               maritalStatus:
   *                 type: string
   *               image:
   *                 type: string
   *                 format: binary
   *     responses:
   *       200:
   *         description: Profile updated successfully
   *       401:
   *         description: Unauthorized
   */
  router.post('/profile',
    upload.single('image'),
    validate(updateProfileSchema, 'body'),
    async (req: any, res: Response) => {
      try {
        const userId = req.user.id;
        const updatedProfile = await profileService.updateProfile(userId, req.body, req.file);
        return ResponseWrapper.success(res, updatedProfile, 'Profile updated successfully');
      } catch (error: any) {
        return ResponseWrapper.error(res, error);
      }
    });

  /**
   * @swagger
   * /app/profile/image:
   *   post:
   *     summary: Upload only profile image
   *     tags: [Profile]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               image:
   *                 type: string
   *                 format: binary
   *     responses:
   *       200:
   *         description: Image uploaded successfully
   */
  router.post('/profile/image',
    upload.single('image'),
    async (req: any, res: Response) => {
      try {
        const userId = req.user.id;
        if (!req.file) throw new Error('Please upload an image');
        const updatedProfile = await profileService.updateProfile(userId, {}, req.file);
        return ResponseWrapper.success(res, updatedProfile, 'Image uploaded successfully');
      } catch (error: any) {
        return ResponseWrapper.error(res, error);
      }
    });
};
