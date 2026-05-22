import { Router, Request, Response } from 'express';
import Container from 'typedi';
import { UserService } from '../../../services/app/UserService';
import { ResponseWrapper } from '../../responseWrapper';
import { appAuthMiddleware } from '../../middleware/appAuthMiddleware';
import { LevelService } from '../../../services/app/LevelService';
import User from '../../../models/User';

export default (router: Router) => {
  const userService = Container.get(UserService);
  const appRouter = Router();

  router.use('/users', appRouter);

  /**
   * @swagger
   * /app/users:
   *   get:
   *     summary: Get all users
   *     tags: [Users]
   *     security:
   *       - bearerAuth: []
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
  appRouter.get('/', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '10');
      const currentUserId = req.user.id;
      const result = await userService.getAllUsers(page, limit, currentUserId);
      return ResponseWrapper.success(res, result, 'Users fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/users/blocked:
   *   get:
   *     summary: Get all blocked users list with pagination
   *     tags: [Users]
   *     security:
   *       - bearerAuth: []
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
   *         description: List of blocked users
   */
  appRouter.get('/blocked', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '10');
      const blockerId = req.user.id;
      const result = await userService.getBlockedList(blockerId, page, limit);
      return ResponseWrapper.success(res, result, 'Blocked list fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/users/levels:
   *   get:
   *     summary: Get all level configurations and the current user's level progression
   *     tags: [Users]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Levels fetched successfully
   */
  appRouter.get('/levels', async (req: any, res: Response) => {
    try {
      const levelService = Container.get(LevelService);
      const levels = await levelService.getAllLevels();

      const userId = req.user.id;
      const user = await User.findById(userId);
      const currentUserLevelInfo = await levelService.getLevelInfoForCoins(user?.coins || 0);

      return ResponseWrapper.success(res, {
        levels,
        currentUserLevelInfo
      }, 'Levels list and user progression fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/users/visitors:
   *   get:
   *     summary: Get visitors list of the logged-in user with pagination
   *     tags: [Users]
   *     security:
   *       - bearerAuth: []
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
   *         description: List of visitors for the current user
   */
  appRouter.get('/visitors', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '10');
      const userId = req.user.id;
      const result = await userService.getVisitorsList(userId, userId, page, limit);
      return ResponseWrapper.success(res, result, 'Visitors list fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/users/visitors/{id}:
   *   get:
   *     summary: Get visitors list of a specific user by user ID with pagination
   *     tags: [Users]
   *     security:
   *       - bearerAuth: []
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
   *         description: List of visitors for the specified user
   */
  appRouter.get('/visitors/:id', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '10');
      const userId = req.params.id;
      const currentUserId = req.user.id;
      const result = await userService.getVisitorsList(userId, currentUserId, page, limit);
      return ResponseWrapper.success(res, result, 'Visitors list fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/users/{id}/visitors:
   *   get:
   *     summary: Get visitors list of a specific user by user ID with pagination (Alternative path)
   *     tags: [Users]
   *     security:
   *       - bearerAuth: []
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
   *         description: List of visitors for the specified user
   */
  appRouter.get('/:id/visitors', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '10');
      const userId = req.params.id;
      const currentUserId = req.user.id;
      const result = await userService.getVisitorsList(userId, currentUserId, page, limit);
      return ResponseWrapper.success(res, result, 'Visitors list fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**

   * @swagger
   * /app/users/block/{id}:
   *   post:
   *     summary: Block or unblock a user
   *     tags: [Users]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Block/Unblock toggle status
   */
  appRouter.post('/block/:id', async (req: any, res: Response) => {
    try {
      const blockerId = req.user.id;
      const blockedId = req.params.id;
      const result = await userService.toggleBlockUser(blockerId, blockedId);
      return ResponseWrapper.success(res, result, result.message);
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
   *       - bearerAuth: []
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
