import { Service, Container } from 'typedi';
import mongoose from 'mongoose';
import { RtcTokenBuilder, RtcRole } from 'agora-token';
import LiveStream from '../../models/LiveStream';
import User from '../../models/User';
import config from '../../config';
import AppLogger from '../../api/loaders/logger';

@Service()
export class LiveStreamService {
  /**
   * Generates an Agora RTC Token for a channel
   */
  public generateAgoraToken(channelName: string, uid: number, role: 'publisher' | 'subscriber'): string {
    const appId = config.agora.appId;
    const appCertificate = config.agora.appCertificate;

    const rtcRole = role === 'publisher' ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;

    // Set token expiration to 2 hours (7200 seconds)
    const expirationTimeInSeconds = 7200;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    return RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelName,
      uid,
      rtcRole,
      privilegeExpiredTs,
      privilegeExpiredTs
    );
  }

  /**
   * Starts a new livestream for a host
   */
  public async startLiveStream(hostId: string, title: string) {
    if (!mongoose.Types.ObjectId.isValid(hostId)) {
      throw new Error('Invalid host ID');
    }

    // Check if the user is already hosting a live stream
    const activeStream = await LiveStream.findOne({ hostId, status: 'live' });
    if (activeStream) {
      const populatedStream = await LiveStream.findById(activeStream._id).populate({
        path: 'hostId',
        populate: {
          path: 'profileImage'
        }
      });
      return populatedStream || activeStream;
    }

    const host = await User.findById(hostId);
    if (!host) {
      throw new Error('Host user not found');
    }

    // Generate unique channel name, e.g. live_hostId_timestamp
    const channelName = `live_${hostId}_${Date.now()}`;

    // Generate Agora RTC token for the host (broadcaster/publisher).
    // Host RTC UID can be 0 (default/auto-assign)
    const token = this.generateAgoraToken(channelName, 0, 'publisher');

    const liveStream = await LiveStream.create({
      hostId: new mongoose.Types.ObjectId(hostId),
      channelName,
      title,
      status: 'live',
      token,
      viewerCount: 0,
      viewers: [],
      startedAt: new Date()
    });

    const populatedStream = await LiveStream.findById(liveStream._id).populate({
      path: 'hostId',
      populate: {
        path: 'profileImage'
      }
    });

    return populatedStream || liveStream;
  }

  private getSocketIo() {
    try {
      const io = Container.get('socket') as any;
      if (!io) {
        AppLogger.error('[Socket] Container.get("socket") returned null or undefined');
      }
      return io;
    } catch (error: any) {
      AppLogger.error(`[Socket] Container.get("socket") threw an error: ${error.message}`, error);
      return null;
    }
  }

  /**
   * Ends an active live stream
   */
  public async endLiveStream(hostId: string, channelName?: string) {
    if (!mongoose.Types.ObjectId.isValid(hostId)) {
      throw new Error('Invalid host ID');
    }

    const query: any = { hostId: new mongoose.Types.ObjectId(hostId), status: 'live' };
    if (channelName) {
      query.channelName = channelName;
    }

    const liveStream = await LiveStream.findOne(query);
    if (!liveStream) {
      throw new Error('No active live stream found to end');
    }

    liveStream.status = 'ended';
    liveStream.endedAt = new Date();
    liveStream.viewers = [];
    liveStream.viewerCount = 0;
    await liveStream.save();

    // Emit live_ended event to notifying all socket clients in the room
    const io = this.getSocketIo();
    if (io) {
      const roomName = `live_${liveStream.channelName}`;
      AppLogger.info(`[Socket] Emitting live_ended event to room: ${roomName}`);
      io.to(roomName).emit('live_ended', {
        channelName: liveStream.channelName,
        message: 'Livestream has been ended by the host'
      });
    } else {
      AppLogger.error('[Socket] io is null, cannot emit live_ended event');
    }

    const populatedStream = await LiveStream.findById(liveStream._id).populate({
      path: 'hostId',
      populate: {
        path: 'profileImage'
      }
    });

    return populatedStream || liveStream;
  }

  /**
   * Viewer joins a livestream
   */
  public async joinLiveStream(userId: string, channelName: string) {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error('Invalid user ID');
    }

    const liveStream = await LiveStream.findOne({ channelName, status: 'live' });
    if (!liveStream) {
      throw new Error('Live stream not found or has ended');
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Avoid duplicate entries in viewers list
    if (!liveStream.viewers.some(id => id.toString() === userId)) {
      liveStream.viewers.push(userObjectId);
      liveStream.viewerCount = liveStream.viewers.length;
      await liveStream.save();
    }

    const populatedStream = await LiveStream.findById(liveStream._id).populate({
      path: 'hostId',
      populate: {
        path: 'profileImage'
      }
    });

    return populatedStream || liveStream;
  }

  /**
   * Viewer leaves a livestream
   */
  public async leaveLiveStream(userId: string, channelName: string) {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error('Invalid user ID');
    }

    const liveStream = await LiveStream.findOne({ channelName, status: 'live' });
    if (!liveStream) {
      return null;
    }

    liveStream.viewers = liveStream.viewers.filter(id => id.toString() !== userId);
    liveStream.viewerCount = liveStream.viewers.length;
    await liveStream.save();

    const populatedStream = await LiveStream.findById(liveStream._id).populate({
      path: 'hostId',
      populate: {
        path: 'profileImage'
      }
    });

    return populatedStream || liveStream;
  }

  /**
   * Gets list of all active live streams
   */
  public async getActiveLiveStreams(page: number = 1, limit: number = 10) {
    const query = { status: 'live' };

    const streams = await LiveStream.find(query)
      .populate({
        path: 'hostId',
        populate: {
          path: 'profileImage'
        }
      })
      .sort({ viewerCount: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await LiveStream.countDocuments(query);

    return {
      streams,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }
}
