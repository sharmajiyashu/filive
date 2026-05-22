import { Router, Response } from 'express';
import Container from 'typedi';
import { CloudinaryService } from '../../../services/common/CloudinaryService';
import { MediaService } from '../../../services/common/MediaService';
import { MediaType } from '../../../constants/enum';
import Hobby from '../../../models/Hobby';
import { ResponseWrapper } from '../../responseWrapper';
import upload from '../../middleware/upload';

export default (router: Router) => {
  const hobbyRouter = Router();
  const cloudinaryService = Container.get(CloudinaryService);
  const mediaService = Container.get(MediaService);

  router.use('/hobbies', hobbyRouter);

  /**
   * @swagger
   * /admin/hobbies:
   *   get:
   *     summary: Get all hobbies (Admin)
   *     tags: [Admin - Hobbies]
   *     responses:
   *       200:
   *         description: Hobbies fetched successfully
   */
  hobbyRouter.get('/', async (req: any, res: Response) => {
    try {
      const hobbies = await Hobby.find().populate('image');
      return ResponseWrapper.success(res, hobbies, 'Hobbies fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/hobbies:
   *   post:
   *     summary: Create a new hobby with image upload or mediaId
   *     tags: [Admin - Hobbies]
   *     requestBody:
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               name: { type: string }
   *               type: { type: string, enum: [sports, food, music] }
   *               image: { type: string, format: binary }
   *               mediaId: { type: string }
   *     responses:
   *       200:
   *         description: Hobby created successfully
   */
  hobbyRouter.post('/', upload.single('image'), async (req: any, res: Response) => {
    try {
      const { name, type, mediaId, imageId } = req.body;
      let targetImageId = mediaId || imageId;

      if (req.file) {
        const uploadResults = await cloudinaryService.uploadMedia(MediaType.image, [req.file], 'hobbies');
        if (uploadResults.length > 0) {
          const media = await mediaService.createMedia({ ...uploadResults[0] });
          targetImageId = media._id;
        }
      }

      const hobby = await Hobby.create({
        name,
        type,
        image: targetImageId
      });

      const populatedHobby = await Hobby.findById(hobby._id).populate('image');
      return ResponseWrapper.success(res, populatedHobby, 'Hobby created successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/hobbies/{id}:
   *   delete:
   *     summary: Delete a hobby
   *     tags: [Admin - Hobbies]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Hobby deleted successfully
   */
  hobbyRouter.delete('/:id', async (req: any, res: Response) => {
    try {
      await Hobby.findByIdAndDelete(req.params.id);
      return ResponseWrapper.success(res, null, 'Hobby deleted successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  hobbyRouter.put('/:id', upload.single('image'), async (req: any, res: Response) => {
    try {
      const { name, type } = req.body;
      const updateData: any = {};
      if (name) updateData.name = name;
      if (type) updateData.type = type;

      if (req.file) {
        const uploadResults = await cloudinaryService.uploadMedia(MediaType.image, [req.file], 'hobbies');
        if (uploadResults.length > 0) {
          const media = await mediaService.createMedia({ ...uploadResults[0] });
          updateData.image = media._id;
        }
      }

      const hobby = await Hobby.findByIdAndUpdate(req.params.id, updateData, { new: true }).populate('image');
      return ResponseWrapper.success(res, hobby, 'Hobby updated successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
