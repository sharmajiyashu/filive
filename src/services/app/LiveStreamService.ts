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
   * Starts a new livestream or party room for a host
   */
  public async startLiveStream(
    hostId: string,
    title: string,
    roomType: 'livestream' | 'party_room' = 'livestream',
    partyRoomOption: 'live' | 'chat' = 'live',
    roomThemeId?: string
  ) {
    AppLogger.info(`[LiveStreamService: startLiveStream] Entered. hostId=${hostId}, title="${title}", roomType=${roomType}, option=${partyRoomOption}, roomTheme=${roomThemeId}`);
    if (!mongoose.Types.ObjectId.isValid(hostId)) {
      AppLogger.warn(`[LiveStreamService: startLiveStream] Invalid host ID format: ${hostId}`);
      throw new Error('Invalid host ID');
    }

    // Check if the user is already hosting a live stream
    AppLogger.info(`[LiveStreamService: startLiveStream] Checking if hostId=${hostId} already has an active stream`);
    const activeStream = await LiveStream.findOne({ hostId, status: 'live' });
    if (activeStream) {
      AppLogger.info(`[LiveStreamService: startLiveStream] Host already has an active stream: channelName=${activeStream.channelName}, streamId=${activeStream._id}. Populating and returning.`);
      const populatedStream = await LiveStream.findById(activeStream._id)
        .populate({
          path: 'hostId',
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
      return populatedStream || activeStream;
    }

    AppLogger.info(`[LiveStreamService: startLiveStream] Fetching host user details. hostId=${hostId}`);
    const host = await User.findById(hostId);
    if (!host) {
      AppLogger.error(`[LiveStreamService: startLiveStream] Host user not found in DB. hostId=${hostId}`);
      throw new Error('Host user not found');
    }

    // Generate unique channel name, e.g. live_hostId_timestamp
    const channelName = `live_${hostId}_${Date.now()}`;
    AppLogger.info(`[LiveStreamService: startLiveStream] Generated channelName=${channelName}`);

    // Generate Agora RTC token for the host (broadcaster/publisher).
    // Host RTC UID can be 0 (default/auto-assign)
    AppLogger.info(`[LiveStreamService: startLiveStream] Generating Agora RTC token for channelName=${channelName}`);
    const token = this.generateAgoraToken(channelName, 0, 'publisher');
    AppLogger.info(`[LiveStreamService: startLiveStream] Agora token successfully generated.`);

    const themeObjectId = roomThemeId && mongoose.Types.ObjectId.isValid(roomThemeId)
      ? new mongoose.Types.ObjectId(roomThemeId)
      : undefined;

    AppLogger.info(`[LiveStreamService: startLiveStream] Creating LiveStream DB entry...`);
    const liveStream = await LiveStream.create({
      hostId: new mongoose.Types.ObjectId(hostId),
      channelName,
      title,
      status: 'live',
      token,
      viewerCount: 0,
      viewers: [],
      roomType,
      partyRoomOption,
      roomTheme: themeObjectId,
      blockedUsers: [],
      startedAt: new Date()
    });
    AppLogger.info(`[LiveStreamService: startLiveStream] LiveStream created successfully. streamId=${liveStream._id}, channelName=${channelName}`);

    AppLogger.info(`[LiveStreamService: startLiveStream] Populating hostId, profileImage, and theme for return payload`);
    const populatedStream = await LiveStream.findById(liveStream._id)
      .populate({
        path: 'hostId',
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

    return populatedStream || liveStream;
  }

  /**
   * Updates room details for an active livestream
   */
  public async updateLiveStream(
    hostId: string,
    channelName: string,
    data: { title?: string; roomTheme?: string; partyRoomOption?: 'live' | 'chat' }
  ) {
    AppLogger.info(`[LiveStreamService: updateLiveStream] hostId=${hostId}, channelName=${channelName}, data=${JSON.stringify(data)}`);
    const query = { hostId: new mongoose.Types.ObjectId(hostId), channelName, status: 'live' };
    const liveStream = await LiveStream.findOne(query);
    if (!liveStream) {
      throw new Error('Active room/livestream not found or you are not the host');
    }

    if (data.title !== undefined) liveStream.title = data.title;
    if (data.partyRoomOption !== undefined) liveStream.partyRoomOption = data.partyRoomOption;
    if (data.roomTheme !== undefined) {
      liveStream.roomTheme = data.roomTheme && mongoose.Types.ObjectId.isValid(data.roomTheme)
        ? new mongoose.Types.ObjectId(data.roomTheme)
        : undefined;
    }

    await liveStream.save();

    return await LiveStream.findById(liveStream._id)
      .populate({
        path: 'hostId',
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
  }

  /**
   * Kicks and blocks a user from a room
   */
  public async blockUserFromRoom(hostId: string, channelName: string, userIdToBlock: string) {
    AppLogger.info(`[LiveStreamService: blockUserFromRoom] hostId=${hostId}, channelName=${channelName}, userIdToBlock=${userIdToBlock}`);
    const liveStream = await LiveStream.findOne({ channelName, status: 'live' });
    if (!liveStream) {
      throw new Error('Active room/livestream not found');
    }

    // Only host or admin can block
    if (liveStream.hostId.toString() !== hostId) {
      // Find host to see if they are an admin
      const requestor = await User.findById(hostId);
      if (!requestor || requestor.userRole !== 'admin') {
        throw new Error('Unauthorized. Only the host or admin can block users.');
      }
    }

    const blockObjectId = new mongoose.Types.ObjectId(userIdToBlock);
    if (!liveStream.blockedUsers) {
      liveStream.blockedUsers = [];
    }

    if (!liveStream.blockedUsers.some(uid => uid.toString() === userIdToBlock)) {
      liveStream.blockedUsers.push(blockObjectId);
    }

    // Remove from active viewers list
    liveStream.viewers = liveStream.viewers.filter(uid => uid.toString() !== userIdToBlock);
    liveStream.viewerCount = liveStream.viewers.length;

    await liveStream.save();

    // Trigger socket kick
    const io = this.getSocketIo();
    if (io) {
      const roomName = `live_${channelName}`;
      io.to(roomName).emit('user_blocked', {
        userId: userIdToBlock,
        channelName,
        message: 'You have been blocked and kicked from this room'
      });
    }

    return liveStream;
  }

  /**
   * Unblocks a user from a room
   */
  public async unblockUserFromRoom(hostId: string, channelName: string, userIdToUnblock: string) {
    AppLogger.info(`[LiveStreamService: unblockUserFromRoom] hostId=${hostId}, channelName=${channelName}, userIdToUnblock=${userIdToUnblock}`);
    const liveStream = await LiveStream.findOne({ channelName, status: 'live' });
    if (!liveStream) {
      throw new Error('Active room/livestream not found');
    }

    if (liveStream.hostId.toString() !== hostId) {
      const requestor = await User.findById(hostId);
      if (!requestor || requestor.userRole !== 'admin') {
        throw new Error('Unauthorized. Only the host or admin can unblock users.');
      }
    }

    if (liveStream.blockedUsers) {
      liveStream.blockedUsers = liveStream.blockedUsers.filter(uid => uid.toString() !== userIdToUnblock);
      await liveStream.save();
    }

    return liveStream;
  }

  /**
   * Retrieves room audience details
   */
  public async getAudienceList(channelName: string) {
    const liveStream = await LiveStream.findOne({ channelName, status: 'live' })
      .populate({
        path: 'viewers',
        select: 'name profileImage email mobile isPremium wealthCoins charmCoins gender country location',
        populate: {
          path: 'profileImage'
        }
      });

    if (!liveStream) {
      throw new Error('Active room/livestream not found');
    }

    return liveStream.viewers;
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
    AppLogger.info(`[LiveStreamService: endLiveStream] Entered. hostId=${hostId}, channelName=${channelName}`);
    if (!mongoose.Types.ObjectId.isValid(hostId)) {
      AppLogger.warn(`[LiveStreamService: endLiveStream] Invalid host ID format: ${hostId}`);
      throw new Error('Invalid host ID');
    }

    const query: any = { hostId: new mongoose.Types.ObjectId(hostId), status: 'live' };
    if (channelName) {
      query.channelName = channelName;
    }

    AppLogger.info(`[LiveStreamService: endLiveStream] Querying active stream with query: ${JSON.stringify(query)}`);
    const liveStream = await LiveStream.findOne(query);
    if (!liveStream) {
      AppLogger.warn(`[LiveStreamService: endLiveStream] No active live stream found for query: ${JSON.stringify(query)}`);
      throw new Error('No active live stream found to end');
    }

    AppLogger.info(`[LiveStreamService: endLiveStream] Found active stream: channelName=${liveStream.channelName}, streamId=${liveStream._id}. Updating status to 'ended'.`);
    liveStream.status = 'ended';
    liveStream.endedAt = new Date();
    liveStream.viewers = [];
    liveStream.viewerCount = 0;
    await liveStream.save();
    AppLogger.info(`[LiveStreamService: endLiveStream] Saved end status in database.`);

    // Emit live_ended event to notifying all socket clients in the room
    AppLogger.info(`[LiveStreamService: endLiveStream] Fetching socket instance to emit live_ended event`);
    const io = this.getSocketIo();
    if (io) {
      const roomName = `live_${liveStream.channelName}`;
      AppLogger.info(`[Socket] Emitting live_ended event to room: ${roomName}`);
      io.to(roomName).emit('live_ended', {
        channelName: liveStream.channelName,
        message: 'Livestream has been ended by the host'
      });
      AppLogger.info(`[Socket] Successfully emitted live_ended event to room: ${roomName}`);
    } else {
      AppLogger.error('[Socket] io is null, cannot emit live_ended event');
    }

    AppLogger.info(`[LiveStreamService: endLiveStream] Populating hostId and profileImage for return payload`);
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
    AppLogger.info(`[LiveStreamService: joinLiveStream] Entered. userId=${userId}, channelName=${channelName}`);
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      AppLogger.warn(`[LiveStreamService: joinLiveStream] Invalid user ID format: ${userId}`);
      throw new Error('Invalid user ID');
    }

    AppLogger.info(`[LiveStreamService: joinLiveStream] Querying active stream for channelName=${channelName}`);
    const liveStream = await LiveStream.findOne({ channelName, status: 'live' });
    if (!liveStream) {
      AppLogger.warn(`[LiveStreamService: joinLiveStream] Active livestream not found or has ended. channelName=${channelName}`);
      throw new Error('Live stream not found or has ended');
    }

    if (liveStream.blockedUsers && liveStream.blockedUsers.some(id => id.toString() === userId)) {
      throw new Error('You are blocked and kicked from this room');
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Avoid duplicate entries in viewers list
    const isAlreadyWatching = liveStream.viewers.some(id => id.toString() === userId);
    AppLogger.info(`[LiveStreamService: joinLiveStream] Found streamId=${liveStream._id}. Is user already watching? ${isAlreadyWatching}`);
    
    if (!isAlreadyWatching) {
      AppLogger.info(`[LiveStreamService: joinLiveStream] Adding userId=${userId} to viewers list.`);
      liveStream.viewers.push(userObjectId);
      liveStream.viewerCount = liveStream.viewers.length;
      await liveStream.save();
      AppLogger.info(`[LiveStreamService: joinLiveStream] Saved viewer entry in DB. New viewerCount=${liveStream.viewerCount}`);
    } else {
      AppLogger.info(`[LiveStreamService: joinLiveStream] User was already in viewers list. Skipping DB update.`);
    }

    AppLogger.info(`[LiveStreamService: joinLiveStream] Populating hostId, profileImage, and theme for return payload`);
    const populatedStream = await LiveStream.findById(liveStream._id)
      .populate({
        path: 'hostId',
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

    return populatedStream || liveStream;
  }

  /**
   * Viewer leaves a livestream
   */
  public async leaveLiveStream(userId: string, channelName: string) {
    AppLogger.info(`[LiveStreamService: leaveLiveStream] Entered. userId=${userId}, channelName=${channelName}`);
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      AppLogger.warn(`[LiveStreamService: leaveLiveStream] Invalid user ID format: ${userId}`);
      throw new Error('Invalid user ID');
    }

    AppLogger.info(`[LiveStreamService: leaveLiveStream] Querying active stream for channelName=${channelName}`);
    const liveStream = await LiveStream.findOne({ channelName, status: 'live' });
    if (!liveStream) {
      AppLogger.warn(`[LiveStreamService: leaveLiveStream] Active stream not found. Returning null. channelName=${channelName}`);
      return null;
    }

    AppLogger.info(`[LiveStreamService: leaveLiveStream] Found streamId=${liveStream._id}. Removing userId=${userId} from viewers list.`);
    const originalCount = liveStream.viewers.length;
    liveStream.viewers = liveStream.viewers.filter(id => id.toString() !== userId);
    liveStream.viewerCount = liveStream.viewers.length;
    
    AppLogger.info(`[LiveStreamService: leaveLiveStream] Before filter count=${originalCount}, after filter count=${liveStream.viewerCount}`);
    await liveStream.save();
    AppLogger.info(`[LiveStreamService: leaveLiveStream] Saved updated viewer list in DB.`);

    AppLogger.info(`[LiveStreamService: leaveLiveStream] Populating hostId, profileImage, and theme for return payload`);
    const populatedStream = await LiveStream.findById(liveStream._id)
      .populate({
        path: 'hostId',
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

    return populatedStream || liveStream;
  }

  /**
   * Gets list of all active live streams
   */
  public async getActiveLiveStreams(page: number = 1, limit: number = 10) {
    AppLogger.info(`[LiveStreamService: getActiveLiveStreams] Entered. page=${page}, limit=${limit}`);
    const query = { status: 'live' };

    AppLogger.info(`[LiveStreamService: getActiveLiveStreams] Querying active streams...`);
    const streams = await LiveStream.find(query)
      .populate({
        path: 'hostId',
        populate: {
          path: 'profileImage'
        }
      })
      .populate({
        path: 'roomTheme',
        populate: {
          path: 'media'
        }
      })
      .sort({ viewerCount: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await LiveStream.countDocuments(query);
    AppLogger.info(`[LiveStreamService: getActiveLiveStreams] Successfully retrieved. Found=${streams.length}, Total=${total}`);

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
