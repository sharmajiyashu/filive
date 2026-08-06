import { Router, Response } from 'express';
import Container from 'typedi';
import { ReactionService } from '../../../services/admin/ReactionService';
import { ResponseWrapper } from '../../responseWrapper';
import upload from '../../middleware/upload';

export default (router: Router) => {
  const reactionService = Container.get(ReactionService);
  const reactionRouter = Router();

  router.use('/reactions', reactionRouter);

  /**
   * @swagger
   * /admin/reactions/seed:
   *   post:
   *     summary: Seed 20 default animated GIF reactions
   *     tags: [Admin Reactions]
   *     security:
   *       - bearerAuth: []
   */
  reactionRouter.post('/seed', async (req: any, res: Response) => {
    try {
      const result = await reactionService.seedReactions();
      return ResponseWrapper.success(res, result, 'Reactions seeded successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/reactions:
   *   get:
   *     summary: Get paginated list of all reactions
   *     tags: [Admin Reactions]
   *     security:
   *       - bearerAuth: []
   */
  reactionRouter.get('/', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '50');
      const search = req.query.search?.toString();
      const category = req.query.category?.toString();
      const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined;

      const result = await reactionService.getAllReactions({ page, limit, search, category, isActive });
      return ResponseWrapper.success(res, result, 'Reactions retrieved successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/reactions/{id}:
   *   get:
   *     summary: Get single reaction by ID
   *     tags: [Admin Reactions]
   *     security:
   *       - bearerAuth: []
   */
  reactionRouter.get('/:id', async (req: any, res: Response) => {
    try {
      const result = await reactionService.getReactionById(req.params.id);
      return ResponseWrapper.success(res, result, 'Reaction retrieved successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/reactions:
   *   post:
   *     summary: Create a new reaction
   *     tags: [Admin Reactions]
   *     security:
   *       - bearerAuth: []
   */
  reactionRouter.post('/', upload.single('gif'), async (req: any, res: Response) => {
    try {
      const result = await reactionService.createReaction(req.body, req.file);
      return ResponseWrapper.success(res, result, 'Reaction created successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/reactions/{id}:
   *   put:
   *     summary: Update reaction by ID
   *     tags: [Admin Reactions]
   *     security:
   *       - bearerAuth: []
   */
  reactionRouter.put('/:id', upload.single('gif'), async (req: any, res: Response) => {
    try {
      const result = await reactionService.updateReaction(req.params.id, req.body, req.file);
      return ResponseWrapper.success(res, result, 'Reaction updated successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/reactions/{id}:
   *   delete:
   *     summary: Delete reaction by ID
   *     tags: [Admin Reactions]
   *     security:
   *       - bearerAuth: []
   */
  reactionRouter.delete('/:id', async (req: any, res: Response) => {
    try {
      const result = await reactionService.deleteReaction(req.params.id);
      return ResponseWrapper.success(res, result, 'Reaction deleted successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
