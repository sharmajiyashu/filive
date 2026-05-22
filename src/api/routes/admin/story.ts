import { Router, Response } from 'express';
import Story from '../../../models/Story';
import { ResponseWrapper } from '../../responseWrapper';

export default (router: Router) => {
  const storyRouter = Router();

  router.use('/stories', storyRouter);

  /**
   * @swagger
   * /admin/stories:
   *   get:
   *     summary: Get all stories (Admin)
   *     tags: [Admin - Stories]
   *     parameters:
   *       - in: query
   *         name: page
   *         schema: { type: integer }
   *       - in: query
   *         name: limit
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: Stories fetched successfully
   */
  storyRouter.get('/', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '10');

      const stories = await Story.find()
        .populate({
          path: 'userId',
          select: 'name email profileImage bio isPremium location country isBlocked',
          populate: { path: 'profileImage' }
        })
        .populate('images')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit);

      const total = await Story.countDocuments();

      return ResponseWrapper.success(res, {
        stories,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      }, 'Stories fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/stories/{id}/block:
   *   put:
   *     summary: Toggle story block status (Admin)
   *     tags: [Admin - Stories]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Story block status toggled successfully
   */
  storyRouter.put('/:id/block', async (req: any, res: Response) => {
    try {
      const storyId = req.params.id;
      const story = await Story.findById(storyId);
      if (!story) {
        throw new Error('Story not found');
      }

      story.isBlocked = !story.isBlocked;
      await story.save();

      return ResponseWrapper.success(res, story, `Story ${story.isBlocked ? 'blocked' : 'unblocked'} successfully`);
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
