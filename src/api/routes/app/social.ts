import { Router, Response } from 'express';
import Container from 'typedi';
import { SocialService } from '../../../services/app/SocialService';
import { ResponseWrapper } from '../../responseWrapper';
import { appAuthMiddleware } from '../../middleware/appAuthMiddleware';

export default (router: Router) => {
  const socialService = Container.get(SocialService);
  const appRouter = Router();

  router.use('/social', appAuthMiddleware, appRouter);

  /**
   * @swagger
   * /app/social/follow:
   *   post:
   *     summary: Send a follow request
   *     tags: [Social]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - followingId
   *             properties:
   *               followingId:
   *                 type: string
   *     responses:
   *       201:
   *         description: Follow request sent
   */
  appRouter.post('/follow', async (req: any, res: Response) => {
    try {
      const followerId = req.user.id;
      const follow = await socialService.sendFollowRequest(followerId, req.body.followingId);
      return ResponseWrapper.success(res, follow, 'Follow request sent', 201);
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/social/follow/respond:
   *   post:
   *     summary: Accept or reject a follow request
   *     tags: [Social]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - followerId
   *               - status
   *             properties:
   *               followerId:
   *                 type: string
   *               status:
   *                 type: string
   *                 enum: [accepted, rejected]
   *     responses:
   *       200:
   *         description: Response recorded
   */
  appRouter.post('/follow/respond', async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const follow = await socialService.respondToFollowRequest(userId, req.body.followerId, req.body.status);
      return ResponseWrapper.success(res, follow, `Follow request ${req.body.status}`);
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/social/unfollow:
   *   post:
   *     summary: Unfollow a user
   *     tags: [Social]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - followingId
   *             properties:
   *               followingId:
   *                 type: string
   *     responses:
   *       200:
   *         description: Unfollowed successfully
   */
  appRouter.post('/unfollow', async (req: any, res: Response) => {
    try {
      const followerId = req.user.id;
      const result = await socialService.unfollow(followerId, req.body.followingId);
      return ResponseWrapper.success(res, result, 'Unfollowed successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/social/remove-follower:
   *   post:
   *     summary: Remove a follower
   *     tags: [Social]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - followerId
   *             properties:
   *               followerId:
   *                 type: string
   *     responses:
   *       200:
   *         description: Follower removed successfully
   */
  appRouter.post('/remove-follower', async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const result = await socialService.removeFollower(userId, req.body.followerId);
      return ResponseWrapper.success(res, result, 'Follower removed successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/social/friend-request:
   *   post:
   *     summary: Send a friend request
   *     tags: [Social]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - receiverId
   *             properties:
   *               receiverId:
   *                 type: string
   *     responses:
   *       201:
   *         description: Friend request sent
   */
  appRouter.post('/friend-request', async (req: any, res: Response) => {
    try {
      const senderId = req.user.id;
      const request = await socialService.sendFriendRequest(senderId, req.body.receiverId);
      return ResponseWrapper.success(res, request, 'Friend request sent', 201);
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/social/friend-request/respond:
   *   post:
   *     summary: Accept or reject a friend request
   *     tags: [Social]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - senderId
   *               - status
   *             properties:
   *               senderId:
   *                 type: string
   *               status:
   *                 type: string
   *                 enum: [accepted, rejected]
   *     responses:
   *       200:
   *         description: Response recorded
   */
  appRouter.post('/friend-request/respond', async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const request = await socialService.respondToFriendRequest(userId, req.body.senderId, req.body.status);
      return ResponseWrapper.success(res, request, `Friend request ${req.body.status}`);
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  appRouter.get('/followers', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const followers = await socialService.getFollowers(req.user.id, page, limit);
      return ResponseWrapper.success(res, followers, 'Followers fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/social/following:
   *   get:
   *     summary: Get following list
   *     tags: [Social]
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
   *         description: List of followed users
   */
  appRouter.get('/following', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const following = await socialService.getFollowing(req.user.id, page, limit);
      return ResponseWrapper.success(res, following, 'Following list fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/social/friends:
   *   get:
   *     summary: Get friends list (mutual followers)
   *     tags: [Social]
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
   *         description: List of friends
   */
  appRouter.get('/friends', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const friends = await socialService.getFriends(req.user.id, page, limit);
      return ResponseWrapper.success(res, friends, 'Friends list fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/social/followers/{userId}:
   *   get:
   *     summary: Get followers list for a specific user
   *     tags: [Social]
   *     parameters:
   *       - in: path
   *         name: userId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: List of followers
   */
  appRouter.get('/followers/:userId', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const followers = await socialService.getFollowers(req.params.userId, page, limit);
      return ResponseWrapper.success(res, followers, 'Followers fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/social/following/{userId}:
   *   get:
   *     summary: Get following list for a specific user
   *     tags: [Social]
   *     parameters:
   *       - in: path
   *         name: userId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: List of followed users
   */
  appRouter.get('/following/:userId', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const following = await socialService.getFollowing(req.params.userId, page, limit);
      return ResponseWrapper.success(res, following, 'Following list fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
