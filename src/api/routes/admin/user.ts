import { Router, Response } from 'express';
import mongoose from 'mongoose';
import Container from 'typedi';
import User from '../../../models/User';
import Follow from '../../../models/Follow';
import UserVisitor from '../../../models/UserVisitor';
import Block from '../../../models/Block';
import Agency from '../../../models/Agency';
import FamilyMember from '../../../models/FamilyMember';
import Story from '../../../models/Story';
import CoinHistory from '../../../models/CoinHistory';
import { ResponseWrapper } from '../../responseWrapper';
import { LevelService } from '../../../services/app/LevelService';

export default (router: Router) => {
  const userRouter = Router();

  router.use('/users', userRouter);

  /**
   * @swagger
   * /admin/users:
   *   get:
   *     summary: Get all users (Admin)
   *     tags: [Admin - Users]
   *     parameters:
   *       - in: query
   *         name: page
   *         schema: { type: integer }
   *       - in: query
   *         name: limit
   *         schema: { type: integer }
   *       - in: query
   *         name: search
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Users list fetched successfully
   */
  userRouter.get('/', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '10');
      const search = req.query.search?.toString() || '';

      const query: any = { userRole: 'user' };

      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { mobile: { $regex: search, $options: 'i' } }
        ];
      }

      const users = await User.find(query)
        .populate('profileImage')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit);

      const total = await User.countDocuments(query);

      return ResponseWrapper.success(res, {
        users,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      }, 'Users fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/users/{id}/details:
   *   get:
   *     summary: Get user details for admin tab panels
   *     tags: [Admin - Users]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: User details fetched successfully
   */
  userRouter.get('/:id/details', async (req: any, res: Response) => {
    try {
      const userId = req.params.id;
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw new Error('Invalid user ID');
      }

      const user = await User.findById(userId)
        .populate('profileImage')
        .populate('album')
        .populate('careerId')
        .populate('hobbies')
        .populate('countryId');

      if (!user) {
        throw new Error('User not found');
      }

      // 1. Followers
      const followers = await Follow.find({ followingId: userId, status: 'accepted' })
        .populate({
          path: 'followerId',
          select: 'name email profileImage bio isPremium location country isBlocked',
          populate: { path: 'profileImage' }
        });

      // 2. Followings
      const followings = await Follow.find({ followerId: userId, status: 'accepted' })
        .populate({
          path: 'followingId',
          select: 'name email profileImage bio isPremium location country isBlocked',
          populate: { path: 'profileImage' }
        });

      // 3. Friends (mutual followers)
      const followingIds = followings.map(f => f.followingId ? ((f.followingId as any)._id || f.followingId) : null).filter(Boolean);
      const friends = await Follow.find({
        followingId: userId,
        followerId: { $in: followingIds },
        status: 'accepted'
      }).populate({
        path: 'followerId',
        select: 'name email profileImage bio isPremium location country isBlocked',
        populate: { path: 'profileImage' }
      });

      // 4. Visitors
      const visitors = await UserVisitor.find({ userId })
        .populate({
          path: 'visitorId',
          select: 'name email profileImage bio isPremium location country isBlocked',
          populate: { path: 'profileImage' }
        })
        .sort({ visitedAt: -1 });

      // 5. Block to Block by
      const blockedByThisUser = await Block.find({ blockerId: userId })
        .populate({
          path: 'blockedId',
          select: 'name email profileImage bio isPremium location country isBlocked',
          populate: { path: 'profileImage' }
        });

      const blockersOfThisUser = await Block.find({ blockedId: userId })
        .populate({
          path: 'blockerId',
          select: 'name email profileImage bio isPremium location country isBlocked',
          populate: { path: 'profileImage' }
        });

      // 6. Agents (Agencies created by this user)
      const agencies = await Agency.find({ creatorId: userId })
        .populate('countryId');

      // 7. Family Memberships
      const familyMemberships = await FamilyMember.find({ userId })
        .populate({
          path: 'familyId',
          populate: [
            { path: 'creatorId', select: 'name email profileImage' },
            { path: 'image' }
          ]
        });

      // 8. Stories
      const stories = await Story.find({ userId })
        .populate('images')
        .populate('mentions', 'name email profileImage');

      // 9. Recharge History
      const rechargeHistory = await CoinHistory.find({ userId, type: 'recharge' })
        .sort({ createdAt: -1 });

      const levelService = Container.get(LevelService);
      const richCoins = user.wealthCoins !== undefined ? user.wealthCoins : (user.coins || 0);
      const charmCoins = user.charmCoins || 0;
      const richLevelInfo = await levelService.getLevelInfoForCoins(richCoins, 'rich');
      const charmLevelInfo = await levelService.getLevelInfoForCoins(charmCoins, 'charm');

      const userObj = {
        ...user.toObject(),
        levelInfo: richLevelInfo,
        richLevelInfo,
        charmLevelInfo
      };

      return ResponseWrapper.success(res, {
        user: userObj,
        followers,
        followings,
        friends,
        visitors,
        blocks: {
          blockedByThisUser,
          blockersOfThisUser
        },
        agencies,
        familyMemberships,
        stories,
        rechargeHistory
      }, 'User full details fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/users/{id}/block:
   *   put:
   *     summary: Toggle user block status (Admin)
   *     tags: [Admin - Users]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: User block status toggled
   */
  userRouter.put('/:id/block', async (req: any, res: Response) => {
    try {
      const userId = req.params.id;
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      user.isBlocked = !user.isBlocked;
      await user.save();

      return ResponseWrapper.success(res, user, `User ${user.isBlocked ? 'blocked' : 'unblocked'} successfully`);
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/users/{id}/adjust-balance:
   *   put:
   *     summary: Adjust user coins or beans balance (Admin)
   *     tags: [Admin - Users]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               type:
   *                 type: string
   *                 enum: [coins, beans]
   *               amount:
   *                 type: integer
   *     responses:
   *       200:
   *         description: Balance updated successfully
   */
  userRouter.put('/:id/adjust-balance', async (req: any, res: Response) => {
    try {
      const userId = req.params.id;
      const { type, amount } = req.body;

      if (!['coins', 'beans'].includes(type)) {
        throw new Error('Invalid balance type specified. Must be coins or beans.');
      }
      if (typeof amount !== 'number') {
        throw new Error('Amount must be a number.');
      }

      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const field = type === 'coins' ? 'coins' : 'beans';
      const currentVal = (user as any)[field] || 0;
      const newVal = currentVal + amount;

      if (newVal < 0) {
        throw new Error(`Insufficient balance. Resulting balance cannot be less than zero.`);
      }

      (user as any)[field] = newVal;
      await user.save();

      // Log action in CoinHistory
      await CoinHistory.create({
        userId: user._id,
        amount: amount,
        type: type === 'coins' ? 'recharge' : 'other',
        description: `Admin balance adjustment: ${amount >= 0 ? '+' : ''}${amount} ${type}`
      });

      return ResponseWrapper.success(res, user, `${type} balance updated successfully`);
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
