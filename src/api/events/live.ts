import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../middleware/socketAuthMiddleware';
import { LiveStreamService } from '../../services/app/LiveStreamService';
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

  if (!socket.user) {
    return;
  }

  const userId = socket.user.id;

  // Viewer joins a live stream
  socket.on('join_live', async (data: JoinLiveStreamData) => {
    try {
      const { channelName } = data;
      if (!channelName) {
        socket.emit('error_message', 'Channel name is required to join');
        return;
      }

      socket.join(`live_${channelName}`);
      
      const liveStream = await liveStreamService.joinLiveStream(userId, channelName);
      
      // Fetch user profile details for broadcasting presence
      const userObj = await User.findById(userId)
        .select('name profileImage bio location isPremium gender country')
        .populate('profileImage');

      // Notify the room about the new viewer
      io.to(`live_${channelName}`).emit('viewer_joined', {
        user: userObj,
        viewerCount: liveStream.viewerCount
      });

      AppLogger.info(`User ${userId} joined livestream room live_${channelName}`);
    } catch (error: any) {
      socket.emit('error_message', error.message || 'Failed to join live stream');
    }
  });

  // Viewer leaves a live stream
  socket.on('leave_live', async (data: LeaveLiveStreamData) => {
    try {
      const { channelName } = data;
      if (!channelName) return;

      socket.leave(`live_${channelName}`);
      
      const liveStream = await liveStreamService.leaveLiveStream(userId, channelName);
      
      const userObj = await User.findById(userId)
        .select('name profileImage')
        .populate('profileImage');

      if (liveStream) {
        io.to(`live_${channelName}`).emit('viewer_left', {
          userId,
          name: userObj?.name,
          profileImage: userObj?.profileImage,
          viewerCount: liveStream.viewerCount
        });
      }

      AppLogger.info(`User ${userId} left livestream room live_${channelName}`);
    } catch (error: any) {
      AppLogger.error(`Error on leave_live for user ${userId}:`, error);
    }
  });

  // Handle live comments/chat inside the stream
  socket.on('live_comment', async (data: LiveCommentData) => {
    try {
      const { channelName, message } = data;
      if (!channelName || !message) {
        socket.emit('error_message', 'Channel name and message are required');
        return;
      }

      const userObj = await User.findById(userId)
        .select('name profileImage bio isPremium')
        .populate('profileImage');

      // Broadcast comment to the stream's socket room
      io.to(`live_${channelName}`).emit('new_live_comment', {
        userId,
        name: userObj?.name || 'Anonymous',
        profileImage: userObj?.profileImage,
        message,
        createdAt: new Date()
      });
    } catch (error: any) {
      socket.emit('error_message', error.message || 'Failed to send live comment');
    }
  });

  // Handle socket disconnect (clean up if host or viewer)
  socket.on('disconnect', async () => {
    try {
      // 1. Check if the disconnected user was hosting a live stream
      const activeStream = await LiveStream.findOne({ hostId: userId, status: 'live' });
      if (activeStream) {
        await liveStreamService.endLiveStream(userId, activeStream.channelName);
        AppLogger.info(`Host disconnected. Ended live stream: ${activeStream.channelName}`);
      }

      // 2. Check if the user was watching any active streams and remove them
      const streamsWatched = await LiveStream.find({ status: 'live', viewers: userId });
      for (const stream of streamsWatched) {
        await liveStreamService.leaveLiveStream(userId, stream.channelName);
        
        const userObj = await User.findById(userId).select('name');
        
        io.to(`live_${stream.channelName}`).emit('viewer_left', {
          userId,
          name: userObj?.name,
          viewerCount: stream.viewerCount - 1
        });
      }
    } catch (error: any) {
      AppLogger.error(`Error cleaning up live stream on disconnect for user ${userId}:`, error);
    }
  });
};
