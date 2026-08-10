import { Service } from 'typedi';
import User from '../../models/User';
import Follow from '../../models/Follow';
import Story from '../../models/Story';
import Like from '../../models/Like';
import Comment from '../../models/Comment';
import UserVisitor from '../../models/UserVisitor';
import Block from '../../models/Block';
import Chat from '../../models/Chat';
import Room from '../../models/Room';
import FamilyMember from '../../models/FamilyMember';
import Country from '../../models/Country';
import mongoose from 'mongoose';
import { ensureUserReferralCode } from '../../utils/referral';

import { LevelService } from './LevelService';

@Service()
export class UserService {
  constructor(private levelService: LevelService) { }

  public async getAllUsers(
    page: number = 1,
    limit: number = 10,
    currentUserId?: string,
    search?: string,
    country?: string,
    type?: string
  ) {
    let query: any = { userRole: 'user' };

    if (currentUserId) {
      const blockedRelations = await Block.find({
        $or: [
          { blockerId: currentUserId },
          { blockedId: currentUserId }
        ]
      });

      const excludedUserIds = blockedRelations.map((rel: any) =>
        rel.blockerId.toString() === currentUserId ? rel.blockedId : rel.blockerId
      );

      if (excludedUserIds.length > 0) {
        query._id = { $nin: excludedUserIds };
      }
    }

    // Type filter: online or new
    if (type === 'online') {
      const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
      query.lastLoginAt = { $gte: fifteenMinsAgo };
    } else if (type === 'new') {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      query.createdAt = { $gte: thirtyDaysAgo };
    }

    // Country filter
    if (country && country.trim() !== '' && country.trim().toLowerCase() !== 'all') {
      const targetCountry = country.trim();
      const countryConditions: any[] = [];
      if (mongoose.Types.ObjectId.isValid(targetCountry)) {
        countryConditions.push({ _id: new mongoose.Types.ObjectId(targetCountry) });
      }
      countryConditions.push({ name: { $regex: new RegExp(`^${targetCountry}$`, 'i') } });
      countryConditions.push({ code: { $regex: new RegExp(`^${targetCountry}$`, 'i') } });
      countryConditions.push({ name: { $regex: targetCountry, $options: 'i' } });

      const matchingCountries = await Country.find({ $or: countryConditions });
      const countryObjIds = matchingCountries.map(c => c._id);
      const countryNames = matchingCountries.map(c => c.name);
      const countryCodes = matchingCountries.map(c => c.code);

      const userQueryConditions: any[] = [];
      if (countryObjIds.length > 0) {
        userQueryConditions.push({ countryId: { $in: countryObjIds } });
      }
      if (mongoose.Types.ObjectId.isValid(targetCountry)) {
        userQueryConditions.push({ countryId: new mongoose.Types.ObjectId(targetCountry) });
      }
      userQueryConditions.push({ country: { $regex: new RegExp(targetCountry, 'i') } });
      if (countryNames.length > 0) {
        userQueryConditions.push({ country: { $in: countryNames } });
      }
      if (countryCodes.length > 0) {
        userQueryConditions.push({ country: { $in: countryCodes } });
      }

      query.$and = query.$and || [];
      query.$and.push({ $or: userQueryConditions });
    }

    if (search && search.trim() !== '') {
      const searchStr = search.trim();
      const searchConditions: any[] = [
        { name: { $regex: searchStr, $options: 'i' } },
        { email: { $regex: searchStr, $options: 'i' } },
        { mobile: { $regex: searchStr, $options: 'i' } },
        { country: { $regex: searchStr, $options: 'i' } },
        { nationality: { $regex: searchStr, $options: 'i' } },
        { 'location.city': { $regex: searchStr, $options: 'i' } },
        { 'location.state': { $regex: searchStr, $options: 'i' } },
        { gender: { $regex: searchStr, $options: 'i' } },
        { bio: { $regex: searchStr, $options: 'i' } },
        { selfIntroduce: { $regex: searchStr, $options: 'i' } }
      ];

      const searchNum = Number(searchStr);
      if (!isNaN(searchNum)) {
        searchConditions.push({ userId: searchNum });
      }

      query.$and = query.$and || [];
      query.$and.push({ $or: searchConditions });
    }

    const sortOptions: any = type === 'online' ? { lastLoginAt: -1 } : { createdAt: -1 };

    const total = await User.countDocuments(query);
    const userDocs = await User.find(query)
      .select('userId name email mobile profileImage bio location isPremium selfIntroduce height country countryId maritalStatus enableVoiceCall enableVideoCall voiceCallPrice videoCallPrice lastLoginAt createdAt referralCode referCode')
      .populate('profileImage')
      .populate('countryId')
      .sort(sortOptions)
      .skip((page - 1) * limit)
      .limit(limit);

    const formattedUsers = userDocs.map((u: any) => {
      const uObj = u.toObject ? u.toObject() : u;
      const isOnline = uObj.lastLoginAt ? new Date(uObj.lastLoginAt).getTime() > Date.now() - 15 * 60 * 1000 : false;
      const refCode = uObj.referralCode || uObj.referCode || (uObj.userId ? `REF${uObj.userId}` : undefined);
      return {
        ...uObj,
        isOnline,
        referralCode: refCode,
        referCode: refCode
      };
    });

    return {
      users: formattedUsers,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  public async getUserDetail(userId: string, currentUserId?: string, followersPage: number = 1, followingPage: number = 1, limit: number = 10) {
    const isObjectId = mongoose.Types.ObjectId.isValid(userId);
    const is10DigitNum = /^\d{10}$/.test(userId);

    if (!isObjectId && !is10DigitNum) {
      throw new Error('Invalid user ID');
    }

    let user;
    if (isObjectId) {
      user = await User.findById(userId)
        .select('-password -otp -otpExpires -fcmTokens')
        .populate('profileImage')
        .populate('album')
        .populate({
          path: 'careerId',
          populate: { path: 'image' }
        });
    } else {
      user = await User.findOne({ userId: parseInt(userId) })
        .select('-password -otp -otpExpires -fcmTokens')
        .populate('profileImage')
        .populate('album')
        .populate({
          path: 'careerId',
          populate: { path: 'image' }
        });
    }

    if (!user) {
      throw new Error('User not found');
    }

    const userObjectIdStr = user._id.toString();

    if (currentUserId) {
      const isBlocked = await Block.findOne({
        $or: [
          { blockerId: currentUserId, blockedId: userObjectIdStr },
          { blockerId: userObjectIdStr, blockedId: currentUserId }
        ]
      });
      if (isBlocked) {
        throw new Error('User blocked');
      }
    }

    // Track visitor if it's not the user viewing their own profile
    if (currentUserId && currentUserId !== userObjectIdStr) {
      await UserVisitor.create({
        userId: user._id,
        visitorId: new mongoose.Types.ObjectId(currentUserId)
      });
    }

    // Paginated followers
    const followers = await Follow.find({ followingId: user._id, status: 'accepted' })
      .populate({
        path: 'followerId',
        select: 'userId name email profileImage bio isPremium location country',
        populate: { path: 'profileImage' }
      })
      .skip((followersPage - 1) * limit)
      .limit(limit);

    const followersCount = await Follow.countDocuments({ followingId: user._id, status: 'accepted' });

    // Paginated following
    const following = await Follow.find({ followerId: user._id, status: 'accepted' })
      .populate({
        path: 'followingId',
        select: 'userId name email profileImage bio isPremium location country',
        populate: { path: 'profileImage' }
      })
      .skip((followingPage - 1) * limit)
      .limit(limit);

    const followingCount = await Follow.countDocuments({ followerId: user._id, status: 'accepted' });

    // Friends Count (Mutual Followers)
    const myFollowing = await Follow.find({ followerId: user._id, status: 'accepted' }).select('followingId');
    const myFollowingIds = myFollowing.map(f => f.followingId);
    const friendsCount = await Follow.countDocuments({
      followingId: user._id,
      followerId: { $in: myFollowingIds },
      status: 'accepted'
    });

    const stories = await Story.find({ userId: user._id })
      .populate('images')
      .populate({
        path: 'userId',
        select: 'userId name email profileImage bio isPremium location country',
        populate: { path: 'profileImage' }
      })
      .sort({ createdAt: -1 });

    const visitorsCount = await UserVisitor.countDocuments({ userId: user._id });
    const uniqueVisitorsCount = await UserVisitor.distinct('visitorId', { userId: user._id }).then(ids => ids.length);

    let likedStoryIds = new Set<string>();
    let commentedStoryIds = new Set<string>();
    let isFollowingAuthor = false;

    if (currentUserId) {
      const storyIds = stories.map(s => s._id);

      const [likes, comments, followingStatus] = await Promise.all([
        Like.find({
          userId: currentUserId,
          targetId: { $in: storyIds },
          targetType: 'Story'
        }),
        Comment.find({
          userId: currentUserId,
          storyId: { $in: storyIds }
        }),
        Follow.findOne({
          followerId: currentUserId,
          followingId: user._id,
          status: 'accepted'
        })
      ]);

      likedStoryIds = new Set(likes.map(l => l.targetId.toString()));
      commentedStoryIds = new Set(comments.map(c => c.storyId.toString()));
      isFollowingAuthor = !!followingStatus;
    }

    const storiesWithStatus = stories.map(story => {
      const storyObj = story.toObject();
      return {
        ...storyObj,
        isLiked: currentUserId ? likedStoryIds.has(story._id.toString()) : false,
        isCommented: currentUserId ? commentedStoryIds.has(story._id.toString()) : false,
        isFollowing: isFollowingAuthor
      };
    });

    const richCoins = user.wealthCoins !== undefined ? user.wealthCoins : (user.coins || 0);
    const charmCoins = user.charmCoins || 0;
    const richLevelInfo = await this.levelService.getLevelInfoForCoins(richCoins, 'rich');
    const charmLevelInfo = await this.levelService.getLevelInfoForCoins(charmCoins, 'charm');

    let isChatCreated = false;
    let chatId = null;
    let isPinned = false;
    if (currentUserId && user._id) {
      const existingChat = await Chat.findOne({
        type: 'private',
        'participants.userId': { $all: [new mongoose.Types.ObjectId(currentUserId), user._id] }
      });
      if (existingChat) {
        isChatCreated = true;
        chatId = existingChat._id;
        const currentParticipant = existingChat.participants.find(
          p => p.userId.toString() === currentUserId.toString()
        );
        isPinned = currentParticipant ? !!currentParticipant.isPinned : false;
      }
    }

    // Check if the user has an active livestream
    const activeLive = await Room.findOne({ hostId: user._id, status: 'live' });

    // Fetch user's family membership details
    const familyMemberDoc = await FamilyMember.findOne({ userId: user._id })
      .populate({
        path: 'familyId',
        populate: [
          { path: 'creatorId', select: 'name email profileImage userId' },
          { path: 'image' }
        ]
      });

    const family = familyMemberDoc && familyMemberDoc.familyId ? familyMemberDoc.familyId : null;
    const familyRole = familyMemberDoc ? familyMemberDoc.role : null;

    // Fetch user's joined group chats
    const groupChats = await Chat.find({
      type: 'group',
      'participants.userId': user._id
    })
      .select('name mediaId type participants createdAt')
    const { referralCode } = await ensureUserReferralCode(user);
    const isOnline = user.lastLoginAt ? new Date(user.lastLoginAt).getTime() > Date.now() - 15 * 60 * 1000 : false;

    return {
      user: {
        ...user.toObject(),
        referralCode,
        referCode: referralCode,
        isOnline,
        career: user.careerId,
        levelInfo: richLevelInfo, // backward compatibility
        richLevelInfo,
        charmLevelInfo,
        family,
        familyRole,
        groups: groupChats,
        isChatCreated,
        chatId,
        isPinned,
        isLive: !!activeLive,
        liveStream: activeLive ? activeLive.toObject() : null
      },
      family,
      familyRole,
      groups: groupChats,
      isFollowing: isFollowingAuthor,
      isChatCreated,
      chatId,
      isPinned,
      followersCount,
      followingCount,
      friendsCount,
      visitorsCount: uniqueVisitorsCount,
      totalViews: visitorsCount,
      followers: {
        data: followers,
        pagination: {
          total: followersCount,
          page: followersPage,
          limit,
          totalPages: Math.ceil(followersCount / limit),
        }
      },
      following: {
        data: following,
        pagination: {
          total: followingCount,
          page: followingPage,
          limit,
          totalPages: Math.ceil(followingCount / limit),
        }
      },
      stories: storiesWithStatus,
    };
  }

  public async toggleBlockUser(blockerId: string, blockedId: string) {
    if (blockerId === blockedId) {
      throw new Error('You cannot block yourself');
    }

    if (!mongoose.Types.ObjectId.isValid(blockedId)) {
      throw new Error('Invalid user ID');
    }

    const targetUser = await User.findById(blockedId);
    if (!targetUser) {
      throw new Error('User to block not found');
    }

    const existingBlock = await Block.findOne({ blockerId, blockedId });

    if (existingBlock) {
      await Block.deleteOne({ _id: existingBlock._id });
      return { blocked: false, message: 'User unblocked successfully' };
    } else {
      const newBlock = await Block.create({ blockerId, blockedId });
      // Remove follow relationships if blocked
      await Follow.deleteMany({
        $or: [
          { followerId: blockerId, followingId: blockedId },
          { followerId: blockedId, followingId: blockerId }
        ]
      });
      return {
        blocked: true,
        message: 'User blocked successfully',
        blockedAt: newBlock.createdAt,
        createdAt: newBlock.createdAt,
      };
    }
  }

  public async getBlockedList(blockerId: string, page: number = 1, limit: number = 10) {
    const blocks = await Block.find({ blockerId })
      .populate({
        path: 'blockedId',
        select: 'name email profileImage bio isPremium location country',
        populate: { path: 'profileImage' }
      })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Block.countDocuments({ blockerId });
    const users = blocks
      .filter(b => b.blockedId !== null)
      .map(b => {
        const userObj = (b.blockedId as any).toObject ? (b.blockedId as any).toObject() : b.blockedId;
        return {
          ...userObj,
          blockedAt: b.createdAt,
          createdAt: b.createdAt,
        };
      });

    return {
      users,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  public async getVisitorsList(userId: string, currentUserId?: string, page: number = 1, limit: number = 10) {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error('Invalid user ID');
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);
    let matchQuery: any = { userId: userObjectId };

    if (currentUserId) {
      const blockedRelations = await Block.find({
        $or: [
          { blockerId: currentUserId },
          { blockedId: currentUserId }
        ]
      });

      const excludedUserIds = blockedRelations.map((rel: any) =>
        rel.blockerId.toString() === currentUserId ? rel.blockedId : rel.blockerId
      );

      if (excludedUserIds.length > 0) {
        matchQuery.visitorId = { $nin: excludedUserIds };
      }
    }

    // Aggregate to get unique visitors with their latest visit time
    const aggregationResult = await UserVisitor.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$visitorId',
          visitedAt: { $max: '$visitedAt' },
          createdAt: { $max: '$createdAt' }
        }
      },
      { $sort: { visitedAt: -1 } },
      {
        $facet: {
          metadata: [{ $count: 'total' }],
          data: [
            { $skip: (page - 1) * limit },
            { $limit: limit }
          ]
        }
      }
    ]);

    const total = aggregationResult[0]?.metadata[0]?.total || 0;
    const records = aggregationResult[0]?.data || [];

    // Populate user details for each visitor
    const visitorIds = records.map((r: any) => r._id);
    const users = await User.find({ _id: { $in: visitorIds } })
      .select('name email profileImage bio isPremium location country')
      .populate('profileImage');

    // Create a map for quick lookup
    const userMap = new Map();
    users.forEach(u => {
      userMap.set(u._id.toString(), u);
    });

    const formattedVisitors = records
      .map((r: any) => {
        const visitorUser = userMap.get(r._id.toString());
        if (!visitorUser) return null;
        return {
          ...visitorUser.toObject(),
          visitedAt: r.visitedAt,
          createdAt: r.createdAt
        };
      })
      .filter((v: any) => v !== null);

    return {
      visitors: formattedVisitors,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

