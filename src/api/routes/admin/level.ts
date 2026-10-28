import { Router, Response } from 'express';
import Container from 'typedi';
import Level from '../../../models/Level';
import Media from '../../../models/Media';
import { ResponseWrapper } from '../../responseWrapper';
import upload from '../../middleware/upload';
import { CloudinaryService } from '../../../services/common/CloudinaryService';
import { LevelService, formatLevelImageUrl } from '../../../services/app/LevelService';
import { seedLevels } from '../../../seeders/LevelSeeder';
import { MediaType } from '../../../constants/enum';

export default (router: Router) => {
  const levelRouter = Router();
  const cloudinaryService = Container.get(CloudinaryService);
  const levelService = Container.get(LevelService);

  router.use('/levels', levelRouter);

  /**
   * @swagger
   * /admin/levels:
   *   get:
   *     summary: Get all levels (Admin)
   *     tags: [Admin - Levels]
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

        const computedRangeText = obj.rangeText || (levelNumber === 0 ? '0' : (levelNumber >= 100 ? '100' : `${levelNumber}-${levelNumber + 9}`));
        obj.rangeText = computedRangeText;
        obj.levelRange = computedRangeText;
        const rawUrl = obj.image?.url || (typeof obj.image === 'string' ? obj.image : obj.imageUrl);
        obj.imageUrl = formatLevelImageUrl(rawUrl);
        obj.badgeType = obj.badgeType || (obj.imageUrl?.endsWith('.svga') ? 'svga' : 'image');
        return obj;
      }));

      return ResponseWrapper.success(res, formattedLevels, 'Levels fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/levels/seed-defaults:
   *   post:
   *     summary: Re-seed default rich and charm levels with bundled icons
   *     tags: [Admin - Levels]
   */
  levelRouter.post('/seed-defaults', async (_req: any, res: Response) => {
    try {
      await seedLevels();
      levelService.clearCache();
      const allLevels = await levelService.getAllLevels();
      return ResponseWrapper.success(res, allLevels, 'Default levels seeded and refreshed successfully');
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
   */
  levelRouter.post('/', upload.single('image'), async (req: any, res: Response) => {
    try {
      const { levelNumber, type, name, minCoins, maxCoins, color, secondaryColor, rangeText, levelRange, badgeType } = req.body;
      let mediaId = undefined;

      if (req.file) {
        const isSvga = req.file.originalname?.endsWith('.svga') || req.file.mimetype === 'application/svga';
        const uploadResults = await cloudinaryService.uploadMedia(
          isSvga ? MediaType.svga : MediaType.image,
          [req.file],
          'levels'
        );
        if (uploadResults.length > 0) {
          const media = await Media.create({
            url: uploadResults[0].url,
            mimetype: uploadResults[0].mimetype || req.file.mimetype || (isSvga ? 'application/svga' : 'image/jpeg'),
            type: isSvga ? 'svga' : 'image',
            size: uploadResults[0].size || req.file.size,
            width: uploadResults[0].width,
            height: uploadResults[0].height,
          });
          mediaId = media._id;
        }
      }

      const levelNum = Number(levelNumber);
      const computedRangeText = rangeText || levelRange || (levelNum === 0 ? '0' : (levelNum >= 100 ? '100' : `${levelNum}-${levelNum + 9}`));

      const level = await Level.create({
        levelNumber: levelNum,
        type: type || 'rich',
        name,
        minCoins: Number(minCoins),
        maxCoins: Number(maxCoins),
        color,
        secondaryColor: secondaryColor || undefined,
        image: mediaId,
        rangeText: computedRangeText,
        levelRange: computedRangeText,
        badgeType: badgeType || undefined,
      });

      levelService.clearCache();

      const populatedLevel = await Level.findById(level._id).populate('image');
      if (!populatedLevel) {
        throw new Error('Failed to retrieve created level');
      }

      const returnLevel = populatedLevel.toObject();
      returnLevel.imageUrl = formatLevelImageUrl(returnLevel.image?.url);

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
   */
  levelRouter.put('/:id', upload.single('image'), async (req: any, res: Response) => {
    try {
      const { levelNumber, type, name, minCoins, maxCoins, color, secondaryColor, rangeText, levelRange, badgeType } = req.body;
      const updateData: any = {};

      if (levelNumber !== undefined) {
        const levelNum = Number(levelNumber);
        updateData.levelNumber = levelNum;
        if (!rangeText && !levelRange) {
          const computedRangeText = levelNum === 0 ? '0' : (levelNum >= 100 ? '100' : `${levelNum}-${levelNum + 9}`);
          updateData.rangeText = computedRangeText;
          updateData.levelRange = computedRangeText;
        }
      }
      if (type !== undefined) updateData.type = type;
      if (name !== undefined) updateData.name = name;
      if (minCoins !== undefined) updateData.minCoins = Number(minCoins);
      if (maxCoins !== undefined) updateData.maxCoins = Number(maxCoins);
      if (color !== undefined) updateData.color = color;
      if (secondaryColor !== undefined) updateData.secondaryColor = secondaryColor;
      if (rangeText !== undefined) {
        updateData.rangeText = rangeText;
        updateData.levelRange = rangeText;
      }
      if (levelRange !== undefined) {
        updateData.levelRange = levelRange;
        updateData.rangeText = levelRange;
      }
      if (badgeType !== undefined) updateData.badgeType = badgeType;

      if (req.file) {
        const isSvga = req.file.originalname?.endsWith('.svga') || req.file.mimetype === 'application/svga';
        const uploadResults = await cloudinaryService.uploadMedia(
          isSvga ? MediaType.svga : MediaType.image,
          [req.file],
          'levels'
        );
        if (uploadResults.length > 0) {
          const media = await Media.create({
            url: uploadResults[0].url,
            mimetype: uploadResults[0].mimetype || req.file.mimetype || (isSvga ? 'application/svga' : 'image/jpeg'),
            type: isSvga ? 'svga' : 'image',
            size: uploadResults[0].size || req.file.size,
            width: uploadResults[0].width,
            height: uploadResults[0].height,
          });
          updateData.image = media._id;
        }
      }

      const updatedLevel = await Level.findByIdAndUpdate(req.params.id, updateData, { new: true }).populate('image');
      if (!updatedLevel) {
        throw new Error('Level not found');
      }

      levelService.clearCache();

      const returnLevel = updatedLevel.toObject();
      returnLevel.imageUrl = formatLevelImageUrl(returnLevel.image?.url);

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
   */
  levelRouter.delete('/:id', async (req: any, res: Response) => {
    try {
      const deletedLevel = await Level.findByIdAndDelete(req.params.id);
      if (!deletedLevel) {
        throw new Error('Level not found');
      }
      levelService.clearCache();
      return ResponseWrapper.success(res, null, 'Level deleted successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
