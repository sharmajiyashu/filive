import { Router, Response } from 'express';
import Container from 'typedi';
import { CloudinaryService } from '../../../services/common/CloudinaryService';
import { MediaService } from '../../../services/common/MediaService';
import { MediaType } from '../../../constants/enum';
import Career from '../../../models/Career';
import { ResponseWrapper } from '../../responseWrapper';
import upload from '../../middleware/upload';

export default (router: Router) => {
  const careerRouter = Router();
  const cloudinaryService = Container.get(CloudinaryService);
  const mediaService = Container.get(MediaService);

  router.use('/careers', careerRouter);

  /**
   * @swagger
   * /admin/careers:
   *   get:
   *     summary: Get all careers (Admin)
   *     tags: [Admin - Careers]
   *     responses:
   *       200:
   *         description: Careers fetched successfully
   */
  careerRouter.get('/', async (req: any, res: Response) => {
    try {
      const careers = await Career.find().populate('image');
      return ResponseWrapper.success(res, careers, 'Careers fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/careers:
   *   post:
   *     summary: Create a new career with image
   *     tags: [Admin - Careers]
   *     requestBody:
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               name: { type: string }
   *               image: { type: string, format: binary }
   *     responses:
   *       200:
   *         description: Career created successfully
   */
  careerRouter.post('/', upload.single('image'), async (req: any, res: Response) => {
    try {
      const { name } = req.body;
      let imageId;

      if (req.file) {
        const uploadResults = await cloudinaryService.uploadMedia(MediaType.image, [req.file], 'careers');
        if (uploadResults.length > 0) {
          const media = await mediaService.createMedia({ ...uploadResults[0] });
          imageId = media._id;
        }
      }

      const career = await Career.create({ name, image: imageId });
      return ResponseWrapper.success(res, career, 'Career created successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/careers/{id}:
   *   delete:
   *     summary: Delete a career
   *     tags: [Admin - Careers]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Career deleted successfully
   */
  careerRouter.delete('/:id', async (req: any, res: Response) => {
    try {
      await Career.findByIdAndDelete(req.params.id);
      return ResponseWrapper.success(res, null, 'Career deleted successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  careerRouter.put('/:id', upload.single('image'), async (req: any, res: Response) => {
    try {
      const { name } = req.body;
      const updateData: any = {};
      if (name) updateData.name = name;

      if (req.file) {
        const uploadResults = await cloudinaryService.uploadMedia(MediaType.image, [req.file], 'careers');
        if (uploadResults.length > 0) {
          const media = await mediaService.createMedia({ ...uploadResults[0] });
          updateData.image = media._id;
        }
      }

      const career = await Career.findByIdAndUpdate(req.params.id, updateData, { new: true }).populate('image');
      return ResponseWrapper.success(res, career, 'Career updated successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
