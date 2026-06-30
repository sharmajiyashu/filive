import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../middleware/socketAuthMiddleware';
import { LiveStreamService } from '../../services/app/LiveStreamService';
import { GiftService } from '../../services/app/GiftService';
import LiveStream from '../../models/LiveStream';
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

  // Viewer joins a live stream
  socket.on('join_live', async (data: JoinLiveStreamData) => {
    AppLogger.info(`[Socket Event: join_live] Entered. socket.id=${socket.id}, userId=${userId}, data=${JSON.stringify(data)}`);
    try {
      const { channelName } = data;
      if (!channelName) {
        AppLogger.warn(`[Socket Event: join_live] Validation failed. Channel name is required. userId=${userId}`);
        socket.emit('error_message', 'Channel name is required to join');
        return;
      }

      AppLogger.info(`[Socket Event: join_live] Socket joining room live_${channelName}. userId=${userId}`);
      socket.join(`live_${channelName}`);
      
      AppLogger.info(`[Socket Event: join_live] Calling liveStreamService.joinLiveStream for userId=${userId}, channelName=${channelName}`);
      const liveStream = await liveStreamService.joinLiveStream(userId, channelName);
      AppLogger.info(`[Socket Event: join_live] liveStreamService.joinLiveStream returned successfully. viewerCount=${liveStream.viewerCount}`);
      
      // Fetch user profile details for broadcasting presence
      AppLogger.info(`[Socket Event: join_live] Fetching User details for presence broadcast. userId=${userId}`);
      const userObj = await User.findById(userId)
        .select('name profileImage bio location isPremium gender country')
        .populate('profileImage');

      // Notify the room about the new viewer
      AppLogger.info(`[Socket Event: join_live] Broadcasting viewer_joined to live_${channelName}. user=${userObj?.name}, viewerCount=${liveStream.viewerCount}`);
      io.to(`live_${channelName}`).emit('viewer_joined', {
        user: userObj,
        viewerCount: liveStream.viewerCount
      });

      AppLogger.info(`[Socket Event: join_live] Success. User ${userId} joined livestream room live_${channelName}`);
    } catch (error: any) {
      AppLogger.error(`[Socket Event: join_live] Error occurred for userId=${userId}: ${error.message}`, error);
      socket.emit('error_message', error.message || 'Failed to join live stream');
    }
  });

  // Viewer leaves a live stream
  socket.on('leave_live', async (data: LeaveLiveStreamData) => {
    AppLogger.info(`[Socket Event: leave_live] Entered. socket.id=${socket.id}, userId=${userId}, data=${JSON.stringify(data)}`);
    try {
      const { channelName } = data;
      if (!channelName) {
        AppLogger.warn(`[Socket Event: leave_live] Validation failed. Channel name is missing. userId=${userId}`);
        return;
      }

      AppLogger.info(`[Socket Event: leave_live] Socket leaving room live_${channelName}. userId=${userId}`);
      socket.leave(`live_${channelName}`);
      
      AppLogger.info(`[Socket Event: leave_live] Calling liveStreamService.leaveLiveStream for userId=${userId}, channelName=${channelName}`);
      const liveStream = await liveStreamService.leaveLiveStream(userId, channelName);
      AppLogger.info(`[Socket Event: leave_live] liveStreamService.leaveLiveStream returned. Is stream found? ${!!liveStream}`);
      
      AppLogger.info(`[Socket Event: leave_live] Fetching User details for leave broadcast. userId=${userId}`);
      const userObj = await User.findById(userId)
        .select('name profileImage')
        .populate('profileImage');

      if (liveStream) {
        AppLogger.info(`[Socket Event: leave_live] Broadcasting viewer_left to live_${channelName}. user=${userObj?.name}, viewerCount=${liveStream.viewerCount}`);
        io.to(`live_${channelName}`).emit('viewer_left', {
          user: userObj,
          viewerCount: liveStream.viewerCount
        });
      } else {
        AppLogger.warn(`[Socket Event: leave_live] Stream live_${channelName} was not found or already ended. Skipped broadcasting.`);
      }

      AppLogger.info(`[Socket Event: leave_live] Success. User ${userId} left livestream room live_${channelName}`);
    } catch (error: any) {
      AppLogger.error(`[Socket Event: leave_live] Error on leave_live for user ${userId}: ${error.message}`, error);
    }
  });

  // Handle live comments/chat inside the stream
  socket.on('live_comment', async (data: LiveCommentData) => {
    AppLogger.info(`[Socket Event: live_comment] Entered. socket.id=${socket.id}, userId=${userId}, data=${JSON.stringify(data)}`);
    try {
      const { channelName, message } = data;
      if (!channelName || !message) {
        AppLogger.warn(`[Socket Event: live_comment] Validation failed. channelName or message missing. userId=${userId}`);
        socket.emit('error_message', 'Channel name and message are required');
        return;
      }

      // Check if user is blocked in this stream
      const liveStream = await LiveStream.findOne({ channelName, status: 'live' });
      if (liveStream && liveStream.blockedUsers && liveStream.blockedUsers.some(uid => uid.toString() === userId)) {
        socket.emit('error_message', 'You are blocked from chatting in this room');
        return;
      }

      AppLogger.info(`[Socket Event: live_comment] Fetching user details for comment. userId=${userId}`);
      const userObj = await User.findById(userId)
        .select('name profileImage bio isPremium')
        .populate('profileImage');

      // Broadcast comment to the stream's socket room
      AppLogger.info(`[Socket Event: live_comment] Broadcasting new_live_comment to live_${channelName}. user=${userObj?.name}`);
      io.to(`live_${channelName}`).emit('new_live_comment', {
        user: userObj,
        message,
        createdAt: new Date()
      });
      AppLogger.info(`[Socket Event: live_comment] Success. Broadcasted comment for user ${userId} to room live_${channelName}`);
    } catch (error: any) {
      AppLogger.error(`[Socket Event: live_comment] Error in live_comment for user ${userId}: ${error.message}`, error);
      socket.emit('error_message', error.message || 'Failed to send live comment');
    }
  });

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
        const liveStream = await LiveStream.findOne({ channelName, status: 'live' });
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
      
      // Broadcast gift sent event to the room
      io.to(`live_${channelName}`).emit('gift_sent', {
        sender: result.sender,
        host: result.host,
        receiver: result.receiver,
        gift: result.gift,
        quantity: result.quantity,
        createdAt: new Date()
      });
      
      AppLogger.info(`[Socket Event: send_gift] Success. Gift sent in room live_${channelName}`);
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
      // 1. Check if the disconnected user was hosting a live stream
      AppLogger.info(`[Socket Event: disconnect] Checking if userId=${userId} is host of any active streams`);
      const activeStream = await LiveStream.findOne({ hostId: userId, status: 'live' });
      if (activeStream) {
        AppLogger.info(`[Socket Event: disconnect] Host disconnected. Ending live stream: ${activeStream.channelName}`);
        await liveStreamService.endLiveStream(userId, activeStream.channelName);
        AppLogger.info(`[Socket Event: disconnect] Successfully ended stream for host: ${activeStream.channelName}`);
      } else {
        AppLogger.info(`[Socket Event: disconnect] User is not hosting any active stream.`);
      }

      // 2. Check if the user was watching any active streams and remove them
      AppLogger.info(`[Socket Event: disconnect] Checking if userId=${userId} was watching any active streams`);
      const streamsWatched = await LiveStream.find({ status: 'live', viewers: userId });
      AppLogger.info(`[Socket Event: disconnect] Found ${streamsWatched.length} watched streams for user ${userId}`);
      for (const stream of streamsWatched) {
        AppLogger.info(`[Socket Event: disconnect] Removing viewer ${userId} from stream ${stream.channelName}`);
        await liveStreamService.leaveLiveStream(userId, stream.channelName);
        
        AppLogger.info(`[Socket Event: disconnect] Fetching username and profile image for ${userId}`);
        const userObj = await User.findById(userId)
          .select('name profileImage')
          .populate('profileImage');
        
        AppLogger.info(`[Socket Event: disconnect] Broadcasting viewer_left to live_${stream.channelName}. New viewerCount target roughly: ${stream.viewerCount - 1}`);
        io.to(`live_${stream.channelName}`).emit('viewer_left', {
          user: userObj,
          viewerCount: stream.viewerCount - 1
        });
      }
      AppLogger.info(`[Socket Event: disconnect] Completed disconnect cleanup for userId=${userId}`);
    } catch (error: any) {
      AppLogger.error(`[Socket Event: disconnect] Error cleaning up live stream on disconnect for user ${userId}: ${error.message}`, error);
    }
  });
};
