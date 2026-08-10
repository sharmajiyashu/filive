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
   *     summary: Get all users with optional country, search, and type (online/new/all) filters
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
   *       - in: query
   *         name: search
   *         schema:
   *           type: string
   *         description: Search by integer userId, name, email, or mobile
   *       - in: query
   *         name: userId
   *         schema:
   *           type: string
   *         description: Alias parameter for search by userId
   *       - in: query
   *         name: country
   *         schema:
   *           type: string
   *         description: Filter users by country (name, ISO code, or countryId)
   *       - in: query
   *         name: countryId
   *         schema:
   *           type: string
   *         description: Filter users by countryId
   *       - in: query
   *         name: countryCode
   *         schema:
   *           type: string
   *         description: Filter users by ISO country code
   *       - in: query
   *         name: type
   *         schema:
   *           type: string
   *           enum: [online, new, all]
   *         description: Filter by user type (online = online users, new = new users, all = all users)
   *       - in: query
   *         name: isOnline
   *         schema:
   *           type: boolean
   *         description: Shortcut filter for online users
   *       - in: query
   *         name: isNew
   *         schema:
   *           type: boolean
   *         description: Shortcut filter for new users
   *     responses:
   *       200:
   *         description: List of users
   */
  appRouter.get('/', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '10');
      const search = req.query.search?.toString() || req.query.userId?.toString();
      const country = (req.query.country || req.query.countryId || req.query.countryCode)?.toString();
      
      let type = req.query.type?.toString();
      if (!type) {
        if (req.query.isOnline === 'true' || req.query.isOnline === true) {
          type = 'online';
        } else if (req.query.isNew === 'true' || req.query.isNew === true) {
          type = 'new';
        }
      }

      const currentUserId = req.user.id;
      const result = await userService.getAllUsers(page, limit, currentUserId, search, country, type);
      return ResponseWrapper.success(res, result, 'Users fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/users/online:
   *   get:
   *     summary: Get online users list with optional country filter
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
   *       - in: query
   *         name: search
   *         schema:
   *           type: string
   *       - in: query
   *         name: country
   *         schema:
   *           type: string
   *         description: Filter online users by country (name, ISO code, or countryId)
   *       - in: query
   *         name: countryId
   *         schema:
   *           type: string
   *       - in: query
   *         name: countryCode
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: List of online users
   */
  appRouter.get('/online', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '10');
      const search = req.query.search?.toString() || req.query.userId?.toString();
      const country = (req.query.country || req.query.countryId || req.query.countryCode)?.toString();
      const currentUserId = req.user.id;
      const result = await userService.getAllUsers(page, limit, currentUserId, search, country, 'online');
      return ResponseWrapper.success(res, result, 'Online users fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/users/new:
   *   get:
   *     summary: Get new registered users list with optional country filter
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
   *       - in: query
   *         name: search
   *         schema:
   *           type: string
   *       - in: query
   *         name: country
   *         schema:
   *           type: string
   *         description: Filter new users by country (name, ISO code, or countryId)
   *       - in: query
   *         name: countryId
   *         schema:
   *           type: string
   *       - in: query
   *         name: countryCode
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: List of new users
   */
  appRouter.get('/new', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '10');
      const search = req.query.search?.toString() || req.query.userId?.toString();
      const country = (req.query.country || req.query.countryId || req.query.countryCode)?.toString();
      const currentUserId = req.user.id;
      const result = await userService.getAllUsers(page, limit, currentUserId, search, country, 'new');
      return ResponseWrapper.success(res, result, 'New users fetched successfully');
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
      const richLevels = await levelService.getAllLevels('rich');
      const charmLevels = await levelService.getAllLevels('charm');

      const userId = req.user.id;
      const user = await User.findById(userId);

      const richCoins = user && user.wealthCoins !== undefined ? user.wealthCoins : (user?.coins || 0);
      const charmCoins = user?.charmCoins || 0;

      const currentRichLevelInfo = await levelService.getLevelInfoForCoins(richCoins, 'rich');
      const currentCharmLevelInfo = await levelService.getLevelInfoForCoins(charmCoins, 'charm');

      return ResponseWrapper.success(res, {
        levels: richLevels, // backward compatibility
        currentUserLevelInfo: currentRichLevelInfo, // backward compatibility
        richLevels,
        charmLevels,
        currentRichLevelInfo,
        currentCharmLevelInfo
      }, 'Levels lists and user progression fetched successfully');
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
