import { Service } from 'typedi';
import User from '../../models/User';
import Follow from '../../models/Follow';
import Story from '../../models/Story';
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

  public async getUserDetail(userId: string, visitorId?: string) {
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
    if (visitorId && visitorId !== userId) {
      await UserVisitor.create({
        userId: new mongoose.Types.ObjectId(userId),
        visitorId: new mongoose.Types.ObjectId(visitorId)
      });
    }

    const followers = await Follow.find({ followingId: userId, status: 'accepted' })
      .populate('followerId', 'name email profileImage');

    const following = await Follow.find({ followerId: userId, status: 'accepted' })
      .populate('followingId', 'name email profileImage');

    const stories = await Story.find({ userId: userId })
      .populate('images')
      .populate('userId', 'name profileImage')
      .sort({ createdAt: -1 });

    const visitorsCount = await UserVisitor.countDocuments({ userId });
    const uniqueVisitorsCount = await UserVisitor.distinct('visitorId', { userId }).then(ids => ids.length);

    return {
      user,
      followersCount: followers.length,
      followingCount: following.length,
      visitorsCount: uniqueVisitorsCount, // Returning unique visitors count as requested
      totalViews: visitorsCount,
      followers,
      following,
      stories,
    };
  }
}
