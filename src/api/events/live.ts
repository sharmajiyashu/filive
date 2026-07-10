import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../middleware/socketAuthMiddleware';
import { LiveStreamService } from '../../services/app/LiveStreamService';
import { GiftService } from '../../services/app/GiftService';
import Room from '../../models/Room';
import User from '../../models/User';
import Container from 'typedi';
import AppLogger from '../loaders/logger';

interface JoinLiveStreamData {
  channelName: string;
}

interface LeaveLiveStreamData {
  channelName: string;
}

interface LiveCommentData {
  channelName: string;
  message: string;
}

export default (socket: AuthenticatedSocket, io: Server) => {
  const liveStreamService = Container.get(LiveStreamService);
  const giftService = Container.get(GiftService);

  if (!socket.user) {
    return;
  }

  const userId = socket.user.id;

  // Handler for joining a room (supports join_live and join_room)
  const handleJoin = async (data: JoinLiveStreamData) => {
    AppLogger.info(`[Socket Event: join_room/join_live] Entered. socket.id=${socket.id}, userId=${userId}, data=${JSON.stringify(data)}`);
    try {
      const { channelName } = data;
      if (!channelName) {
        AppLogger.warn(`[Socket Event: join_room/join_live] Validation failed. Channel name is required. userId=${userId}`);
        socket.emit('error_message', 'Channel name is required to join');
        return;
      }

      AppLogger.info(`[Socket Event: join_room/join_live] Socket joining rooms live_${channelName} and room_${channelName}. userId=${userId}`);
      socket.join(`live_${channelName}`);
      socket.join(`room_${channelName}`);

      AppLogger.info(`[Socket Event: join_room/join_live] Calling liveStreamService.joinLiveStream for userId=${userId}, channelName=${channelName}`);
      const liveStream = await liveStreamService.joinLiveStream(userId, channelName);
      AppLogger.info(`[Socket Event: join_room/join_live] liveStreamService.joinLiveStream returned successfully. viewerCount=${liveStream.viewerCount}`);

      // Fetch user profile details for broadcasting presence
      AppLogger.info(`[Socket Event: join_room/join_live] Fetching User details for presence broadcast. userId=${userId}`);
      const userObj = await User.findById(userId)
        .select('name profileImage bio location isPremium gender country')
        .populate('profileImage');

      const userJson = userObj ? (userObj.toObject ? userObj.toObject() : userObj) as any : null;
      if (userJson) {
        userJson.charmRankingDaily = await liveStreamService.getHostDailyCharmRank(userId);
      }

      const payload = {
        user: userJson || userObj,
        viewerCount: liveStream.viewerCount,
        charmRankingDaily: userJson?.charmRankingDaily,
        totalGiftRevenue: liveStream?.totalGiftRevenue || 0,
        roomFollowerCount: liveStream?.roomFollowerCount || 0
      };

      AppLogger.info(`[Socket Event: join_room/join_live] Broadcasting to live_${channelName} and room_${channelName}. payload=${JSON.stringify(payload)}`);

      io.to(`live_${channelName}`).to(`room_${channelName}`).emit('viewer_joined', payload);
      io.to(`live_${channelName}`).to(`room_${channelName}`).emit('room_viewer_joined', payload);

      AppLogger.info(`[Socket Event: join_room/join_live] Success. User ${userId} joined room_${channelName}`);
    } catch (error: any) {
      AppLogger.error(`[Socket Event: join_room/join_live] Error occurred for userId=${userId}: ${error.message}`, error);
      socket.emit('error_message', error.message || 'Failed to join room');
    }
  };

  socket.on('join_live', handleJoin);
  socket.on('join_room', handleJoin);

  // Handler for leaving a room (supports leave_live and leave_room)
  const handleLeave = async (data: LeaveLiveStreamData) => {
    AppLogger.info(`[Socket Event: leave_room/leave_live] Entered. socket.id=${socket.id}, userId=${userId}, data=${JSON.stringify(data)}`);
    try {
      const { channelName } = data;
      if (!channelName) {
        AppLogger.warn(`[Socket Event: leave_room/leave_live] Validation failed. Channel name is missing. userId=${userId}`);
        return;
      }

      AppLogger.info(`[Socket Event: leave_room/leave_live] Socket leaving rooms live_${channelName} and room_${channelName}. userId=${userId}`);
      socket.leave(`live_${channelName}`);
      socket.leave(`room_${channelName}`);

      AppLogger.info(`[Socket Event: leave_room/leave_live] Calling liveStreamService.leaveLiveStream for userId=${userId}, channelName=${channelName}`);
      const liveStream = await liveStreamService.leaveLiveStream(userId, channelName);
      AppLogger.info(`[Socket Event: leave_room/leave_live] liveStreamService.leaveLiveStream returned. Is stream found? ${!!liveStream}`);

      AppLogger.info(`[Socket Event: leave_room/leave_live] Fetching User details for leave broadcast. userId=${userId}`);
      const userObj = await User.findById(userId)
        .select('name profileImage')
        .populate('profileImage');

      const userJson = userObj ? (userObj.toObject ? userObj.toObject() : userObj) as any : null;
      if (userJson) {
        userJson.charmRankingDaily = await liveStreamService.getHostDailyCharmRank(userId);
      }

      if (liveStream) {
        const payload = {
          user: userJson || userObj,
          viewerCount: liveStream.viewerCount,
          charmRankingDaily: userJson?.charmRankingDaily,
          totalGiftRevenue: liveStream.totalGiftRevenue || 0,
          roomFollowerCount: liveStream.roomFollowerCount || 0
        };
        AppLogger.info(`[Socket Event: leave_room/leave_live] Broadcasting to live_${channelName} and room_${channelName}. payload=${JSON.stringify(payload)}`);
        io.to(`live_${channelName}`).to(`room_${channelName}`).emit('viewer_left', payload);
        io.to(`live_${channelName}`).to(`room_${channelName}`).emit('room_viewer_left', payload);
      } else {
        AppLogger.warn(`[Socket Event: leave_room/leave_live] Stream was not found or already ended. Skipped broadcasting.`);
      }

      AppLogger.info(`[Socket Event: leave_room/leave_live] Success. User ${userId} left room_${channelName}`);
    } catch (error: any) {
      AppLogger.error(`[Socket Event: leave_room/leave_live] Error on leave for user ${userId}: ${error.message}`, error);
    }
  };

  socket.on('leave_live', handleLeave);
  socket.on('leave_room', handleLeave);

  // Handler for room messages/comments (supports live_comment, room_comment, room_message)
  const handleComment = async (data: LiveCommentData) => {
    AppLogger.info(`[Socket Event: comment] Entered. socket.id=${socket.id}, userId=${userId}, data=${JSON.stringify(data)}`);
    try {
      const { channelName, message } = data;
      if (!channelName || !message) {
        AppLogger.warn(`[Socket Event: comment] Validation failed. channelName or message missing. userId=${userId}`);
        socket.emit('error_message', 'Channel name and message are required');
        return;
      }

      // Check if user is blocked in this stream
      const liveStream = await Room.findOne({ channelName, status: 'live' });
      if (liveStream && liveStream.blockedUsers && liveStream.blockedUsers.some(uid => uid.toString() === userId)) {
        socket.emit('error_message', 'You are blocked from chatting in this room');
        return;
      }

      if (liveStream) {
        await Room.updateOne({ _id: liveStream._id }, { $inc: { commentCount: 1 } });
      }

      AppLogger.info(`[Socket Event: comment] Fetching user details for comment. userId=${userId}`);
      const userObj = await User.findById(userId)
        .select('name profileImage bio isPremium')
        .populate('profileImage');

      // Broadcast comment to both rooms
      const payload = {
        user: userObj,
        message,
        createdAt: new Date()
      };
      AppLogger.info(`[Socket Event: comment] Broadcasting to live_${channelName} and room_${channelName}. payload=${JSON.stringify(payload)}`);

      io.to(`live_${channelName}`).to(`room_${channelName}`).emit('new_live_comment', payload);
      io.to(`live_${channelName}`).to(`room_${channelName}`).emit('new_room_comment', payload);
      io.to(`live_${channelName}`).to(`room_${channelName}`).emit('new_room_message', payload);

      AppLogger.info(`[Socket Event: comment] Success. Broadcasted comment for user ${userId}`);
    } catch (error: any) {
      AppLogger.error(`[Socket Event: comment] Error for user ${userId}: ${error.message}`, error);
      socket.emit('error_message', error.message || 'Failed to send comment');
    }
  };

  socket.on('live_comment', handleComment);
  socket.on('room_comment', handleComment);
  socket.on('room_message', handleComment);

  // Handle gift sending via sockets
  socket.on('send_gift', async (data: { channelName: string; giftId: string; receiverId?: string; contextType?: 'live_stream' | 'party_room' | 'audio_call' | 'video_call'; quantity?: number }) => {
    AppLogger.info(`[Socket Event: send_gift] Entered. userId=${userId}, data=${JSON.stringify(data)}`);
    try {
      const { channelName, giftId, receiverId, contextType, quantity } = data;
      if (!giftId) {
        socket.emit('error_message', 'giftId is required');
        return;
      }

      let actualReceiverId = receiverId;
      if (!actualReceiverId && channelName) {
        const liveStream = await Room.findOne({ channelName, status: 'live' });
        if (liveStream) {
          actualReceiverId = liveStream.hostId.toString();
        }
      }

      if (!actualReceiverId) {
        socket.emit('error_message', 'receiverId is required');
        return;
      }

      const parsedQuantity = quantity ? Number(quantity) : 1;
      const result = await giftService.sendGift(userId, channelName, giftId, actualReceiverId, contextType, parsedQuantity);

      // Broadcast gift sent event to both rooms
      const payload = {
        sender: result.sender,
        host: result.host,
        receiver: result.receiver,
        gift: result.gift,
        quantity: result.quantity,
        createdAt: new Date()
      };
      AppLogger.info(`[Socket Event: send_gift] Success. Gift sent in rooms live_${channelName} and room_${channelName}. payload=${JSON.stringify(payload)}`);
      io.to(`live_${channelName}`).to(`room_${channelName}`).emit('gift_sent', payload);
    } catch (error: any) {
      AppLogger.error(`[Socket Event: send_gift] Error for user ${userId}: ${error.message}`);
      socket.emit('error_message', error.message || 'Failed to send gift');
    }
  });

  // User joins a seat in a party room
  socket.on('join_seat', async (data: { channelName: string; seatIndex: number }) => {
    AppLogger.info(`[Socket Event: join_seat] Entered. userId=${userId}, data=${JSON.stringify(data)}`);
    try {
      const { channelName, seatIndex } = data;
      if (!channelName || seatIndex === undefined) {
        socket.emit('error_message', 'channelName and seatIndex are required');
        return;
      }
      await liveStreamService.joinSeat(userId, channelName, seatIndex);
    } catch (error: any) {
      AppLogger.error(`[Socket Event: join_seat] Error for user ${userId}: ${error.message}`);
      socket.emit('error_message', error.message || 'Failed to join seat');
    }
  });

  // User leaves a seat in a party room
  socket.on('leave_seat', async (data: { channelName: string }) => {
    AppLogger.info(`[Socket Event: leave_seat] Entered. userId=${userId}, data=${JSON.stringify(data)}`);
    try {
      const { channelName } = data;
      if (!channelName) {
        socket.emit('error_message', 'channelName is required');
        return;
      }
      await liveStreamService.leaveSeat(userId, channelName);
    } catch (error: any) {
      AppLogger.error(`[Socket Event: leave_seat] Error for user ${userId}: ${error.message}`);
      socket.emit('error_message', error.message || 'Failed to leave seat');
    }
  });

  // Handle blocking/kicking user from host
  socket.on('kick_user', async (data: { channelName: string; userIdToBlock: string }) => {
    AppLogger.info(`[Socket Event: kick_user] Entered. userId=${userId}, data=${JSON.stringify(data)}`);
    try {
      const { channelName, userIdToBlock } = data;
      if (!channelName || !userIdToBlock) {
        socket.emit('error_message', 'channelName and userIdToBlock are required');
        return;
      }

      await liveStreamService.blockUserFromRoom(userId, channelName, userIdToBlock);
      AppLogger.info(`[Socket Event: kick_user] Success. Blocked user ${userIdToBlock} in room live_${channelName}`);
    } catch (error: any) {
      AppLogger.error(`[Socket Event: kick_user] Error for user ${userId}: ${error.message}`);
      socket.emit('error_message', error.message || 'Failed to block/kick user');
    }
  });

  // Handle socket disconnect (clean up if host or viewer)
  socket.on('disconnect', async () => {
    AppLogger.info(`[Socket Event: disconnect] Entered. socket.id=${socket.id}, userId=${userId}`);
    try {
      // 1. Check if the disconnected user was hosting an active stream
      AppLogger.info(`[Socket Event: disconnect] Checking if userId=${userId} is host of any active streams`);
      const activeStream = await Room.findOne({ hostId: userId, status: 'live' });
      if (activeStream) {
        AppLogger.info(`[Socket Event: disconnect] Host disconnected. Scheduling ending live stream in 5 seconds for channel: ${activeStream.channelName}`);
        setTimeout(async () => {
          try {
            // Check if the user has reconnected with any socket
            const userRoom = io.sockets.adapter.rooms.get(`user_${userId}`);
            if (userRoom && userRoom.size > 0) {
              AppLogger.info(`[Socket Event: disconnect] Host userId=${userId} has active connections (${userRoom.size}). Keeping stream active.`);
              return;
            }
            // Double check if the stream is still live
            const stillActiveStream = await Room.findOne({ hostId: userId, status: 'live' });
            if (stillActiveStream) {
              AppLogger.info(`[Socket Event: disconnect] Host did not reconnect within timeout. Ending live stream: ${stillActiveStream.channelName}`);
              await liveStreamService.endLiveStream(userId, stillActiveStream.channelName);
              AppLogger.info(`[Socket Event: disconnect] Successfully ended stream for host: ${stillActiveStream.channelName}`);
            }
          } catch (err: any) {
            AppLogger.error(`[Socket Event: disconnect] Error ending stream after timeout for user ${userId}: ${err.message}`, err);
          }
        }, 5000);
      } else {
        AppLogger.info(`[Socket Event: disconnect] User is not hosting any active stream.`);
      }

      // 2. Check if the user was watching any active streams and remove them
      AppLogger.info(`[Socket Event: disconnect] Checking if userId=${userId} was watching any active streams`);
      const streamsWatched = await Room.find({ status: 'live', viewers: userId });
      AppLogger.info(`[Socket Event: disconnect] Found ${streamsWatched.length} watched streams for user ${userId}`);
      for (const stream of streamsWatched) {
        AppLogger.info(`[Socket Event: disconnect] Removing viewer ${userId} from stream ${stream.channelName}`);
        await liveStreamService.leaveLiveStream(userId, stream.channelName);

        AppLogger.info(`[Socket Event: disconnect] Fetching username and profile image for ${userId}`);
        const userObj = await User.findById(userId)
          .select('name profileImage')
          .populate('profileImage');

        const userJson = userObj ? (userObj.toObject ? userObj.toObject() : userObj) as any : null;
        if (userJson) {
          userJson.charmRankingDaily = await liveStreamService.getHostDailyCharmRank(userId);
        }

        const payload = {
          user: userJson || userObj,
          viewerCount: stream.viewerCount - 1,
          charmRankingDaily: userJson?.charmRankingDaily,
          totalGiftRevenue: stream.totalGiftRevenue || 0,
          roomFollowerCount: stream.roomFollowerCount || 0
        };
        AppLogger.info(`[Socket Event: disconnect] Broadcasting viewer_left/room_viewer_left to live_${stream.channelName} and room_${stream.channelName}. payload=${JSON.stringify(payload)}`);
        io.to(`live_${stream.channelName}`).to(`room_${stream.channelName}`).emit('viewer_left', payload);
        io.to(`live_${stream.channelName}`).to(`room_${stream.channelName}`).emit('room_viewer_left', payload);
      }
      AppLogger.info(`[Socket Event: disconnect] Completed disconnect cleanup for userId=${userId}`);
    } catch (error: any) {
      AppLogger.error(`[Socket Event: disconnect] Error cleaning up live stream on disconnect for user ${userId}: ${error.message}`, error);
    }
  });
};
