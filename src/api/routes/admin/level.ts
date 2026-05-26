import { Router, Response } from 'express';
import Container from 'typedi';
import Level from '../../../models/Level';
import Media from '../../../models/Media';
import { ResponseWrapper } from '../../responseWrapper';
import upload from '../../middleware/upload';
import { CloudinaryService } from '../../../services/common/CloudinaryService';
import { MediaType } from '../../../constants/enum';
import mongoose from 'mongoose';

export default (router: Router) => {
  const levelRouter = Router();
  const cloudinaryService = Container.get(CloudinaryService);

  router.use('/levels', levelRouter);

  /**
   * @swagger
   * /admin/levels:
   *   get:
   *     summary: Get all levels (Admin)
   *     tags: [Admin - Levels]
   *     parameters:
   *       - in: query
   *         name: type
   *         schema:
   *           type: string
   *           enum: [rich, charm]
   *         description: Optional level type to filter by
   *     responses:
   *       200:
   *         description: Levels fetched successfully
   *     security:
   *       - BearerAuth: []
   */
  levelRouter.get('/', async (req: any, res: Response) => {
    try {
      const query: any = {};
      if (req.query.type) {
        query.type = req.query.type;
      }
      const levels = await Level.find(query).populate('image').sort({ type: 1, levelNumber: 1 });

      const formattedLevels = await Promise.all(levels.map(async l => {
        const obj = l.toObject ? l.toObject() : { ...l };
        const levelNumber = obj.levelNumber || 0;

        // Dynamically compute rangeText/levelRange if missing in DB
        const computedRangeText = obj.rangeText || (levelNumber === 0 ? '0' : `${Math.floor((levelNumber - 1) / 5) * 5 + 1}-${Math.floor((levelNumber - 1) / 5) * 5 + 5}`);
        obj.rangeText = computedRangeText;
        obj.levelRange = computedRangeText;
        return obj;
      }));

      return ResponseWrapper.success(res, formattedLevels, 'Levels fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/levels:
   *   post:
   *     summary: Create a new level
   *     tags: [Admin - Levels]
   *     requestBody:
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               levelNumber: { type: integer }
   *               type: { type: string, enum: [rich, charm] }
   *               name: { type: string }
   *               minCoins: { type: integer }
   *               maxCoins: { type: integer }
   *               color: { type: string }
   *               rangeText: { type: string }
   *               levelRange: { type: string }
   *               image: { type: string, format: binary }
   *     responses:
   *       200:
   *         description: Level created successfully
   */
  levelRouter.post('/', upload.single('image'), async (req: any, res: Response) => {
    try {
      const { levelNumber, type, name, minCoins, maxCoins, color, rangeText, levelRange } = req.body;
      let mediaId = undefined;

      if (req.file) {
        const uploadResults = await cloudinaryService.uploadMedia(MediaType.image, [req.file], 'levels');
        if (uploadResults.length > 0) {
          const media = await Media.create({
            url: uploadResults[0].url,
            mimetype: uploadResults[0].mimetype || req.file.mimetype || 'image/jpeg',
            type: 'image',
            size: uploadResults[0].size || req.file.size,
            width: uploadResults[0].width,
            height: uploadResults[0].height
          });
          mediaId = media._id;
        }
      }

      const levelNum = Number(levelNumber);
      const computedRangeText = rangeText || levelRange || (levelNum === 0 ? '0' : `${Math.floor((levelNum - 1) / 5) * 5 + 1}-${Math.floor((levelNum - 1) / 5) * 5 + 5}`);

      const level = await Level.create({
        levelNumber: levelNum,
        type: type || 'rich',
        name,
        minCoins: Number(minCoins),
        maxCoins: Number(maxCoins),
        color,
        image: mediaId,
        rangeText: computedRangeText,
        levelRange: computedRangeText,
      });

      const populatedLevel = await Level.findById(level._id).populate('image');
      if (!populatedLevel) {
        throw new Error('Failed to retrieve created level');
      }

      const returnLevel = populatedLevel.toObject();

      return ResponseWrapper.success(res, returnLevel, 'Level created successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/levels/{id}:
   *   put:
   *     summary: Update a level
   *     tags: [Admin - Levels]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     requestBody:
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               levelNumber: { type: integer }
   *               type: { type: string, enum: [rich, charm] }
   *               name: { type: string }
   *               minCoins: { type: integer }
   *               maxCoins: { type: integer }
   *               color: { type: string }
   *               rangeText: { type: string }
   *               levelRange: { type: string }
   *               image: { type: string, format: binary }
   *     responses:
   *       200:
   *         description: Level updated successfully
   */
  levelRouter.put('/:id', upload.single('image'), async (req: any, res: Response) => {
    try {
      const { levelNumber, type, name, minCoins, maxCoins, color, rangeText, levelRange } = req.body;
      const updateData: any = {};

      if (levelNumber !== undefined) {
        const levelNum = Number(levelNumber);
        updateData.levelNumber = levelNum;
        if (!rangeText && !levelRange) {
          const computedRangeText = levelNum === 0 ? '0' : `${Math.floor((levelNum - 1) / 5) * 5 + 1}-${Math.floor((levelNum - 1) / 5) * 5 + 5}`;
          updateData.rangeText = computedRangeText;
          updateData.levelRange = computedRangeText;
        }
      }
      if (type !== undefined) updateData.type = type;
      if (name !== undefined) updateData.name = name;
      if (minCoins !== undefined) updateData.minCoins = Number(minCoins);
      if (maxCoins !== undefined) updateData.maxCoins = Number(maxCoins);
      if (color !== undefined) updateData.color = color;
      if (rangeText !== undefined) {
        updateData.rangeText = rangeText;
        updateData.levelRange = rangeText;
      }
      if (levelRange !== undefined) {
        updateData.levelRange = levelRange;
        updateData.rangeText = levelRange;
      }

      if (req.file) {
        const uploadResults = await cloudinaryService.uploadMedia(MediaType.image, [req.file], 'levels');
        if (uploadResults.length > 0) {
          const media = await Media.create({
            url: uploadResults[0].url,
            mimetype: uploadResults[0].mimetype || req.file.mimetype || 'image/jpeg',
            type: 'image',
            size: uploadResults[0].size || req.file.size,
            width: uploadResults[0].width,
            height: uploadResults[0].height
          });
          updateData.image = media._id;
        }
      }

      const updatedLevel = await Level.findByIdAndUpdate(req.params.id, updateData, { new: true }).populate('image');
      if (!updatedLevel) {
        throw new Error('Level not found');
      }

      const returnLevel = updatedLevel.toObject();

      return ResponseWrapper.success(res, returnLevel, 'Level updated successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/levels/{id}:
   *   delete:
   *     summary: Delete a level
   *     tags: [Admin - Levels]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Level deleted successfully
   */
  levelRouter.delete('/:id', async (req: any, res: Response) => {
    try {
      const deletedLevel = await Level.findByIdAndDelete(req.params.id);
      if (!deletedLevel) {
        throw new Error('Level not found');
      }
      return ResponseWrapper.success(res, null, 'Level deleted successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
