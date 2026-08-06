import { Router, Response } from 'express';
import Reaction from '../../../models/Reaction';
import { ResponseWrapper } from '../../responseWrapper';

export default (router: Router) => {
  const reactionRouter = Router();

  router.use('/reactions', reactionRouter);

  /**
   * @swagger
   * /app/reactions:
   *   get:
   *     summary: Get list of active reactions for chat/app
   *     tags: [App Reactions]
   *     security:
   *       - bearerAuth: []
   */
  reactionRouter.get('/', async (req: any, res: Response) => {
    try {
      const reactions = await Reaction.find({ isActive: true })
        .populate('mediaId')
        .sort({ sortOrder: 1, createdAt: -1 });

      return ResponseWrapper.success(res, reactions, 'Active reactions fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
