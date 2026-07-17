import { Router, Response } from 'express';
import Container from 'typedi';
import { GameService } from '../../../services/app/GameService';
import { CloudinaryService } from '../../../services/common/CloudinaryService';
import { MediaService } from '../../../services/common/MediaService';
import { ResponseWrapper } from '../../responseWrapper';
import { adminAuthMiddleware } from '../../middleware/adminAuthMiddleware';
import upload from '../../middleware/upload';
import { resolveMediaType } from '../../../utils/mediaType';

export default (router: Router) => {
  const gameService = Container.get(GameService);
  const cloudinaryService = Container.get(CloudinaryService);
  const mediaService = Container.get(MediaService);
  const gameRouter = Router();

  router.use('/game', adminAuthMiddleware, gameRouter);

  /**
   * @swagger
   * /admin/game:
   *   post:
   *     summary: Create a new game
   *     tags: [AdminGame]
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
   *               - link
   *               - minWinPercent
   *               - maxWinPercent
   *             properties:
   *               name:
   *                 type: string
   *               link:
   *                 type: string
   *               minWinPercent:
   *                 type: number
   *               maxWinPercent:
   *                 type: number
   *               image:
   *                 type: string
   *                 format: binary
   *               isActive:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: Game created successfully
   */
  gameRouter.post('/', upload.single('image'), async (req: any, res: Response) => {
    try {
      const data: any = { ...req.body };

      if (!data.name || !data.link || data.minWinPercent === undefined || data.maxWinPercent === undefined) {
        throw new Error('name, link, minWinPercent and maxWinPercent are required');
      }

      if (req.file) {
        const mediaType = resolveMediaType(req.file);
        const uploadResults = await cloudinaryService.uploadMedia(mediaType, [req.file], 'games');
        if (uploadResults.length > 0) {
          const media = await mediaService.createMedia({ ...uploadResults[0] });
          data.image = media._id.toString();
        } else {
          throw new Error('Failed to upload game image to Cloudinary');
        }
      }

      const result = await gameService.createGame(data);
      return ResponseWrapper.success(res, result, 'Game created successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/game/{id}:
   *   put:
   *     summary: Update an existing game
   *     tags: [AdminGame]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               name:
   *                 type: string
   *               link:
   *                 type: string
   *               minWinPercent:
   *                 type: number
   *               maxWinPercent:
   *                 type: number
   *               image:
   *                 type: string
   *                 format: binary
   *               isActive:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: Game updated successfully
   */
  gameRouter.put('/:id', upload.single('image'), async (req: any, res: Response) => {
    try {
      const data: any = { ...req.body };

      if (req.file) {
        const mediaType = resolveMediaType(req.file);
        const uploadResults = await cloudinaryService.uploadMedia(mediaType, [req.file], 'games');
        if (uploadResults.length > 0) {
          const media = await mediaService.createMedia({ ...uploadResults[0] });
          data.image = media._id.toString();
        }
      }

      const result = await gameService.updateGame(req.params.id, data);
      return ResponseWrapper.success(res, result, 'Game updated successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/game/{id}/status:
   *   patch:
   *     summary: Toggle game active status
   *     tags: [AdminGame]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - isActive
   *             properties:
   *               isActive:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: Game status updated successfully
   */
  gameRouter.patch('/:id/status', async (req: any, res: Response) => {
    try {
      const { isActive } = req.body;
      if (isActive === undefined) throw new Error('isActive is required');
      const result = await gameService.toggleStatus(req.params.id, isActive);
      return ResponseWrapper.success(res, result, 'Game status updated successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/game:
   *   get:
   *     summary: List all games (admin)
   *     tags: [AdminGame]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *       - in: query
   *         name: search
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Games fetched successfully
   */
  gameRouter.get('/', async (req: any, res: Response) => {
    try {
      const page = req.query.page ? parseInt(req.query.page) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit) : 20;
      const search = req.query.search ? req.query.search.toString() : undefined;
      const result = await gameService.getAdminGames(page, limit, search);
      return ResponseWrapper.success(res, result, 'Games fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/game/{id}:
   *   delete:
   *     summary: Delete a game
   *     tags: [AdminGame]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Game deleted successfully
   */
  gameRouter.delete('/:id', async (req: any, res: Response) => {
    try {
      const result = await gameService.deleteGame(req.params.id);
      return ResponseWrapper.success(res, result, 'Game deleted successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
