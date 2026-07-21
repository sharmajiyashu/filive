import { Service } from 'typedi';
import mongoose from 'mongoose';
import RoomFollow from '../../models/RoomFollow';
import Room from '../../models/Room';
import AppLogger from '../../api/loaders/logger';

@Service()
export class RoomFollowService {
  constructor() { }

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
      });

    // Fetch settings for all hosts to populate roomTheme and gameId
    const hostIds = rooms.map(r => r.hostId && (r.hostId as any)._id ? (r.hostId as any)._id : r.hostId).filter(id => id);
    const roomSettings = await mongoose.model('RoomSetting').find({ hostId: { $in: hostIds } })
      .populate({ path: 'roomTheme', populate: { path: 'media' } })
      .populate({ path: 'gameId', populate: { path: 'image' } });

    // Map to include isFollowingRoom: true since they are in the followed list
    const results = rooms.map(room => {
      const roomObj = room.toObject ? room.toObject() : room;
      const hostIdStr = roomObj.hostId && roomObj.hostId._id ? roomObj.hostId._id.toString() : (roomObj.hostId ? roomObj.hostId.toString() : '');
      const setting = roomSettings.find((s: any) => s.hostId.toString() === hostIdStr);

      if (setting) {
        (roomObj as any).roomTheme = (setting as any).roomTheme;
        (roomObj as any).gameId = (setting as any).gameId;
        (roomObj as any).muteAllSeats = (setting as any).muteAllSeats;
        (roomObj as any).announcement = (setting as any).announcement;
      }

      return {
        ...roomObj,
        isFollowingRoom: true,
        totalMember: roomObj.viewerCount || 0
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
   * Get the list of users following a specific room
   */
  public async getRoomFollowers(roomId: string, page: number = 1, limit: number = 20) {
    AppLogger.info(`[RoomFollowService: getRoomFollowers] Fetching followers for room ${roomId}, page=${page}, limit=${limit}`);

    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      throw new Error('Invalid room ID');
    }

    const skip = (page - 1) * limit;

    const followDocs = await RoomFollow.find({ roomId: new mongoose.Types.ObjectId(roomId) })
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })
      .populate({
        path: 'userId',
        select: 'name profileImage bio location isPremium gender country',
        populate: {
          path: 'profileImage'
        }
      });

    const total = await RoomFollow.countDocuments({ roomId: new mongoose.Types.ObjectId(roomId) });

    // Extract user details from populated userId
    const results = followDocs.map(doc => {
      const docObj = doc.toObject ? doc.toObject() : doc;
      return docObj.userId;
    }).filter(user => user !== null);

    return {
      data: results,
      total,
      totalMember: total,
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
