import { Router, Request, Response } from 'express';
import Container from 'typedi';
import { UserService } from '../../../services/app/UserService';
import { ResponseWrapper } from '../../responseWrapper';
import { appAuthMiddleware } from '../../middleware/appAuthMiddleware';

export default (router: Router) => {
  const userService = Container.get(UserService);
  const appRouter = Router();

  router.use('/users', appAuthMiddleware, appRouter);

  /**
   * @swagger
   * /app/users:
   *   get:
   *     summary: Get all users
   *     tags: [Users]
   *     security:
   *       - BearerAuth: []
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
   *         description: List of users
   */
  appRouter.get('/', async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '10');
      const result = await userService.getAllUsers(page, limit);
      return ResponseWrapper.success(res, result, 'Users fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/users/{id}:
   *   get:
   *     summary: Get user details
   *     tags: [Users]
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: User details with followers, following and stories
   */
  appRouter.get('/:id', async (req: any, res: Response) => {
    try {
      const visitorId = req.user.id;
      const followersPage = parseInt(req.query.followersPage?.toString() || '1');
      const followingPage = parseInt(req.query.followingPage?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '10');
      
      const result = await userService.getUserDetail(req.params.id as string, visitorId, followersPage, followingPage, limit);
      return ResponseWrapper.success(res, result, 'User details fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
