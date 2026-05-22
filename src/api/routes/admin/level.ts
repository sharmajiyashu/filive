import { Router, Response } from 'express';
import fs from 'fs';
import path from 'path';
import Level from '../../../models/Level';
import { ResponseWrapper } from '../../responseWrapper';
import upload from '../../middleware/upload';

function saveLevelImageLocally(file: Express.Multer.File): string {
  const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'levels');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  const fileExt = path.extname(file.originalname);
  const fileName = `level_${Date.now()}_${Math.round(Math.random() * 1e9)}${fileExt}`;
  const filePath = path.join(uploadDir, fileName);
  fs.writeFileSync(filePath, file.buffer);
  return `/public/uploads/levels/${fileName}`;
}

export default (router: Router) => {
  const levelRouter = Router();

  router.use('/levels', levelRouter);

  /**
   * @swagger
   * /admin/levels:
   *   get:
   *     summary: Get all levels (Admin)
   *     tags: [Admin - Levels]
   *     responses:
   *       200:
   *         description: Levels fetched successfully
   */
  levelRouter.get('/', async (req: any, res: Response) => {
    try {
      const levels = await Level.find().sort({ levelNumber: 1 });
      return ResponseWrapper.success(res, levels, 'Levels fetched successfully');
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
   *               name: { type: string }
   *               minCoins: { type: integer }
   *               maxCoins: { type: integer }
   *               color: { type: string }
   *               image: { type: string, format: binary }
   *     responses:
   *       200:
   *         description: Level created successfully
   */
  levelRouter.post('/', upload.single('image'), async (req: any, res: Response) => {
    try {
      const { levelNumber, name, minCoins, maxCoins, color } = req.body;
      let imageUrl = '';

      if (req.file) {
        imageUrl = saveLevelImageLocally(req.file);
      }

      const level = await Level.create({
        levelNumber: Number(levelNumber),
        name,
        minCoins: Number(minCoins),
        maxCoins: Number(maxCoins),
        color,
        image: imageUrl || undefined,
      });

      return ResponseWrapper.success(res, level, 'Level created successfully');
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
   *               name: { type: string }
   *               minCoins: { type: integer }
   *               maxCoins: { type: integer }
   *               color: { type: string }
   *               image: { type: string, format: binary }
   *     responses:
   *       200:
   *         description: Level updated successfully
   */
  levelRouter.put('/:id', upload.single('image'), async (req: any, res: Response) => {
    try {
      const { levelNumber, name, minCoins, maxCoins, color } = req.body;
      const updateData: any = {};

      if (levelNumber !== undefined) updateData.levelNumber = Number(levelNumber);
      if (name !== undefined) updateData.name = name;
      if (minCoins !== undefined) updateData.minCoins = Number(minCoins);
      if (maxCoins !== undefined) updateData.maxCoins = Number(maxCoins);
      if (color !== undefined) updateData.color = color;

      if (req.file) {
        updateData.image = saveLevelImageLocally(req.file);
      }

      const updatedLevel = await Level.findByIdAndUpdate(req.params.id, updateData, { new: true });
      if (!updatedLevel) {
        throw new Error('Level not found');
      }

      return ResponseWrapper.success(res, updatedLevel, 'Level updated successfully');
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
