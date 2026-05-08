import { Service } from 'typedi';
import Follow from '../../models/Follow';
import FriendRequest from '../../models/FriendRequest';
import User from '../../models/User';

@Service()
export class SocialService {
  public async sendFollowRequest(followerId: string, followingId: string) {
    if (followerId === followingId) throw new Error('You cannot follow yourself');

    const existingFollow = await Follow.findOne({ followerId, followingId });
    if (existingFollow) return existingFollow;

    // Direct follow as per requirement
    return await Follow.create({ followerId, followingId, status: 'accepted' });
  }

  public async respondToFollowRequest(userId: string, followerId: string, status: 'accepted' | 'rejected') {
    const follow = await Follow.findOneAndUpdate(
      { followerId, followingId: userId, status: 'pending' },
      { status },
      { new: true }
    );
    if (!follow) throw new Error('Follow request not found');
    return follow;
  }

  public async unfollow(followerId: string, followingId: string) {
    const result = await Follow.deleteOne({ followerId, followingId });
    if (result.deletedCount === 0) throw new Error('You are not following this user');
    return { success: true };
  }

  public async removeFollower(userId: string, followerId: string) {
    const result = await Follow.deleteOne({ followerId, followingId: userId });
    if (result.deletedCount === 0) throw new Error('User is not following you');
    return { success: true };
  }

  public async sendFriendRequest(senderId: string, receiverId: string) {
    if (senderId === receiverId) throw new Error('You cannot send a friend request to yourself');

    const existingRequest = await FriendRequest.findOne({
      $or: [
        { senderId, receiverId },
        { senderId: receiverId, receiverId: senderId }
      ]
    });

    if (existingRequest) return existingRequest;

    return await FriendRequest.create({ senderId, receiverId, status: 'pending' });
  }

  public async respondToFriendRequest(userId: string, senderId: string, status: 'accepted' | 'rejected') {
    const request = await FriendRequest.findOneAndUpdate(
      { senderId, receiverId: userId, status: 'pending' },
      { status },
      { new: true }
    );
    if (!request) throw new Error('Friend request not found');
    return request;
  }

  public async getFollowers(userId: string, page: number = 1, limit: number = 10) {
    const followers = await Follow.find({ followingId: userId, status: 'accepted' })
      .populate({
        path: 'followerId',
        select: 'name email profileImage bio isPremium location country',
        populate: { path: 'profileImage' }
      })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Follow.countDocuments({ followingId: userId, status: 'accepted' });

    return {
      followers,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  public async getFollowing(userId: string, page: number = 1, limit: number = 10) {
    const following = await Follow.find({ followerId: userId, status: 'accepted' })
      .populate({
        path: 'followingId',
        select: 'name email profileImage bio isPremium location country',
        populate: { path: 'profileImage' }
      })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Follow.countDocuments({ followerId: userId, status: 'accepted' });

    return {
      following,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  public async getFriends(userId: string, page: number = 1, limit: number = 10) {
    // Friends are mutual followers
    const following = await Follow.find({ followerId: userId, status: 'accepted' }).select('followingId');
    const followingIds = following.map(f => f.followingId);

    const friends = await Follow.find({
      followingId: userId,
      followerId: { $in: followingIds },
      status: 'accepted'
    })
      .populate({
        path: 'followerId',
        select: 'name email profileImage bio isPremium location country',
        populate: { path: 'profileImage' }
      })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Follow.countDocuments({
      followingId: userId,
      followerId: { $in: followingIds },
      status: 'accepted'
    });

    return {
      friends,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
