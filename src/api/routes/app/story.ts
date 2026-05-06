import { Router, Request, Response } from 'express';
import Container from 'typedi';
import { StoryService } from '../../../services/app/StoryService';
import { ResponseWrapper } from '../../responseWrapper';
import upload from '../../middleware/upload';

export default (router: Router) => {
  const storyService = Container.get(StoryService);
  const appRouter = Router();

  router.use('/stories', appRouter);

  /**
   * @swagger
   * /app/stories:
   *   post:
   *     summary: Create a new story
   *     tags: [Stories]
   *     security:
   *       - BearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             required:
   *               - content
   *             properties:
   *               content:
   *                 type: string
   *               images:
   *                 type: array
   *                 items:
   *                   type: string
   *                   format: binary
   *               tags:
   *                 type: string
   *                 description: JSON string of tags array
   *     responses:
   *       201:
   *         description: Story created successfully
   */
  appRouter.post('/', upload.array('images', 10), async (req: any, res: Response) => {
    try {
      const userId = req.user.id; // Corrected from _id to id to match auth middleware
      const story = await storyService.createStory(userId, req.body, req.files as Express.Multer.File[]);
      return ResponseWrapper.success(res, story, 'Story created successfully', 201);
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/stories/explore:
   *   get:
   *     summary: Explore stories
   *     tags: [Stories]
   *     parameters:
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: List of stories
   */
  appRouter.get('/explore', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '10');
      const userId = req.user?.id;
      const result = await storyService.getExploreStories(userId, page, limit);
      return ResponseWrapper.success(res, result, 'Stories fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/stories/{id}/like:
   *   post:
   *     summary: Like or unlike a story
   *     tags: [Stories]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Story liked/unliked successfully
   */
  appRouter.post('/:id/like', async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const result = await storyService.likeStory(userId, req.params.id);
      return ResponseWrapper.success(res, result, result.liked ? 'Story liked' : 'Story unliked');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/stories/{id}/comment:
   *   post:
   *     summary: Comment on a story
   *     tags: [Stories]
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
   *               - content
   *             properties:
   *               content:
   *                 type: string
   *     responses:
   *       201:
   *         description: Comment added successfully
   */
  appRouter.post('/:id/comment', async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const comment = await storyService.commentOnStory(userId, req.params.id, req.body.content);
      return ResponseWrapper.success(res, comment, 'Comment added successfully', 201);
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/stories/{id}/comments:
   *   get:
   *     summary: Get comments for a story
   *     tags: [Stories]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: List of comments
   */
  appRouter.get('/:id/comments', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '10');
      const userId = req.user?.id;
      const result = await storyService.getStoryComments(req.params.id as string, userId, page, limit);
      return ResponseWrapper.success(res, result, 'Comments fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/comments/{id}/like:
   *   post:
   *     summary: Like or unlike a comment
   *     tags: [Comments]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Comment liked/unliked successfully
   */
  router.post('/comments/:id/like', async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const result = await storyService.likeComment(userId, req.params.id);
      return ResponseWrapper.success(res, result, result.liked ? 'Comment liked' : 'Comment unliked');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
