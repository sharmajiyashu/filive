import { Router, Response } from 'express';
import Container from 'typedi';
import { CloudinaryService } from '../../../services/common/CloudinaryService';
import { MediaService } from '../../../services/common/MediaService';
import { MediaType } from '../../../constants/enum';
import Feedback from '../../../models/Feedback';
import { ResponseWrapper } from '../../responseWrapper';
import { appAuthMiddleware } from '../../middleware/appAuthMiddleware';
import upload from '../../middleware/upload';

export default (router: Router) => {
  const feedbackRouter = Router();
  const cloudinaryService = Container.get(CloudinaryService);
  const mediaService = Container.get(MediaService);

  router.use('/help-feedback', appAuthMiddleware, feedbackRouter);

  /**
   * @swagger
   * /app/help-feedback:
   *   post:
   *     summary: Submit a help & feedback ticket
   *     tags: [Help & Feedback]
   *     security:
   *       - BearerAuth: []
   *     requestBody:
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               email: { type: string }
   *               feedbackType: { type: string }
   *               description: { type: string }
   *               images:
   *                 type: array
   *                 items:
   *                   type: string
   *                   format: binary
   *     responses:
   *       200:
   *         description: Help & Feedback submitted successfully
   */
  feedbackRouter.post('/', upload.array('images', 10), async (req: any, res: Response) => {
    try {
      const { email, feedbackType, description } = req.body;
      const userId = req.user.id;

      if (!email || !feedbackType || !description) {
        throw new Error('Email, feedbackType, and description are required');
      }

      const mediaIds: any[] = [];

      // Parse existing media IDs from request body if any
      let bodyImages = req.body.images;
      if (bodyImages) {
        if (typeof bodyImages === 'string') {
          try {
            bodyImages = JSON.parse(bodyImages);
          } catch (e) {
            bodyImages = bodyImages.split(',').map((s: string) => s.trim()).filter(Boolean);
          }
        }
        if (Array.isArray(bodyImages)) {
          mediaIds.push(...bodyImages);
        } else if (typeof bodyImages === 'string' && bodyImages.trim() !== '') {
          mediaIds.push(bodyImages);
        }
      }

      // Handle uploaded files
      const files = req.files as Express.Multer.File[];
      if (files && files.length > 0) {
        const uploadResults = await cloudinaryService.uploadMedia(MediaType.image, files, 'feedbacks');
        for (const result of uploadResults) {
          const media = await mediaService.createMedia({ ...result });
          mediaIds.push(media._id);
        }
      }

      const feedback = await Feedback.create({
        email,
        feedbackType,
        description,
        images: mediaIds,
        userId,
        status: 'pending'
      });

      const populatedFeedback = await Feedback.findById(feedback._id).populate('images');
      return ResponseWrapper.success(res, populatedFeedback, 'Help & Feedback submitted successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
