import { Router, Response } from 'express';
import Container from 'typedi';
import { RoomThemeService } from '../../../services/app/RoomThemeService';
import { CloudinaryService } from '../../../services/common/CloudinaryService';
import { MediaService } from '../../../services/common/MediaService';
import { ResponseWrapper } from '../../responseWrapper';
import { adminAuthMiddleware } from '../../middleware/adminAuthMiddleware';
import upload from '../../middleware/upload';
import { resolveMediaType } from '../../../utils/mediaType';

export default (router: Router) => {
  const roomThemeService = Container.get(RoomThemeService);
  const cloudinaryService = Container.get(CloudinaryService);
  const mediaService = Container.get(MediaService);
  const themeRouter = Router();

  router.use('/room-theme', adminAuthMiddleware, themeRouter);

  /**
   * @swagger
   * /admin/room-theme:
   *   post:
   *     summary: Create a new room theme
   *     tags: [AdminRoomTheme]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             required:
   *               - name
   *               - media
   *             properties:
   *               name:
   *                 type: string
   *               isActive:
   *                 type: boolean
   *               media:
   *                 type: string
   *                 format: binary
   *                 description: Background image file to upload
   *     responses:
   *       200:
   *         description: Room theme created successfully
   */
  themeRouter.post('/', upload.single('media'), async (req: any, res: Response) => {
    try {
      const data = { ...req.body };

      if (!req.file) {
        throw new Error('Background image file is required');
      }

      const mediaType = resolveMediaType(req.file);
      const uploadResults = await cloudinaryService.uploadMedia(mediaType, [req.file], 'themes');
      if (uploadResults.length > 0) {
        const media = await mediaService.createMedia({ ...uploadResults[0] });
        data.media = media._id.toString();
      } else {
        throw new Error('Failed to upload theme image to Cloudinary');
      }

      const result = await roomThemeService.createTheme(data);
      return ResponseWrapper.success(res, result, 'Room theme created successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/room-theme/{id}:
   *   put:
   *     summary: Update an existing room theme
   *     tags: [AdminRoomTheme]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Room theme ID
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               name:
   *                 type: string
   *               isActive:
   *                 type: boolean
   *               media:
   *                 type: string
   *                 format: binary
   *                 description: Background image file to upload (optional)
   *     responses:
   *       200:
   *         description: Room theme updated successfully
   */
  themeRouter.put('/:id', upload.single('media'), async (req: any, res: Response) => {
    try {
      const data = { ...req.body };

      if (req.file) {
        const mediaType = resolveMediaType(req.file);
        const uploadResults = await cloudinaryService.uploadMedia(mediaType, [req.file], 'themes');
        if (uploadResults.length > 0) {
          const media = await mediaService.createMedia({ ...uploadResults[0] });
          data.media = media._id.toString();
        }
      }

      const result = await roomThemeService.updateTheme(req.params.id, data);
      return ResponseWrapper.success(res, result, 'Room theme updated successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/room-theme:
   *   get:
   *     summary: Fetch all room themes
   *     tags: [AdminRoomTheme]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *         description: Page number
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *         description: Page limit
   *     responses:
   *       200:
   *         description: Room themes fetched successfully
   */
  themeRouter.get('/', async (req: any, res: Response) => {
    try {
      const page = req.query.page ? parseInt(req.query.page) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit) : 20;
      const result = await roomThemeService.getAdminThemes(page, limit);
      return ResponseWrapper.success(res, result, 'Room themes fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/room-theme/{id}:
   *   delete:
   *     summary: Delete a room theme
   *     tags: [AdminRoomTheme]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Room theme ID
   *     responses:
   *       200:
   *         description: Room theme deleted successfully
   */
  themeRouter.delete('/:id', async (req: any, res: Response) => {
    try {
      const result = await roomThemeService.deleteTheme(req.params.id);
      return ResponseWrapper.success(res, result, 'Room theme deleted successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
