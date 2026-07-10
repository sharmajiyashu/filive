import { Service } from 'typedi';
import mongoose from 'mongoose';
import RoomFollow from '../../models/RoomFollow';
import Room from '../../models/Room';
import AppLogger from '../../api/loaders/logger';

@Service()
export class RoomFollowService {
  constructor() {}

  /**
   * Follow a specific room
   */
  public async followRoom(userId: string, roomId: string) {
    AppLogger.info(`[RoomFollowService: followRoom] User ${userId} wants to follow room ${roomId}`);

    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(roomId)) {
      throw new Error('Invalid user or room ID');
    }

    const room = await Room.findById(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    const existingFollow = await RoomFollow.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      roomId: new mongoose.Types.ObjectId(roomId),
    });

    if (existingFollow) {
      throw new Error('You are already following this room');
    }

    // Create follow relationship
    await RoomFollow.create({
      userId: new mongoose.Types.ObjectId(userId),
      roomId: new mongoose.Types.ObjectId(roomId),
    });

    // Increment Room's follower count
    room.roomFollowerCount = (room.roomFollowerCount || 0) + 1;
    await room.save();

    AppLogger.info(`[RoomFollowService: followRoom] Success. Room ${roomId} followed by user ${userId}. New follower count: ${room.roomFollowerCount}`);
    return {
      success: true,
      roomFollowerCount: room.roomFollowerCount,
    };
  }

  /**
   * Unfollow a specific room
   */
  public async unfollowRoom(userId: string, roomId: string) {
    AppLogger.info(`[RoomFollowService: unfollowRoom] User ${userId} wants to unfollow room ${roomId}`);

    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(roomId)) {
      throw new Error('Invalid user or room ID');
    }

    const room = await Room.findById(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    const existingFollow = await RoomFollow.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      roomId: new mongoose.Types.ObjectId(roomId),
    });

    if (!existingFollow) {
      throw new Error('You are not following this room');
    }

    // Delete follow relationship
    await RoomFollow.deleteOne({ _id: existingFollow._id });

    // Decrement Room's follower count
    room.roomFollowerCount = Math.max(0, (room.roomFollowerCount || 0) - 1);
    await room.save();

    AppLogger.info(`[RoomFollowService: unfollowRoom] Success. Room ${roomId} unfollowed by user ${userId}. New follower count: ${room.roomFollowerCount}`);
    return {
      success: true,
      roomFollowerCount: room.roomFollowerCount,
    };
  }

  /**
   * Get the list of rooms followed by a user
   */
  public async getFollowedRooms(userId: string, page: number = 1, limit: number = 20) {
    AppLogger.info(`[RoomFollowService: getFollowedRooms] Fetching followed rooms for user ${userId}, page=${page}, limit=${limit}`);

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error('Invalid user ID');
    }

    const skip = (page - 1) * limit;

    const followDocs = await RoomFollow.find({ userId: new mongoose.Types.ObjectId(userId) })
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await RoomFollow.countDocuments({ userId: new mongoose.Types.ObjectId(userId) });
    
    // Extract room details
    const roomIds = followDocs.map(doc => doc.roomId);
    const rooms = await Room.find({ _id: { $in: roomIds } })
      .populate({
        path: 'hostId',
        select: 'name profileImage bio location isPremium gender country',
        populate: {
          path: 'profileImage'
        }
      })
      .populate({
        path: 'roomTheme',
        populate: {
          path: 'media'
        }
      });

    // Map to include isFollowingRoom: true since they are in the followed list
    const results = rooms.map(room => {
      const roomObj = room.toObject ? room.toObject() : room;
      return {
        ...roomObj,
        isFollowingRoom: true
      };
    });

    return {
      data: results,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Helper to check if a user follows a room
   */
  public async isFollowingRoom(userId: string, roomId: string): Promise<boolean> {
    if (!userId || !roomId || !mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(roomId)) {
      return false;
    }
    const exists = await RoomFollow.exists({
      userId: new mongoose.Types.ObjectId(userId),
      roomId: new mongoose.Types.ObjectId(roomId),
    });
    return !!exists;
  }
}
