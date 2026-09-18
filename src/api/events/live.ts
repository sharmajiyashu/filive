import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../middleware/socketAuthMiddleware';
import { LiveStreamService } from '../../services/app/LiveStreamService';
import { GiftService } from '../../services/app/GiftService';
import Room from '../../models/Room';
import mongoose from 'mongoose';
import User from '../../models/User';
import Container from 'typedi';
import AppLogger from '../loaders/logger';
import { emitSocketError } from '../../utils/socketResponse';

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
  const handleJoin = async (data: JoinLiveStreamData, callback?: any) => {
    AppLogger.info(`[Socket Event: join_room/join_live] Entered. socket.id=${socket.id}, userId=${userId}, data=${JSON.stringify(data)}`);
    try {
      const { channelName } = data || {};
      if (!channelName) {
        AppLogger.warn(`[Socket Event: join_room/join_live] Validation failed. Channel name is required. userId=${userId}`);
        emitSocketError(socket, 'join_room', 'Channel name is required to join', 'Validation failed', 'CHANNEL_NAME_REQUIRED', callback);
        return;
      }

      AppLogger.info(`[Socket Event: join_room/join_live] Socket joining rooms live_${channelName} and room_${channelName}. userId=${userId}`);
      socket.join(`live_${channelName}`);
      socket.join(`room_${channelName}`);

      AppLogger.info(`[Socket Event: join_room/join_live] Calling liveStreamService.joinLiveStream for userId=${userId}, channelName=${channelName}`);
      const liveStream = await liveStreamService.joinLiveStream(userId, channelName);
      AppLogger.info(`[Socket Event: join_room/join_live] liveStreamService.joinLiveStream returned successfully. viewerCount=${liveStream.viewerCount}`);

      const joinedResponse = {
        ...liveStream,
        success: true,
        type: 'room_joined'
      };

      socket.emit('live_joined', joinedResponse);
      socket.emit('room_joined', joinedResponse);

      AppLogger.info(`[Socket Event: join_room/join_live] Fetching User details for presence broadcast. userId=${userId}`);
      const userObj = await User.findById(userId)
        .select('name userId profileImage bio location isPremium gender country')
        .populate('profileImage');

      const userJson = userObj ? (userObj.toObject ? userObj.toObject() : userObj) as any : null;
      if (userJson) {
        userJson.userId = userJson.userId ?? null;
        userJson.charmRankingDaily = await liveStreamService.getHostDailyCharmRank(userId);
      }

      const payload = {
        success: true,
        type: 'viewer_joined',
        channelName,
        roomId: liveStream.roomId ?? null,
        room_id: liveStream.roomId ?? null,
        user: userJson || userObj,
        viewerCount: liveStream.viewerCount,
        charmRankingDaily: userJson?.charmRankingDaily,
        totalGiftRevenue: liveStream?.totalGiftRevenue || 0,
        roomFollowerCount: liveStream?.roomFollowerCount || 0,
        seats: liveStream.seats || [],
        maxSeats: liveStream.seats ? liveStream.seats.length : 0
      };

      AppLogger.info(`[Socket Event: join_room/join_live] Broadcasting to live_${channelName} and room_${channelName}. payload=${JSON.stringify(payload)}`);

      io.to(`live_${channelName}`).to(`room_${channelName}`).emit('viewer_joined', payload);
      io.to(`live_${channelName}`).to(`room_${channelName}`).emit('room_viewer_joined', payload);

      if (typeof callback === 'function') {
        callback({ success: true, type: 'SUCCESS', event: 'join_room', data: liveStream });
      }

      AppLogger.info(`[Socket Event: join_room/join_live] Success. User ${userId} joined room_${channelName}`);
    } catch (error: any) {
      const knownErrors = ['Live stream not found or has ended', 'Invalid user ID', 'You are blocked and kicked from this room', 'You are banned from live streaming'];
      if (knownErrors.includes(error.message)) {
        AppLogger.warn(`[Socket Event: join_room/join_live] Warning for userId=${userId}: ${error.message}`);
      } else {
        AppLogger.error(`[Socket Event: join_room/join_live] Error occurred for userId=${userId}: ${error.message}`, error);
      }
      emitSocketError(socket, 'join_room', error, 'Failed to join room', undefined, callback);
    }
  };

  socket.on('join_live', handleJoin);
  socket.on('join_room', handleJoin);

  // Handler for leaving a room (supports leave_live and leave_room)
  const handleLeave = async (data: LeaveLiveStreamData, callback?: any) => {
    AppLogger.info(`[Socket Event: leave_room/leave_live] Entered. socket.id=${socket.id}, userId=${userId}, data=${JSON.stringify(data)}`);
    try {
      const { channelName } = data || {};
      if (!channelName) {
        AppLogger.warn(`[Socket Event: leave_room/leave_live] Validation failed. Channel name is missing. userId=${userId}`);
        emitSocketError(socket, 'leave_room', 'Channel name is required', 'Validation failed', 'CHANNEL_NAME_REQUIRED', callback);
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
        .select('name userId profileImage')
        .populate('profileImage');

      const userJson = userObj ? (userObj.toObject ? userObj.toObject() : userObj) as any : null;
      if (userJson) {
        userJson.userId = userJson.userId ?? null;
        userJson.charmRankingDaily = await liveStreamService.getHostDailyCharmRank(userId);
      }

      const leaveAck = {
        success: true,
        type: 'room_left',
        channelName,
        roomId: liveStream?.roomId ?? null,
        room_id: liveStream?.roomId ?? null,
        viewerCount: liveStream?.viewerCount ?? 0
      };
      socket.emit('live_left', leaveAck);
      socket.emit('room_left', leaveAck);

      if (liveStream) {
        const payload = {
          success: true,
          type: 'viewer_left',
          channelName,
          roomId: liveStream.roomId ?? null,
          room_id: liveStream.roomId ?? null,
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

      if (typeof callback === 'function') {
        callback({ success: true, type: 'SUCCESS', event: 'leave_room', data: leaveAck });
      }

      AppLogger.info(`[Socket Event: leave_room/leave_live] Success. User ${userId} left room_${channelName}`);
    } catch (error: any) {
      AppLogger.error(`[Socket Event: leave_room/leave_live] Error on leave for user ${userId}: ${error.message}`, error);
      emitSocketError(socket, 'leave_room', error, 'Failed to leave room', undefined, callback);
    }
  };

  socket.on('leave_live', handleLeave);
  socket.on('leave_room', handleLeave);

  // Handler for room messages/comments (supports live_comment, room_comment, room_message)
  const handleComment = async (data: LiveCommentData, callback?: any) => {
    AppLogger.info(`[Socket Event: comment] Entered. socket.id=${socket.id}, userId=${userId}, data=${JSON.stringify(data)}`);
    try {
      const { channelName, message } = data || {};
      if (!channelName || !message) {
        AppLogger.warn(`[Socket Event: comment] Validation failed. channelName or message missing. userId=${userId}`);
        emitSocketError(socket, 'room_comment', 'Channel name and message are required', 'Validation failed', 'VALIDATION_FAILED', callback);
        return;
      }

      // Check if user is blocked in this stream
      const liveStream = await Room.findOne({ channelName, status: 'live' });
      if (liveStream && liveStream.blockedUsers && liveStream.blockedUsers.some(uid => uid.toString() === userId)) {
        emitSocketError(socket, 'room_comment', 'You are blocked from chatting in this room', 'Action forbidden', 'USER_BLOCKED_FROM_ROOM', callback);
        return;
      }

      if (liveStream) {
        await Room.updateOne({ _id: liveStream._id }, { $inc: { commentCount: 1 } });
      }

      AppLogger.info(`[Socket Event: comment] Fetching user details for comment. userId=${userId}`);
      const userObj = await User.findById(userId)
        .select('name userId profileImage bio isPremium')
        .populate('profileImage');
      const userJson = userObj ? (userObj.toObject ? userObj.toObject() : userObj) as any : null;
      if (userJson) {
        userJson.userId = userJson.userId ?? null;
        userJson.profileImage = userJson.profileImage ?? null;
      }

      const payload = {
        success: true,
        type: 'new_comment',
        channelName,
        roomId: liveStream?.roomId ?? null,
        room_id: liveStream?.roomId ?? null,
        user: userJson,
        message,
        createdAt: new Date()
      };
      AppLogger.info(`[Socket Event: comment] Broadcasting to live_${channelName} and room_${channelName}. payload=${JSON.stringify(payload)}`);

      io.to(`live_${channelName}`).to(`room_${channelName}`).emit('new_live_comment', payload);
      io.to(`live_${channelName}`).to(`room_${channelName}`).emit('new_room_comment', payload);
      io.to(`live_${channelName}`).to(`room_${channelName}`).emit('new_room_message', payload);

      if (typeof callback === 'function') {
        callback({ success: true, type: 'SUCCESS', event: 'room_comment', data: payload });
      }

      AppLogger.info(`[Socket Event: comment] Success. Broadcasted comment for user ${userId}`);
    } catch (error: any) {
      AppLogger.error(`[Socket Event: comment] Error for user ${userId}: ${error.message}`, error);
      emitSocketError(socket, 'room_comment', error, 'Failed to send comment', undefined, callback);
    }
  };

  socket.on('live_comment', handleComment);
  socket.on('room_comment', handleComment);
  socket.on('room_message', handleComment);

  // Handle Music events
  socket.on('play_music', async (data: { channelName: string; musicUrl: string; musicTitle: string }, callback?: any) => {
    AppLogger.info(`[Socket Event: play_music] Entered. userId=${userId}, data=${JSON.stringify(data)}`);
    try {
      const { channelName, musicUrl, musicTitle } = data || {};
      if (!channelName || !musicUrl) {
        emitSocketError(socket, 'play_music', 'channelName and musicUrl are required', 'Validation failed', 'VALIDATION_FAILED', callback);
        return;
      }
      const payload = { success: true, type: 'music_playing', musicUrl, musicTitle, senderId: userId };
      io.to(`live_${channelName}`).to(`room_${channelName}`).emit('music_playing', payload);
      if (typeof callback === 'function') {
        callback({ success: true, type: 'SUCCESS', event: 'play_music', data: payload });
      }
      AppLogger.info(`[Socket Event: play_music] Broadcasted music_playing to rooms live_${channelName} and room_${channelName}`);
    } catch (error: any) {
      AppLogger.error(`[Socket Event: play_music] Error for user ${userId}: ${error.message}`);
      emitSocketError(socket, 'play_music', error, 'Failed to play music', undefined, callback);
    }
  });

  socket.on('stop_music', async (data: { channelName: string }, callback?: any) => {
    AppLogger.info(`[Socket Event: stop_music] Entered. userId=${userId}, data=${JSON.stringify(data)}`);
    try {
      const { channelName } = data || {};
      if (!channelName) {
        emitSocketError(socket, 'stop_music', 'channelName is required', 'Validation failed', 'VALIDATION_FAILED', callback);
        return;
      }
      const payload = { success: true, type: 'music_stopped', senderId: userId };
      io.to(`live_${channelName}`).to(`room_${channelName}`).emit('music_stopped', payload);
      if (typeof callback === 'function') {
        callback({ success: true, type: 'SUCCESS', event: 'stop_music', data: payload });
      }
      AppLogger.info(`[Socket Event: stop_music] Broadcasted music_stopped to rooms live_${channelName} and room_${channelName}`);
    } catch (error: any) {
      AppLogger.error(`[Socket Event: stop_music] Error for user ${userId}: ${error.message}`);
      emitSocketError(socket, 'stop_music', error, 'Failed to stop music', undefined, callback);
    }
  });

  // Handle Game events
  socket.on('start_game', async (data: { channelName: string; gameId: string }, callback?: any) => {
    AppLogger.info(`[Socket Event: start_game] Entered. userId=${userId}, data=${JSON.stringify(data)}`);
    try {
      const { channelName, gameId } = data || {};
      if (!channelName || !gameId) {
        emitSocketError(socket, 'start_game', 'channelName and gameId are required', 'Validation failed', 'VALIDATION_FAILED', callback);
        return;
      }
      
      const game = await mongoose.model('Game').findById(gameId).populate('image');
      if (!game) {
        emitSocketError(socket, 'start_game', 'Game not found', 'Game not found', 'GAME_NOT_FOUND', callback);
        return;
      }

      // Update the room setting to reflect the active game
      const liveStream = await Room.findOne({ channelName });
      if (liveStream) {
         await mongoose.model('RoomSetting').findOneAndUpdate(
           { hostId: liveStream.hostId },
           { gameId: new mongoose.Types.ObjectId(gameId) }
         );
      }

      const payload = { success: true, type: 'game_started', game, senderId: userId };
      io.to(`live_${channelName}`).to(`room_${channelName}`).emit('game_started', payload);
      if (typeof callback === 'function') {
        callback({ success: true, type: 'SUCCESS', event: 'start_game', data: payload });
      }
      AppLogger.info(`[Socket Event: start_game] Broadcasted game_started to rooms`);
    } catch (error: any) {
      AppLogger.error(`[Socket Event: start_game] Error for user ${userId}: ${error.message}`);
      emitSocketError(socket, 'start_game', error, 'Failed to start game', undefined, callback);
    }
  });

  socket.on('end_game', async (data: { channelName: string }, callback?: any) => {
    AppLogger.info(`[Socket Event: end_game] Entered. userId=${userId}, data=${JSON.stringify(data)}`);
    try {
      const { channelName } = data || {};
      if (!channelName) {
        emitSocketError(socket, 'end_game', 'channelName is required', 'Validation failed', 'VALIDATION_FAILED', callback);
        return;
      }

      const liveStream = await Room.findOne({ channelName });
      if (liveStream) {
         await mongoose.model('RoomSetting').findOneAndUpdate(
           { hostId: liveStream.hostId },
           { $unset: { gameId: "" } }
         );
      }

      const payload = { success: true, type: 'game_ended', senderId: userId };
      io.to(`live_${channelName}`).to(`room_${channelName}`).emit('game_ended', payload);
      if (typeof callback === 'function') {
        callback({ success: true, type: 'SUCCESS', event: 'end_game', data: payload });
      }
      AppLogger.info(`[Socket Event: end_game] Broadcasted game_ended to rooms`);
    } catch (error: any) {
      AppLogger.error(`[Socket Event: end_game] Error for user ${userId}: ${error.message}`);
      emitSocketError(socket, 'end_game', error, 'Failed to end game', undefined, callback);
    }
  });

  // Handle Emoji and GIF events
  socket.on('send_emoji', async (data: { channelName: string; emoji: string }, callback?: any) => {
    AppLogger.info(`[Socket Event: send_emoji] Entered. userId=${userId}, data=${JSON.stringify(data)}`);
    try {
      const { channelName, emoji } = data || {};
      if (!channelName || !emoji) {
        emitSocketError(socket, 'send_emoji', 'channelName and emoji are required', 'Validation failed', 'VALIDATION_FAILED', callback);
        return;
      }
      const payload = { success: true, type: 'emoji_received', emoji, senderId: userId };
      io.to(`live_${channelName}`).to(`room_${channelName}`).emit('emoji_received', payload);
      if (typeof callback === 'function') {
        callback({ success: true, type: 'SUCCESS', event: 'send_emoji', data: payload });
      }
      AppLogger.info(`[Socket Event: send_emoji] Broadcasted emoji_received to rooms`);
    } catch (error: any) {
      AppLogger.error(`[Socket Event: send_emoji] Error for user ${userId}: ${error.message}`);
      emitSocketError(socket, 'send_emoji', error, 'Failed to send emoji', undefined, callback);
    }
  });

  socket.on('send_gif', async (data: { channelName: string; gifUrl: string }, callback?: any) => {
    AppLogger.info(`[Socket Event: send_gif] Entered. userId=${userId}, data=${JSON.stringify(data)}`);
    try {
      const { channelName, gifUrl } = data || {};
      if (!channelName || !gifUrl) {
        emitSocketError(socket, 'send_gif', 'channelName and gifUrl are required', 'Validation failed', 'VALIDATION_FAILED', callback);
        return;
      }
      const payload = { success: true, type: 'gif_received', gifUrl, senderId: userId };
      io.to(`live_${channelName}`).to(`room_${channelName}`).emit('gif_received', payload);
      if (typeof callback === 'function') {
        callback({ success: true, type: 'SUCCESS', event: 'send_gif', data: payload });
      }
      AppLogger.info(`[Socket Event: send_gif] Broadcasted gif_received to rooms`);
    } catch (error: any) {
      AppLogger.error(`[Socket Event: send_gif] Error for user ${userId}: ${error.message}`);
      emitSocketError(socket, 'send_gif', error, 'Failed to send gif', undefined, callback);
    }
  });

  // Handle gift sending via sockets
  socket.on('send_gift', async (data: { channelName: string; giftId: string; receiverId?: string; contextType?: 'live_stream' | 'party_room' | 'audio_call' | 'video_call'; quantity?: number }, callback?: any) => {
    AppLogger.info(`[Socket Event: send_gift] Entered. userId=${userId}, data=${JSON.stringify(data)}`);
    try {
      const { channelName, giftId, receiverId, contextType, quantity } = data || {};
      if (!giftId) {
        emitSocketError(socket, 'send_gift', 'giftId is required', 'Validation failed', 'GIFT_ID_REQUIRED', callback);
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
        emitSocketError(socket, 'send_gift', 'receiverId is required', 'Validation failed', 'RECEIVER_ID_REQUIRED', callback);
        return;
      }

      const parsedQuantity = quantity ? Number(quantity) : 1;
      const result = await giftService.sendGift(userId, channelName, giftId, actualReceiverId, contextType, parsedQuantity);

      const liveRoom = channelName ? await Room.findOne({ channelName }).select('roomId') : null;
      const payload = {
        success: true,
        type: 'gift_sent',
        channelName: channelName || null,
        roomId: liveRoom?.roomId ?? null,
        room_id: liveRoom?.roomId ?? null,
        sender: result.sender,
        host: result.host,
        receiver: result.receiver,
        gift: result.gift,
        quantity: result.quantity,
        createdAt: new Date()
      };
      AppLogger.info(`[Socket Event: send_gift] Success. Gift sent in rooms live_${channelName} and room_${channelName}. payload=${JSON.stringify(payload)}`);
      io.to(`live_${channelName}`).to(`room_${channelName}`).emit('gift_sent', payload);
      if (typeof callback === 'function') {
        callback({ success: true, type: 'SUCCESS', event: 'send_gift', data: payload });
      }
    } catch (error: any) {
      AppLogger.error(`[Socket Event: send_gift] Error for user ${userId}: ${error.message}`);
      emitSocketError(socket, 'send_gift', error, 'Failed to send gift', undefined, callback);
    }
  });

  // User joins a seat in a party room
  socket.on('join_seat', async (data: { channelName: string; seatIndex: number }, callback?: any) => {
    AppLogger.info(`[Socket Event: join_seat] Entered. userId=${userId}, data=${JSON.stringify(data)}`);
    try {
      const { channelName, seatIndex } = data || {};
      if (!channelName || seatIndex === undefined) {
        emitSocketError(socket, 'join_seat', 'channelName and seatIndex are required', 'Validation failed', 'VALIDATION_FAILED', callback);
        return;
      }
      const result = await liveStreamService.joinSeat(userId, channelName, seatIndex);
      AppLogger.info(`[Socket Event: join_seat] Success. userId=${userId}, response=${JSON.stringify(result)}`);
      if (typeof callback === 'function') {
        callback({ success: true, type: 'SUCCESS', event: 'join_seat', data: result });
      }
    } catch (error: any) {
      AppLogger.error(`[Socket Event: join_seat] Error for user ${userId}: ${error.message}`);
      emitSocketError(socket, 'join_seat', error, 'Failed to join seat', undefined, callback);
    }
  });

  // User leaves a seat in a party room
  socket.on('leave_seat', async (data: { channelName: string }, callback?: any) => {
    AppLogger.info(`[Socket Event: leave_seat] Entered. userId=${userId}, data=${JSON.stringify(data)}`);
    try {
      const { channelName } = data || {};
      if (!channelName) {
        emitSocketError(socket, 'leave_seat', 'channelName is required', 'Validation failed', 'VALIDATION_FAILED', callback);
        return;
      }
      const result = await liveStreamService.leaveSeat(userId, channelName);
      AppLogger.info(`[Socket Event: leave_seat] Success. userId=${userId}, response=${JSON.stringify(result)}`);
      if (typeof callback === 'function') {
        callback({ success: true, type: 'SUCCESS', event: 'leave_seat', data: result });
      }
    } catch (error: any) {
      AppLogger.error(`[Socket Event: leave_seat] Error for user ${userId}: ${error.message}`);
      emitSocketError(socket, 'leave_seat', error, 'Failed to leave seat', undefined, callback);
    }
  });

  // Handle blocking user from host
  socket.on('block_user', async (data: { channelName: string; userIdToBlock: string }, callback?: any) => {
    AppLogger.info(`[Socket Event: block_user] Entered. userId=${userId}, data=${JSON.stringify(data)}`);
    try {
      const { channelName, userIdToBlock } = data || {};
      if (!channelName || !userIdToBlock) {
        emitSocketError(socket, 'block_user', 'channelName and userIdToBlock are required', 'Validation failed', 'VALIDATION_FAILED', callback);
        return;
      }

      const result = await liveStreamService.blockUserFromRoom(userId, channelName, userIdToBlock);
      AppLogger.info(`[Socket Event: block_user] Success. Blocked user ${userIdToBlock} in room live_${channelName}. response=${JSON.stringify(result)}`);
      if (typeof callback === 'function') {
        callback({ success: true, type: 'SUCCESS', event: 'block_user', data: result });
      }
    } catch (error: any) {
      AppLogger.error(`[Socket Event: block_user] Error for user ${userId}: ${error.message}`);
      emitSocketError(socket, 'block_user', error, 'Failed to block user', undefined, callback);
    }
  });

  // Change seat
  socket.on('change_seat', async (data: { channelName: string; newSeatIndex: number }, callback?: any) => {
    AppLogger.info(`[Socket Event: change_seat] Entered. userId=${userId}, data=${JSON.stringify(data)}`);
    try {
      const { channelName, newSeatIndex } = data || {};
      if (!channelName || newSeatIndex === undefined) {
        emitSocketError(socket, 'change_seat', 'channelName and newSeatIndex are required', 'Validation failed', 'VALIDATION_FAILED', callback);
        return;
      }
      const result = await liveStreamService.changeSeat(userId, channelName, newSeatIndex);
      AppLogger.info(`[Socket Event: change_seat] Success. userId=${userId}, response=${JSON.stringify(result)}`);
      if (typeof callback === 'function') {
        callback({ success: true, type: 'SUCCESS', event: 'change_seat', data: result });
      }
    } catch (error: any) {
      AppLogger.error(`[Socket Event: change_seat] Error for user ${userId}: ${error.message}`);
      emitSocketError(socket, 'change_seat', error, 'Failed to change seat', undefined, callback);
    }
  });

  // Lock seat
  socket.on('lock_seat', async (data: { channelName: string; seatIndex: number; lock: boolean }, callback?: any) => {
    AppLogger.info(`[Socket Event: lock_seat] Entered. userId=${userId}, data=${JSON.stringify(data)}`);
    try {
      const { channelName, seatIndex, lock } = data || {};
      if (!channelName || seatIndex === undefined || lock === undefined) {
        emitSocketError(socket, 'lock_seat', 'channelName, seatIndex, and lock are required', 'Validation failed', 'VALIDATION_FAILED', callback);
        return;
      }
      const result = await liveStreamService.lockSeat(userId, channelName, seatIndex, lock);
      AppLogger.info(`[Socket Event: lock_seat] Success. userId=${userId}, response=${JSON.stringify(result)}`);
      if (typeof callback === 'function') {
        callback({ success: true, type: 'SUCCESS', event: 'lock_seat', data: result });
      }
    } catch (error: any) {
      AppLogger.error(`[Socket Event: lock_seat] Error for user ${userId}: ${error.message}`);
      emitSocketError(socket, 'lock_seat', error, 'Failed to lock seat', undefined, callback);
    }
  });

  // Mute seat
  socket.on('mute_seat', async (data: { channelName: string; seatIndex: number; mute: boolean }, callback?: any) => {
    AppLogger.info(`[Socket Event: mute_seat] Entered. userId=${userId}, data=${JSON.stringify(data)}`);
    try {
      const { channelName, seatIndex, mute } = data || {};
      if (!channelName || seatIndex === undefined || mute === undefined) {
        emitSocketError(socket, 'mute_seat', 'channelName, seatIndex, and mute are required', 'Validation failed', 'VALIDATION_FAILED', callback);
        return;
      }
      const result = await liveStreamService.muteSeat(userId, channelName, seatIndex, mute);
      AppLogger.info(`[Socket Event: mute_seat] Success. userId=${userId}, response=${JSON.stringify(result)}`);
      if (typeof callback === 'function') {
        callback({ success: true, type: 'SUCCESS', event: 'mute_seat', data: result });
      }
    } catch (error: any) {
      AppLogger.error(`[Socket Event: mute_seat] Error for user ${userId}: ${error.message}`);
      emitSocketError(socket, 'mute_seat', error, 'Failed to mute seat', undefined, callback);
    }
  });

  // Mute all seats
  socket.on('mute_all_seats', async (data: { channelName: string; mute: boolean }, callback?: any) => {
    AppLogger.info(`[Socket Event: mute_all_seats] Entered. userId=${userId}, data=${JSON.stringify(data)}`);
    try {
      const { channelName, mute } = data || {};
      if (!channelName || mute === undefined) {
        emitSocketError(socket, 'mute_all_seats', 'channelName and mute are required', 'Validation failed', 'VALIDATION_FAILED', callback);
        return;
      }
      const result = await liveStreamService.muteAllSeats(userId, channelName, mute);
      AppLogger.info(`[Socket Event: mute_all_seats] Success. userId=${userId}, response=${JSON.stringify(result)}`);
      if (typeof callback === 'function') {
        callback({ success: true, type: 'SUCCESS', event: 'mute_all_seats', data: result });
      }
    } catch (error: any) {
      AppLogger.error(`[Socket Event: mute_all_seats] Error for user ${userId}: ${error.message}`);
      emitSocketError(socket, 'mute_all_seats', error, 'Failed to mute all seats', undefined, callback);
    }
  });

  // Kick user
  socket.on('kick_user', async (data: { channelName: string; targetUserId: string }, callback?: any) => {
    AppLogger.info(`[Socket Event: kick_user] Entered. userId=${userId}, data=${JSON.stringify(data)}`);
    try {
      const { channelName, targetUserId } = data || {};
      if (!channelName || !targetUserId) {
        emitSocketError(socket, 'kick_user', 'channelName and targetUserId are required', 'Validation failed', 'VALIDATION_FAILED', callback);
        return;
      }
      await liveStreamService.kickUser(userId, channelName, targetUserId);
      AppLogger.info(`[Socket Event: kick_user] Success. userId=${userId} kicked targetUserId=${targetUserId}`);
      if (typeof callback === 'function') {
        callback({ success: true, type: 'SUCCESS', event: 'kick_user' });
      }
    } catch (error: any) {
      AppLogger.error(`[Socket Event: kick_user] Error for user ${userId}: ${error.message}`);
      emitSocketError(socket, 'kick_user', error, 'Failed to kick user', undefined, callback);
    }
  });

  // Invite to seat
  socket.on('invite_to_seat', async (data: { channelName: string; targetUserId: string; seatIndex: number }, callback?: any) => {
    AppLogger.info(`[Socket Event: invite_to_seat] Entered. userId=${userId}, data=${JSON.stringify(data)}`);
    try {
      const { channelName, targetUserId, seatIndex } = data || {};
      if (!channelName || !targetUserId || seatIndex === undefined) {
        emitSocketError(socket, 'invite_to_seat', 'channelName, targetUserId, and seatIndex are required', 'Validation failed', 'VALIDATION_FAILED', callback);
        return;
      }
      await liveStreamService.inviteToSeat(userId, channelName, targetUserId, seatIndex);
      if (typeof callback === 'function') {
        callback({ success: true, type: 'SUCCESS', event: 'invite_to_seat' });
      }
    } catch (error: any) {
      AppLogger.error(`[Socket Event: invite_to_seat] Error for user ${userId}: ${error.message}`);
      emitSocketError(socket, 'invite_to_seat', error, 'Failed to send invitation', undefined, callback);
    }
  });

  // Make admin
  socket.on('make_admin', async (data: { channelName: string; targetUserId: string; isAdmin: boolean }, callback?: any) => {
    AppLogger.info(`[Socket Event: make_admin] Entered. userId=${userId}, data=${JSON.stringify(data)}`);
    try {
      const { channelName, targetUserId, isAdmin } = data || {};
      if (!channelName || !targetUserId || isAdmin === undefined) {
        emitSocketError(socket, 'make_admin', 'channelName, targetUserId and isAdmin are required', 'Validation failed', 'VALIDATION_FAILED', callback);
        return;
      }
      await liveStreamService.makeAdmin(userId, channelName, targetUserId, isAdmin);
      AppLogger.info(`[Socket Event: make_admin] Success. userId=${userId} set targetUserId=${targetUserId} isAdmin=${isAdmin} in channel=${channelName}`);
      if (typeof callback === 'function') {
        callback({ success: true, type: 'SUCCESS', event: 'make_admin' });
      }
    } catch (error: any) {
      AppLogger.error(`[Socket Event: make_admin] Error for user ${userId}: ${error.message}`);
      emitSocketError(socket, 'make_admin', error, 'Failed to update admin status', undefined, callback);
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
        AppLogger.info(`[Socket Event: disconnect] Host disconnected. Scheduling ending live stream in 30 seconds for channel: ${activeStream.channelName}`);
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
        }, 30000);
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
          .select('name userId profileImage')
          .populate('profileImage');

        const userJson = userObj ? (userObj.toObject ? userObj.toObject() : userObj) as any : null;
        if (userJson) {
          userJson.userId = userJson.userId ?? null;
          userJson.charmRankingDaily = await liveStreamService.getHostDailyCharmRank(userId);
        }

        const payload = {
          success: true,
          type: 'viewer_left',
          channelName: stream.channelName,
          roomId: stream.roomId ?? null,
          room_id: stream.roomId ?? null,
          user: userJson || userObj,
          viewerCount: Math.max(0, (stream.viewerCount || 1) - 1),
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
