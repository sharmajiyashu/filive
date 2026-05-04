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
      const followerId = req.user._id;
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
      const userId = req.user._id;
      const follow = await socialService.respondToFollowRequest(userId, req.body.followerId, req.body.status);
      return ResponseWrapper.success(res, follow, `Follow request ${req.body.status}`);
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
      const senderId = req.user._id;
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
      const userId = req.user._id;
      const request = await socialService.respondToFriendRequest(userId, req.body.senderId, req.body.status);
      return ResponseWrapper.success(res, request, `Friend request ${req.body.status}`);
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/social/followers:
   *   get:
   *     summary: Get followers list
   *     tags: [Social]
   *     responses:
   *       200:
   *         description: List of followers
   */
  appRouter.get('/followers', async (req: any, res: Response) => {
    try {
      const followers = await socialService.getFollowers(req.user._id);
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
   *     responses:
   *       200:
   *         description: List of followed users
   */
  appRouter.get('/following', async (req: any, res: Response) => {
    try {
      const following = await socialService.getFollowing(req.user._id);
      return ResponseWrapper.success(res, following, 'Following list fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
