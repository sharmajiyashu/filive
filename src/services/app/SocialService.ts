import { Service } from 'typedi';
import Follow from '../../models/Follow';
import FriendRequest from '../../models/FriendRequest';
import User from '../../models/User';

@Service()
export class SocialService {
  public async sendFollowRequest(followerId: string, followingId: string) {
    if (followerId === followingId) throw new Error('You cannot follow yourself');

    const follow = await Follow.findOneAndUpdate(
      { followerId, followingId },
      { status: 'accepted' },
      { new: true, upsert: true }
    );

    return follow;
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

  public async getFollowers(userId: string, page: number = 1, limit: number = 10, search?: string) {
    let followerMatch: any = {};
    if (search && search.trim() !== '') {
      const searchStr = search.trim();
      const userConditions: any[] = [
        { name: { $regex: searchStr, $options: 'i' } },
        { email: { $regex: searchStr, $options: 'i' } },
        { mobile: { $regex: searchStr, $options: 'i' } }
      ];
      const searchNum = Number(searchStr);
      if (!isNaN(searchNum)) {
        userConditions.push({ userId: searchNum });
      }
      followerMatch = { $or: userConditions };
    }

    const rawFollowers = await Follow.find({ followingId: userId, status: 'accepted' })
      .populate({
        path: 'followerId',
        match: followerMatch,
        select: 'userId name email mobile profileImage bio isPremium location country',
        populate: { path: 'profileImage' }
      });

    const validFollowers = rawFollowers.filter(f => f.followerId !== null);
    const total = validFollowers.length;
    const paginatedFollowers = validFollowers.slice((page - 1) * limit, page * limit);

    return {
      followers: paginatedFollowers,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  public async getFollowing(userId: string, page: number = 1, limit: number = 10, search?: string) {
    let followingMatch: any = {};
    if (search && search.trim() !== '') {
      const searchStr = search.trim();
      const userConditions: any[] = [
        { name: { $regex: searchStr, $options: 'i' } },
        { email: { $regex: searchStr, $options: 'i' } },
        { mobile: { $regex: searchStr, $options: 'i' } }
      ];
      const searchNum = Number(searchStr);
      if (!isNaN(searchNum)) {
        userConditions.push({ userId: searchNum });
      }
      followingMatch = { $or: userConditions };
    }

    const rawFollowing = await Follow.find({ followerId: userId, status: 'accepted' })
      .populate({
        path: 'followingId',
        match: followingMatch,
        select: 'userId name email mobile profileImage bio isPremium location country',
        populate: { path: 'profileImage' }
      });

    const validFollowing = rawFollowing.filter(f => f.followingId !== null);
    const total = validFollowing.length;
    const paginatedFollowing = validFollowing.slice((page - 1) * limit, page * limit);

    return {
      following: paginatedFollowing,
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
