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

    return await Follow.create({ followerId, followingId, status: 'pending' });
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

  public async getFollowers(userId: string) {
    return await Follow.find({ followingId: userId, status: 'accepted' }).populate('followerId', 'name email profileImage');
  }

  public async getFollowing(userId: string) {
    return await Follow.find({ followerId: userId, status: 'accepted' }).populate('followingId', 'name email profileImage');
  }
}
