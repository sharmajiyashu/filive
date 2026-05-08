import { Service } from 'typedi';
import User from '../../models/User';
import Follow from '../../models/Follow';
import Story from '../../models/Story';
import Like from '../../models/Like';
import Comment from '../../models/Comment';
import UserVisitor from '../../models/UserVisitor';
import mongoose from 'mongoose';

@Service()
export class UserService {
  public async getAllUsers(page: number = 1, limit: number = 10) {
    const users = await User.find({ userRole: 'user' })
      .select('name email profileImage bio location isPremium selfIntroduce height country maritalStatus')
      .populate('profileImage')
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await User.countDocuments({ userRole: 'user' });

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

  public async getUserDetail(userId: string, currentUserId?: string) {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error('Invalid user ID');
    }

    const user = await User.findById(userId)
      .select('-password -otp -otpExpires -fcmTokens')
      .populate('profileImage');

    if (!user) {
      throw new Error('User not found');
    }

    // Track visitor if it's not the user viewing their own profile
    if (currentUserId && currentUserId !== userId) {
      await UserVisitor.create({
        userId: new mongoose.Types.ObjectId(userId),
        visitorId: new mongoose.Types.ObjectId(currentUserId)
      });
    }

    const followers = await Follow.find({ followingId: userId, status: 'accepted' })
      .populate({
        path: 'followerId',
        select: 'name email profileImage bio isPremium location country',
        populate: { path: 'profileImage' }
      });

    const following = await Follow.find({ followerId: userId, status: 'accepted' })
      .populate({
        path: 'followingId',
        select: 'name email profileImage bio isPremium location country',
        populate: { path: 'profileImage' }
      });

    const stories = await Story.find({ userId: userId })
      .populate('images')
      .populate('userId', 'name profileImage')
      .sort({ createdAt: -1 });

    const visitorsCount = await UserVisitor.countDocuments({ userId });
    const uniqueVisitorsCount = await UserVisitor.distinct('visitorId', { userId }).then(ids => ids.length);

    let storiesWithStatus = stories as any[];
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
          followingId: userId,
          status: 'accepted'
        })
      ]);

      const likedStoryIds = new Set(likes.map(l => l.targetId.toString()));
      const commentedStoryIds = new Set(comments.map(c => c.storyId.toString()));
      const isFollowingAuthor = !!followingStatus;

      storiesWithStatus = stories.map(story => {
        const storyObj = story.toObject();
        return {
          ...storyObj,
          isLiked: likedStoryIds.has(story._id.toString()),
          isCommented: commentedStoryIds.has(story._id.toString()),
          isFollowing: isFollowingAuthor
        };
      });
    }

    return {
      user,
      followersCount: followers.length,
      followingCount: following.length,
      visitorsCount: uniqueVisitorsCount,
      totalViews: visitorsCount,
      followers,
      following,
      stories: storiesWithStatus,
    };
  }
}
