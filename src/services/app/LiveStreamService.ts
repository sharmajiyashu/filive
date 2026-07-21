import { Service, Container } from 'typedi';
import mongoose from 'mongoose';
import { RtcTokenBuilder, RtcRole } from 'agora-token';
import Room from '../../models/Room';
import User from '../../models/User';
import RoomSetting from '../../models/RoomSetting';
import CoinHistory from '../../models/CoinHistory';
import Follow from '../../models/Follow';
import RoomFollow from '../../models/RoomFollow';
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
    roomThemeId?: string,
    announcement?: string,
    gameId?: string
  ) {
    AppLogger.info(`[LiveStreamService: startLiveStream] Entered. hostId=${hostId}, title="${title}", roomType=${roomType}, option=${partyRoomOption}, roomTheme=${roomThemeId}, announcement="${announcement}", gameId=${gameId}`);
    if (!mongoose.Types.ObjectId.isValid(hostId)) {
      AppLogger.warn(`[LiveStreamService: startLiveStream] Invalid host ID format: ${hostId}`);
      throw new Error('Invalid host ID');
    }

    // Fetch or create RoomSetting
    let roomSetting = await RoomSetting.findOne({ hostId });
    if (!roomSetting) {
      roomSetting = await RoomSetting.create({ hostId });
    }

    // Check if the user already has an active room
    AppLogger.info(`[LiveStreamService: startLiveStream] Checking if hostId=${hostId} already has an active room`);
    let activeStream = await Room.findOne({ hostId, status: 'live' });

    // For party rooms, reuse the previous party room if it exists (even if ended) to keep channelName permanent
    if (!activeStream && roomType === 'party_room') {
      activeStream = await Room.findOne({ hostId, roomType: 'party_room' }).sort({ createdAt: -1 });
      if (activeStream) {
        AppLogger.info(`[LiveStreamService: startLiveStream] Found existing ended party room for host. Reusing to keep channelName permanent.`);
      }
    }
    if (activeStream) {
      AppLogger.info(`[LiveStreamService: startLiveStream] Host already has an active room: channelName=${activeStream.channelName}, streamId=${activeStream._id}. Updating details and returning.`);

      activeStream.title = title;
      activeStream.status = 'live';
      activeStream.roomType = roomType;
      activeStream.partyRoomOption = partyRoomOption;
      activeStream.viewers = [];
      activeStream.viewerCount = 0;
      activeStream.startedAt = new Date();
      activeStream.endedAt = undefined;
      activeStream.totalGiftRevenue = 0;
      if (roomThemeId !== undefined) {
        activeStream.roomTheme = roomThemeId && mongoose.Types.ObjectId.isValid(roomThemeId)
          ? new mongoose.Types.ObjectId(roomThemeId)
          : undefined;
      }
      if (gameId !== undefined) {
        (activeStream as any).gameId = gameId && mongoose.Types.ObjectId.isValid(gameId)
          ? new mongoose.Types.ObjectId(gameId)
          : undefined;
      }
      if (announcement !== undefined) {
        activeStream.announcement = announcement;
      }

      if (roomType === 'party_room') {
        const maxSeats = roomSetting.maxSeats || 4;
        let existingSeats = activeStream.seats || [];
        let newSeats: any[] = [];
        for (let i = 0; i < maxSeats; i++) {
          const oldSeat = existingSeats.find(s => s.seatIndex === i);
          if (oldSeat) {
            if (oldSeat.status === 'occupied') {
              oldSeat.status = 'open';
              oldSeat.userId = undefined;
            }
            newSeats.push(oldSeat);
          } else {
            newSeats.push({ seatIndex: i, status: 'open', isMuted: false });
          }
        }
        activeStream.seats = newSeats;
      }

      // Regenerate token as it might have expired
      const token = this.generateAgoraToken(activeStream.channelName, 0, 'publisher');
      activeStream.token = token;

      await activeStream.save();

      const populatedStream = await Room.findById(activeStream._id)
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
        .populate({
          path: 'gameId',
          populate: {
            path: 'image'
          }
        });
      return await this.populateRoomWithDailyRank(populatedStream || activeStream, hostId);
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

    const gameObjectId = gameId && mongoose.Types.ObjectId.isValid(gameId)
      ? new mongoose.Types.ObjectId(gameId)
      : undefined;

    let initialSeats: any[] = [];
    if (roomType === 'party_room') {
      const maxSeats = roomSetting.maxSeats || 4;
      for (let i = 0; i < maxSeats; i++) {
        initialSeats.push({ seatIndex: i, status: 'open', isMuted: false });
      }
    }

    AppLogger.info(`[LiveStreamService: startLiveStream] Creating LiveStream DB entry...`);
    const liveStream = await Room.create({
      hostId: new mongoose.Types.ObjectId(hostId),
      channelName,
      title,
      announcement: announcement || '',
      status: 'live',
      token,
      viewerCount: 0,
      viewers: [],
      roomType,
      partyRoomOption,
      roomTheme: themeObjectId,
      gameId: gameObjectId,
      blockedUsers: [],
      seats: initialSeats,
      startedAt: new Date()
    });
    AppLogger.info(`[LiveStreamService: startLiveStream] LiveStream created successfully. streamId=${liveStream._id}, channelName=${channelName}`);

    AppLogger.info(`[LiveStreamService: startLiveStream] Populating hostId, profileImage, and theme for return payload`);
    const populatedStream = await Room.findById(liveStream._id)
      .populate({
        path: 'hostId',
        select: '-password -fcmTokens -otp -mobile -email -whatsapp -hostVerificationCode -coinSellerCoins',
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
      .populate({
        path: 'seats.userId',
        select: '-password -fcmTokens -otp -mobile -email -whatsapp -hostVerificationCode -coinSellerCoins',
        populate: {
          path: 'profileImage'
        }
      })
      .populate({
        path: 'gameId',
        populate: {
          path: 'image'
        }
      });

    return await this.populateRoomWithDailyRank(populatedStream || liveStream, hostId);
  }

  /**
   * Updates room details for an active livestream
   */
  public async updateLiveStream(
    hostId: string,
    channelName: string | undefined | null,
    data: { title?: string; roomTheme?: string; partyRoomOption?: 'live' | 'chat'; announcement?: string; gameId?: string; muteAllSeats?: boolean; roomType?: 'livestream' | 'party_room'; maxSeats?: number }
  ) {
    AppLogger.info(`[LiveStreamService: updateLiveStream] hostId=${hostId}, channelName=${channelName}, data=${JSON.stringify(data)}`);
    const query: any = { hostId: new mongoose.Types.ObjectId(hostId) };
    if (channelName) {
      query.channelName = channelName;
    } else {
      const latestRoom = await Room.findOne({ hostId: new mongoose.Types.ObjectId(hostId) }).sort({ createdAt: -1 });
      if (!latestRoom) {
        throw new Error('Room/livestream not found or you are not the host');
      }
      query.channelName = latestRoom.channelName;
    }

    const liveStream = await Room.findOne(query);
    if (!liveStream) {
      throw new Error('Room/livestream not found or you are not the host');
    }

    if (data.title !== undefined) liveStream.title = data.title;
    if (data.partyRoomOption !== undefined) liveStream.partyRoomOption = data.partyRoomOption;
    if (data.roomTheme !== undefined) {
      liveStream.roomTheme = data.roomTheme && mongoose.Types.ObjectId.isValid(data.roomTheme)
        ? new mongoose.Types.ObjectId(data.roomTheme)
        : undefined;
    }
    if (data.gameId !== undefined) {
      (liveStream as any).gameId = data.gameId && mongoose.Types.ObjectId.isValid(data.gameId)
        ? new mongoose.Types.ObjectId(data.gameId)
        : undefined;
    }
    if (data.announcement !== undefined) liveStream.announcement = data.announcement;
    if (data.muteAllSeats !== undefined) liveStream.muteAllSeats = data.muteAllSeats;
    if (data.roomType !== undefined) liveStream.roomType = data.roomType;

    // Find or create RoomSetting to keep it in sync
    let roomSetting = await RoomSetting.findOne({ hostId: new mongoose.Types.ObjectId(hostId) });
    if (!roomSetting) {
      roomSetting = await RoomSetting.create({ hostId: new mongoose.Types.ObjectId(hostId) });
    }

    let settingsUpdated = false;

    if (data.maxSeats !== undefined) {
      const maxSeatsNum = Number(data.maxSeats);
      if (!isNaN(maxSeatsNum) && maxSeatsNum > 0) {
        roomSetting.maxSeats = maxSeatsNum;
        settingsUpdated = true;

        // Resize seats array in the active room
        let existingSeats = liveStream.seats || [];
        let newSeats: any[] = [];
        for (let i = 0; i < maxSeatsNum; i++) {
          const oldSeat = existingSeats.find(s => s.seatIndex === i);
          if (oldSeat) {
            newSeats.push(oldSeat);
          } else {
            newSeats.push({ seatIndex: i, status: 'open', isMuted: false });
          }
        }
        liveStream.seats = newSeats;
      }
    }

    if (data.muteAllSeats !== undefined) {
      roomSetting.muteAllSeats = data.muteAllSeats;
      settingsUpdated = true;
    }

    if (data.roomTheme !== undefined) {
      roomSetting.roomTheme = data.roomTheme && mongoose.Types.ObjectId.isValid(data.roomTheme)
        ? new mongoose.Types.ObjectId(data.roomTheme)
        : undefined;
      settingsUpdated = true;
    }

    if (data.announcement !== undefined) {
      roomSetting.announcement = data.announcement;
      settingsUpdated = true;
    }

    if (settingsUpdated) {
      await roomSetting.save();
    }

    await liveStream.save();

    // Broadcast socket events
    const io = this.getSocketIo();
    if (io) {
      if (data.maxSeats !== undefined) {
        try {
          await liveStream.populate({ path: 'seats.userId', select: '-password -fcmTokens -otp -mobile -email -whatsapp -hostVerificationCode -coinSellerCoins', populate: { path: 'profileImage' } });
          const roomAdmins = await this.getRoomAdmins(liveStream.hostId);
          io.to(`live_${liveStream.channelName}`).emit('seat_updated', {
            channelName: liveStream.channelName,
            seats: liveStream.toObject().seats,
            maxSeats: liveStream.seats ? liveStream.seats.length : 0,
            roomAdmins,
            roomAdmin: roomAdmins
          });
        } catch (e: any) {
          AppLogger.error(`[LiveStreamService: updateLiveStream] Failed to emit seat_updated event: ${e.message}`, e);
        }
      }

      if (settingsUpdated) {
        try {
          const settingsPayload = (roomSetting.toObject ? roomSetting.toObject() : roomSetting) as any;
          settingsPayload.allMute = roomSetting.muteAllSeats;
          io.to(`live_${liveStream.channelName}`).emit('room_settings_updated', settingsPayload);
        } catch (e: any) {
          AppLogger.error(`[LiveStreamService: updateLiveStream] Failed to emit room_settings_updated event: ${e.message}`, e);
        }
      }
    }

    const updatedRoom = await Room.findById(liveStream._id)
      .populate({
        path: 'hostId',
        select: '-password -fcmTokens -otp -mobile -email -whatsapp -hostVerificationCode -coinSellerCoins',
        populate: {
          path: 'profileImage'
        }
      })
      .populate({
        path: 'seats.userId',
        select: '-password -fcmTokens -otp -mobile -email -whatsapp -hostVerificationCode -coinSellerCoins',
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
      .populate({
        path: 'gameId',
        populate: {
          path: 'image'
        }
      });

    // Always emit room_updated for ANY field change so all clients stay in sync
    const io2 = this.getSocketIo();
    if (io2 && updatedRoom) {
      try {
        io2.to(`live_${liveStream.channelName}`).emit('room_updated', updatedRoom);
      } catch (e: any) {
        AppLogger.error(`[LiveStreamService: updateLiveStream] Failed to emit room_updated event: ${e.message}`, e);
      }
    }

    return await this.populateRoomWithDailyRank(updatedRoom, hostId);
  }

  /**
   * Kicks and blocks a user from a room
   */
  public async blockUserFromRoom(hostId: string, channelName: string, userIdToBlock: string) {
    AppLogger.info(`[LiveStreamService: blockUserFromRoom] hostId=${hostId}, channelName=${channelName}, userIdToBlock=${userIdToBlock}`);
    const liveStream = await Room.findOne({ channelName });
    if (!liveStream) {
      throw new Error('Room/livestream not found');
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
      const payload = {
        userId: userIdToBlock,
        channelName,
        message: 'You have been blocked and kicked from this room'
      };
      io.to(`live_${channelName}`).to(`room_${channelName}`).emit('user_blocked', payload);
    }

    return liveStream;
  }

  /**
   * Unblocks a user from a room
   */
  public async unblockUserFromRoom(hostId: string, channelName: string, userIdToUnblock: string) {
    AppLogger.info(`[LiveStreamService: unblockUserFromRoom] hostId=${hostId}, channelName=${channelName}, userIdToUnblock=${userIdToUnblock}`);
    const liveStream = await Room.findOne({ channelName, status: 'live' });
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
    const liveStream = await Room.findOne({ channelName, status: 'live' })
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

    const hostIdStr = liveStream.hostId.toString();
    return liveStream.viewers.map((viewer: any) => {
      const viewerObj = viewer.toObject ? viewer.toObject() : viewer;
      return {
        ...viewerObj,
        isHost: viewerObj._id ? viewerObj._id.toString() === hostIdStr : false
      };
    });
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
  /**
   * Calculates host's daily charm rank position
   */
  public async getHostDailyCharmRank(hostId: string): Promise<number> {
    try {
      const now = new Date();
      const startDate = new Date(now.setHours(0, 0, 0, 0));

      const dailyEarners = await CoinHistory.aggregate([
        {
          $match: {
            type: 'charm_received',
            createdAt: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: '$userId',
            totalAmount: { $sum: { $abs: '$amount' } }
          }
        },
        { $sort: { totalAmount: -1 } }
      ]);

      const activeIndex = dailyEarners.findIndex(earner => earner._id.toString() === hostId.toString());
      if (activeIndex !== -1) {
        return activeIndex + 1;
      }

      const activeUserIds = dailyEarners.map(e => e._id);
      const hostUser = await User.findById(hostId);
      const hostCharmCoins = hostUser ? (hostUser.charmCoins || 0) : 0;

      const fallbackRankCount = await User.countDocuments({
        userRole: 'user',
        _id: { $nin: activeUserIds },
        charmCoins: { $gt: hostCharmCoins }
      });

      return dailyEarners.length + fallbackRankCount + 1;
    } catch (error: any) {
      AppLogger.error(`[LiveStreamService: getHostDailyCharmRank] Error: ${error.message}`);
      return 999;
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
    const liveStream = await Room.findOne(query);
    if (!liveStream) {
      AppLogger.warn(`[LiveStreamService: endLiveStream] No active live stream found for query: ${JSON.stringify(query)}`);
      throw new Error('No active live stream found to end');
    }

    AppLogger.info(`[LiveStreamService: endLiveStream] Found active stream: channelName=${liveStream.channelName}, streamId=${liveStream._id}. Calculating statistics.`);

    // 1. Calculate live duration
    const endedAt = new Date();
    const duration = Math.round((endedAt.getTime() - liveStream.startedAt.getTime()) / 1000);

    // 2. Sum wealthCoins (total spendings) of all current online viewers
    const activeViewers = await User.find({ _id: { $in: liveStream.viewers } }).select('wealthCoins coins');
    const totalSpendingsOfOnlineUsers = activeViewers.reduce((sum, u) => sum + (u.wealthCoins || u.coins || 0), 0);

    // 3. Count unique joined users
    const joinedUsersCount = liveStream.joinedUsers ? liveStream.joinedUsers.length : 0;

    // 4. Calculate public comments count
    const commentCount = liveStream.commentCount || 0;

    // 5. Calculate received gifts and coin collection
    const giftHistories = await CoinHistory.find({ channelName: liveStream.channelName, type: 'charm_received' });
    let receivedGifts = 0;
    let coinCollection = 0;
    for (const history of giftHistories) {
      coinCollection += Math.abs(history.amount);
      const match = history.description ? history.description.match(/x(\d+)/) : null;
      if (match) {
        receivedGifts += parseInt(match[1], 10);
      } else {
        receivedGifts += 1;
      }
    }

    // 6. Calculate increased fans (new followers during livestream)
    const increasedFans = await Follow.countDocuments({
      followingId: liveStream.hostId,
      status: 'accepted',
      createdAt: { $gte: liveStream.startedAt, $lte: endedAt }
    });

    // 7. Calculate daily charm ranking
    const charmRankingDaily = await this.getHostDailyCharmRank(liveStream.hostId.toString());

    const summary = {
      joinedUsers: joinedUsersCount,
      liveDuration: duration,
      receivedGifts,
      publicComments: commentCount,
      increasedFans,
      coinCollection,
      totalSpendingsOfOnlineUsers,
      charmRankingDaily,
      totalGiftRevenue: coinCollection
    };

    AppLogger.info(`[LiveStreamService: endLiveStream] Statistics calculated: ${JSON.stringify(summary)}. Updating status to 'ended'.`);

    liveStream.status = 'ended';
    liveStream.endedAt = endedAt;
    liveStream.viewers = [];
    liveStream.viewerCount = 0;
    await liveStream.save();
    AppLogger.info(`[LiveStreamService: endLiveStream] Saved end status in database.`);

    // Emit live_ended event to notifying all socket clients in the room
    AppLogger.info(`[LiveStreamService: endLiveStream] Fetching socket instance to emit live_ended event`);
    const io = this.getSocketIo();
    if (io) {
      const payload = {
        channelName: liveStream.channelName,
        message: 'Livestream has been ended by the host',
        summary
      };
      AppLogger.info(`[Socket] Emitting live_ended and room_ended events to rooms: live_${liveStream.channelName}, room_${liveStream.channelName}. payload=${JSON.stringify(payload)}`);
      io.to(`live_${liveStream.channelName}`).to(`room_${liveStream.channelName}`).emit('live_ended', payload);
      io.to(`live_${liveStream.channelName}`).to(`room_${liveStream.channelName}`).emit('room_ended', payload);
      AppLogger.info(`[Socket] Successfully emitted events to rooms.`);
    } else {
      AppLogger.error('[Socket] io is null, cannot emit live_ended event');
    }

    AppLogger.info(`[LiveStreamService: endLiveStream] Populating hostId and profileImage for return payload`);
    const populatedStream = await Room.findById(liveStream._id).populate({
      path: 'hostId',
      populate: {
        path: 'profileImage'
      }
    });

    const streamObj = populatedStream ? (populatedStream.toObject ? populatedStream.toObject() : populatedStream) : liveStream;

    return {
      ...streamObj,
      summary
    };
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
    const liveStream = await Room.findOne({ channelName, status: 'live' });
    if (!liveStream) {
      AppLogger.warn(`[LiveStreamService: joinLiveStream] Active livestream not found or has ended. channelName=${channelName}`);
      throw new Error('Live stream not found or has ended');
    }

    if (liveStream.blockedUsers && liveStream.blockedUsers.some(id => id.toString() === userId)) {
      throw new Error('You are blocked and kicked from this room');
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);

    let shouldSave = false;
    if (!liveStream.joinedUsers) {
      liveStream.joinedUsers = [];
    }
    if (!liveStream.joinedUsers.some(id => id.toString() === userId)) {
      liveStream.joinedUsers.push(userObjectId);
      shouldSave = true;
    }

    // Avoid duplicate entries in viewers list
    const isAlreadyWatching = liveStream.viewers.some(id => id.toString() === userId);
    AppLogger.info(`[LiveStreamService: joinLiveStream] Found streamId=${liveStream._id}. Is user already watching? ${isAlreadyWatching}`);

    if (!isAlreadyWatching) {
      AppLogger.info(`[LiveStreamService: joinLiveStream] Adding userId=${userId} to viewers list.`);
      liveStream.viewers.push(userObjectId);
      liveStream.viewerCount = liveStream.viewers.length;
      shouldSave = true;
    }

    if (shouldSave) {
      await liveStream.save();
      AppLogger.info(`[LiveStreamService: joinLiveStream] Saved updated viewers/joinedUsers in DB. New viewerCount=${liveStream.viewerCount}`);
    } else {
      AppLogger.info(`[LiveStreamService: joinLiveStream] No update needed for viewers/joinedUsers list.`);
    }

    if (liveStream.roomType === 'party_room') {
      if (!liveStream.seats) liveStream.seats = [];
      const userAlreadyHasSeat = liveStream.seats.some(seat => seat.userId && seat.userId.toString() === userId);
      if (!userAlreadyHasSeat) {
        const openSeat = liveStream.seats.find(seat => seat.status === 'open');
        if (openSeat) {
          openSeat.userId = userObjectId;
          openSeat.status = 'occupied';
          await liveStream.save();
          AppLogger.info(`[LiveStreamService: joinLiveStream] Auto-assigned userId=${userId} to seatIndex=${openSeat.seatIndex}`);
          const io = this.getSocketIo();
          if (io) {
            await liveStream.populate({ path: 'seats.userId', select: '-password -fcmTokens -otp -mobile -email -whatsapp -hostVerificationCode -coinSellerCoins', populate: { path: 'profileImage' } });
            const roomAdmins = await this.getRoomAdmins(liveStream.hostId);
            io.to(`live_${channelName}`).emit('seat_updated', {
              channelName,
              seats: liveStream.seats,
              roomAdmins,
              roomAdmin: roomAdmins
            });
          }
        }
      }
    }

    AppLogger.info(`[LiveStreamService: joinLiveStream] Populating hostId, profileImage, and theme for return payload`);
    const populatedStream = await Room.findById(liveStream._id)
      .populate({
        path: 'hostId',
        select: '-password -fcmTokens -otp -mobile -email -whatsapp -hostVerificationCode -coinSellerCoins',
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
      .populate({
        path: 'seats.userId',
        select: '-password -fcmTokens -otp -mobile -email -whatsapp -hostVerificationCode -coinSellerCoins',
        populate: {
          path: 'profileImage'
        }
      });

    return await this.populateRoomWithDailyRank(populatedStream || liveStream, userId);
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
    const liveStream = await Room.findOne({ channelName, status: 'live' });
    if (!liveStream) {
      AppLogger.warn(`[LiveStreamService: leaveLiveStream] Active stream not found. Returning null. channelName=${channelName}`);
      return null;
    }

    AppLogger.info(`[LiveStreamService: leaveLiveStream] Found streamId=${liveStream._id}. Removing userId=${userId} from viewers list.`);
    const originalCount = liveStream.viewers.length;
    liveStream.viewers = liveStream.viewers.filter(id => id.toString() !== userId);
    liveStream.viewerCount = liveStream.viewers.length;

    // Remove user from seats if party room
    let seatUpdated = false;
    if (liveStream.seats && liveStream.seats.length > 0) {
      for (const seat of liveStream.seats) {
        if (seat.userId && seat.userId.toString() === userId) {
          seat.userId = undefined;
          seat.status = 'open';
          seatUpdated = true;
        }
      }

      if (seatUpdated) {
        // Emit seat_updated event to the room
        const io = this.getSocketIo();
        if (io) {
          await liveStream.populate({ path: 'seats.userId', select: '-password -fcmTokens -otp -mobile -email -whatsapp -hostVerificationCode -coinSellerCoins', populate: { path: 'profileImage' } });
          const roomAdmins = await this.getRoomAdmins(liveStream.hostId);
          io.to(`live_${channelName}`).emit('seat_updated', {
            channelName,
            seats: liveStream.seats,
            roomAdmins,
            roomAdmin: roomAdmins
          });
        }
      }
    }

    AppLogger.info(`[LiveStreamService: leaveLiveStream] Before filter count=${originalCount}, after filter count=${liveStream.viewerCount}`);
    await liveStream.save();
    AppLogger.info(`[LiveStreamService: leaveLiveStream] Saved updated viewer list in DB.`);

    AppLogger.info(`[LiveStreamService: leaveLiveStream] Populating hostId, profileImage, and theme for return payload`);
    const populatedStream = await Room.findById(liveStream._id)
      .populate({
        path: 'hostId',
        select: '-password -fcmTokens -otp -mobile -email -whatsapp -hostVerificationCode -coinSellerCoins',
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

    return await this.populateRoomWithDailyRank(populatedStream || liveStream, userId);
  }

  /**
   * User joins a seat in a party room
   */
  public async joinSeat(userId: string, channelName: string, seatIndex: number) {
    AppLogger.info(`[LiveStreamService: joinSeat] Entered. userId=${userId}, channelName=${channelName}, seatIndex=${seatIndex}`);
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error('Invalid user ID');
    }

    const liveStream = await Room.findOne({ channelName, status: 'live' });
    if (!liveStream) {
      throw new Error('Active room/party room not found');
    }

    if (liveStream.roomType !== 'party_room') {
      throw new Error('This room is not a party room');
    }

    if (liveStream.blockedUsers && liveStream.blockedUsers.some(id => id.toString() === userId)) {
      throw new Error('You are blocked from this room');
    }

    if (!liveStream.seats) {
      liveStream.seats = [];
    }

    // Check if the seat is already occupied
    const targetSeat = liveStream.seats.find(seat => seat.seatIndex === seatIndex);
    if (!targetSeat) {
      throw new Error(`Seat ${seatIndex} not found`);
    }
    if (targetSeat.status !== 'open') {
      throw new Error(`Seat ${seatIndex} is not open`);
    }

    // If the user is already on another seat, remove them from that seat first
    const oldSeat = liveStream.seats.find(seat => seat.userId && seat.userId.toString() === userId);
    if (oldSeat) {
      oldSeat.userId = undefined;
      oldSeat.status = 'open';
    }

    // Add user to the new seat
    targetSeat.userId = new mongoose.Types.ObjectId(userId);
    targetSeat.status = 'occupied';

    await liveStream.save();

    // Emit socket event
    const io = this.getSocketIo();
    if (io) {
      await liveStream.populate({ path: 'seats.userId', select: '-password -fcmTokens -otp -mobile -email -whatsapp -hostVerificationCode -coinSellerCoins', populate: { path: 'profileImage' } });
      const roomAdmins = await this.getRoomAdmins(liveStream.hostId);
      const payload = {
        channelName,
        seats: liveStream.seats,
        roomAdmins,
        roomAdmin: roomAdmins
      };
      AppLogger.info(`[Socket] Emitting seat_updated to live_${channelName}. payload=${JSON.stringify(payload)}`);
      io.to(`live_${channelName}`).emit('seat_updated', payload);
    }

    return liveStream;
  }

  /**
   * User leaves a seat in a party room
   */
  public async leaveSeat(userId: string, channelName: string) {
    AppLogger.info(`[LiveStreamService: leaveSeat] Entered. userId=${userId}, channelName=${channelName}`);
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error('Invalid user ID');
    }

    const liveStream = await Room.findOne({ channelName, status: 'live' });
    if (!liveStream) {
      throw new Error('Active room/party room not found');
    }

    if (!liveStream.seats) {
      liveStream.seats = [];
    }

    // Remove user from seats
    let seatUpdated = false;
    const targetSeat = liveStream.seats.find(seat => seat.userId && seat.userId.toString() === userId);
    if (targetSeat) {
      targetSeat.userId = undefined;
      targetSeat.status = 'open';
      seatUpdated = true;
    }

    if (seatUpdated) {
      await liveStream.save();

      // Emit socket event
      const io = this.getSocketIo();
      if (io) {
        await liveStream.populate({ path: 'seats.userId', select: '-password -fcmTokens -otp -mobile -email -whatsapp -hostVerificationCode -coinSellerCoins', populate: { path: 'profileImage' } });
        const roomAdmins = await this.getRoomAdmins(liveStream.hostId);
        const payload = {
          channelName,
          seats: liveStream.seats,
          roomAdmins,
          roomAdmin: roomAdmins
        };
        AppLogger.info(`[Socket] Emitting seat_updated to live_${channelName}. payload=${JSON.stringify(payload)}`);
        io.to(`live_${channelName}`).emit('seat_updated', payload);
      }
    }

    return liveStream;
  }

  /**
   * Gets list of all active live streams
   */
  public async getActiveLiveStreams(page: number = 1, limit: number = 10, userId?: string) {
    AppLogger.info(`[LiveStreamService: getActiveLiveStreams] Entered. page=${page}, limit=${limit}, userId=${userId}`);

    let query: any = { status: 'live' };

    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      const followedRoomDocs = await RoomFollow.find({ userId: new mongoose.Types.ObjectId(userId) });
      const followedRoomIds = followedRoomDocs.map(doc => doc.roomId);

      query = {
        status: 'live'
      };

      // If we need to prioritize followed rooms, that should be done in sorting, 
      // but for now we just ensure only 'live' status rooms are returned.
    }

    AppLogger.info(`[LiveStreamService: getActiveLiveStreams] Querying active streams...`);
    const streams = await Room.find(query)
      .populate({
        path: 'hostId',
        select: '-password -fcmTokens -otp -mobile -email -whatsapp -hostVerificationCode -coinSellerCoins',
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

    const total = await Room.countDocuments(query);
    AppLogger.info(`[LiveStreamService: getActiveLiveStreams] Successfully retrieved. Found=${streams.length}, Total=${total}`);

    const mappedStreams = await Promise.all(
      streams.map(async (stream: any) => {
        const streamObj = await this.populateRoomWithDailyRank(stream, userId);
        const hostIdStr = streamObj.hostId && (streamObj.hostId._id ? streamObj.hostId._id.toString() : streamObj.hostId.toString());
        const isMine = userId && hostIdStr ? (hostIdStr === userId.toString() || !!streamObj.isFollowingRoom) : false;
        return {
          ...streamObj,
          isMine
        };
      })
    );

    return {
      streams: mappedStreams,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Retrieves the active room for a given host user
   */
  public async getActiveRoomForHost(hostId: string) {
    if (!mongoose.Types.ObjectId.isValid(hostId)) {
      throw new Error('Invalid host ID');
    }
    let activeStream = await Room.findOne({ hostId: new mongoose.Types.ObjectId(hostId), status: 'live' })
      .populate({
        path: 'hostId',
        populate: { path: 'profileImage' }
      })
      .populate({
        path: 'roomTheme',
        populate: { path: 'media' }
      });

    if (!activeStream) {
      activeStream = await Room.findOne({ hostId: new mongoose.Types.ObjectId(hostId) })
        .sort({ createdAt: -1 })
        .populate({
          path: 'hostId',
          select: '-password -fcmTokens -otp -mobile -email -whatsapp -hostVerificationCode -coinSellerCoins',
          populate: { path: 'profileImage' }
        })
        .populate({
          path: 'roomTheme',
          populate: { path: 'media' }
        });
    }
    return await this.populateRoomWithDailyRank(activeStream, hostId);
  }

  /**
   * Retrieves details of a room by its channelName
   */
  public async getRoomDetails(channelName: string, currentUserId?: string) {
    const liveStream = await Room.findOne({ channelName })
      .populate({
        path: 'hostId',
        select: '-password -fcmTokens -otp -mobile -email -whatsapp -hostVerificationCode -coinSellerCoins',
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
    if (!liveStream) {
      throw new Error('Room not found');
    }
    return await this.populateRoomWithDailyRank(liveStream, currentUserId);
  }

  /**
   * Gets list of all ended rooms (history)
   */
  public async getRoomHistory(hostId?: string, page: number = 1, limit: number = 10) {
    AppLogger.info(`[LiveStreamService: getRoomHistory] Entered. hostId=${hostId}, page=${page}, limit=${limit}`);
    const query: any = { status: 'ended' };
    if (hostId && mongoose.Types.ObjectId.isValid(hostId)) {
      query.hostId = new mongoose.Types.ObjectId(hostId);
    }

    AppLogger.info(`[LiveStreamService: getRoomHistory] Querying ended streams...`);
    const streams = await Room.find(query)
      .populate({
        path: 'hostId',
        select: '-password -fcmTokens -otp -mobile -email -whatsapp -hostVerificationCode -coinSellerCoins',
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
      .sort({ endedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Room.countDocuments(query);
    AppLogger.info(`[LiveStreamService: getRoomHistory] Successfully retrieved. Found=${streams.length}, Total=${total}`);

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

  /**
   * Helper to populate room host with their daily charm ranking, followers count, and follow status
   */
  public async populateRoomWithDailyRank(room: any, currentUserId?: string) {
    if (!room) return room;
    const roomObj = room.toObject ? room.toObject() : room;
    if (roomObj.hostId) {
      const hostIdStr = roomObj.hostId._id ? roomObj.hostId._id.toString() : roomObj.hostId.toString();
      const dailyRank = await this.getHostDailyCharmRank(hostIdStr);
      const followersCount = await Follow.countDocuments({ followingId: hostIdStr, status: 'accepted' });
      const isFollowing = currentUserId
        ? !!(await Follow.findOne({ followerId: currentUserId, followingId: hostIdStr, status: 'accepted' }))
        : false;

      if (roomObj.hostId.toObject) {
        roomObj.hostId = roomObj.hostId.toObject();
      }
      roomObj.hostId.charmRankingDaily = dailyRank;
      roomObj.hostId.followersCount = followersCount;
      roomObj.hostId.isFollowing = isFollowing;
    }

    // Populate Room Follow details
    const isFollowingRoom = currentUserId && roomObj._id
      ? !!(await RoomFollow.exists({ userId: new mongoose.Types.ObjectId(currentUserId), roomId: roomObj._id }))
      : false;

    roomObj.isFollowingRoom = isFollowingRoom;
    roomObj.roomFollowerCount = roomObj.roomFollowerCount || 0;
    roomObj.totalMember = roomObj.roomFollowerCount || 0;

    return roomObj;
  }

  // ==========================================
  // New Seat Management Methods (Taka App Flow)
  // ==========================================

  public async getRoomSettings(hostId: string) {
    AppLogger.info(`[LiveStreamService: getRoomSettings] hostId=${hostId}`);
    let roomSetting = await RoomSetting.findOne({ hostId });
    if (!roomSetting) {
      roomSetting = await RoomSetting.create({ hostId });
    }
    return roomSetting;
  }

  public async updateRoomSettings(hostId: string, data: { maxSeats?: number; admins?: string[]; roomTheme?: string; announcement?: string; muteAllSeats?: boolean; gameId?: string }) {
    AppLogger.info(`[LiveStreamService: updateRoomSettings] hostId=${hostId}`);
    let roomSetting = await RoomSetting.findOne({ hostId });
    if (!roomSetting) {
      roomSetting = await RoomSetting.create({ hostId });
    }

    if (data.maxSeats !== undefined) roomSetting.maxSeats = data.maxSeats;
    if (data.admins !== undefined) roomSetting.admins = data.admins.map(id => new mongoose.Types.ObjectId(id));
    if (data.roomTheme !== undefined) roomSetting.roomTheme = new mongoose.Types.ObjectId(data.roomTheme);
    if (data.announcement !== undefined) roomSetting.announcement = data.announcement;
    if (data.muteAllSeats !== undefined) roomSetting.muteAllSeats = data.muteAllSeats;
    if (data.gameId !== undefined) roomSetting.gameId = new mongoose.Types.ObjectId(data.gameId);

    await roomSetting.save();

    // If there is an active room, notify users of setting changes
    const activeStream = await Room.findOne({ hostId, status: 'live' });
    if (activeStream) {
      if (data.muteAllSeats !== undefined) {
        activeStream.muteAllSeats = data.muteAllSeats;
        if (activeStream.seats) {
          for (const seat of activeStream.seats) {
            if (seat.status === 'occupied') {
              seat.isMuted = data.muteAllSeats;
            } else {
              seat.isMuted = false;
            }
          }
        }
        await activeStream.save();
      }
      if (data.gameId !== undefined) {
        activeStream.gameId = new mongoose.Types.ObjectId(data.gameId);
        await activeStream.save();
      }

      const io = this.getSocketIo();
      if (io) {
        const settingsPayload = (roomSetting.toObject ? roomSetting.toObject() : roomSetting) as any;
        settingsPayload.allMute = roomSetting.muteAllSeats;
        io.to(`live_${activeStream.channelName}`).emit('room_settings_updated', settingsPayload);

        if (data.muteAllSeats !== undefined) {
          await activeStream.populate({ path: 'seats.userId', select: '-password -fcmTokens -otp -mobile -email -whatsapp -hostVerificationCode -coinSellerCoins', populate: { path: 'profileImage' } });
          const roomAdmins = await this.getRoomAdmins(activeStream.hostId);
          io.to(`live_${activeStream.channelName}`).emit('seat_updated', {
            channelName: activeStream.channelName,
            seats: activeStream.toObject().seats,
            roomAdmins,
            roomAdmin: roomAdmins
          });
          io.to(`live_${activeStream.channelName}`).emit(data.muteAllSeats ? 'all_seats_muted' : 'all_seats_unmuted', { channelName: activeStream.channelName });
        }
      }
    }

    const finalObj = (roomSetting.toObject ? roomSetting.toObject() : roomSetting) as any;
    finalObj.allMute = roomSetting.muteAllSeats;
    return finalObj;
  }

  public async changeSeat(userId: string, channelName: string, newSeatIndex: number) {
    AppLogger.info(`[LiveStreamService: changeSeat] userId=${userId}, channelName=${channelName}, newSeatIndex=${newSeatIndex}`);
    const liveStream = await Room.findOne({ channelName, status: 'live' });
    if (!liveStream || !liveStream.seats) throw new Error('Active room not found');

    const targetSeat = liveStream.seats.find(s => s.seatIndex === newSeatIndex);
    if (!targetSeat) throw new Error('Seat index not found');
    if (targetSeat.status !== 'open') throw new Error('Seat is not open');

    // Remove user from old seat
    const oldSeat = liveStream.seats.find(s => s.userId && s.userId.toString() === userId);
    if (oldSeat) {
      oldSeat.userId = undefined;
      oldSeat.status = 'open';
    }

    // Assign to new seat
    targetSeat.userId = new mongoose.Types.ObjectId(userId);
    targetSeat.status = 'occupied';

    await liveStream.save();
    const io = this.getSocketIo();
    await liveStream.populate({ path: 'seats.userId', select: '-password -fcmTokens -otp -mobile -email -whatsapp -hostVerificationCode -coinSellerCoins', populate: { path: 'profileImage' } });
    const roomAdmins = await this.getRoomAdmins(liveStream.hostId);
    if (io) {
      io.to(`live_${channelName}`).emit('seat_updated', {
        channelName,
        seats: liveStream.toObject().seats,
        roomAdmins,
        roomAdmin: roomAdmins
      });
    }

    return liveStream;
  }

  public async lockSeat(requesterId: string, channelName: string, seatIndex: number, lock: boolean) {
    const liveStream = await Room.findOne({ channelName, status: 'live' });
    if (!liveStream || !liveStream.seats) throw new Error('Active room not found');

    await this.verifyAdmin(requesterId, liveStream.hostId.toString());

    const seat = liveStream.seats.find(s => s.seatIndex === seatIndex);
    if (!seat) throw new Error('Seat index not found');

    if (lock) {
      if (seat.userId) throw new Error('Cannot lock an occupied seat. Remove user first.');
      seat.status = 'locked';
    } else {
      seat.status = 'open';
    }

    await liveStream.save();
    const io = this.getSocketIo();
    if (io) {
      await liveStream.populate({ path: 'seats.userId', select: '-password -fcmTokens -otp -mobile -email -whatsapp -hostVerificationCode -coinSellerCoins', populate: { path: 'profileImage' } });
      const roomAdmins = await this.getRoomAdmins(liveStream.hostId);
      io.to(`live_${channelName}`).emit('seat_updated', {
        channelName,
        seats: liveStream.toObject().seats,
        roomAdmins,
        roomAdmin: roomAdmins
      });
    }

    return liveStream;
  }

  public async muteSeat(requesterId: string, channelName: string, seatIndex: number, mute: boolean) {
    const liveStream = await Room.findOne({ channelName, status: 'live' });
    if (!liveStream || !liveStream.seats) throw new Error('Active room not found');

    await this.verifyAdmin(requesterId, liveStream.hostId.toString());

    const seat = liveStream.seats.find(s => s.seatIndex === seatIndex);
    if (!seat) throw new Error('Seat index not found');

    seat.isMuted = mute;

    await liveStream.save();

    const io = this.getSocketIo();
    if (io) {
      await liveStream.populate({ path: 'seats.userId', select: '-password -fcmTokens -otp -mobile -email -whatsapp -hostVerificationCode -coinSellerCoins', populate: { path: 'profileImage' } });

      const userObj = seat.userId ? (seat.userId as any) : null;
      const userIdStr = userObj ? (userObj._id ? userObj._id.toString() : userObj.toString()) : null;

      const roomAdmins = await this.getRoomAdmins(liveStream.hostId);
      io.to(`live_${channelName}`).emit('seat_updated', {
        channelName,
        seats: liveStream.toObject().seats,
        roomAdmins,
        roomAdmin: roomAdmins
      });
      if (userIdStr) {
        io.to(`live_${channelName}`).emit(mute ? 'seat_muted' : 'seat_unmuted', { seatIndex, userId: userIdStr, user: userObj });
      }

      // Calculate allMute and emit room_settings_updated
      const occupiedSeats = liveStream.seats.filter(s => s.status === 'occupied');
      const areAllMuted = occupiedSeats.length > 0 && occupiedSeats.every(s => s.isMuted);

      if (liveStream.muteAllSeats !== areAllMuted) {
        liveStream.muteAllSeats = areAllMuted;
        await liveStream.save();

        let roomSetting = await RoomSetting.findOne({ hostId: liveStream.hostId });
        if (roomSetting) {
          roomSetting.muteAllSeats = areAllMuted;
          await roomSetting.save();

          const settingsPayload = (roomSetting.toObject ? roomSetting.toObject() : roomSetting) as any;
          settingsPayload.allMute = areAllMuted;
          io.to(`live_${channelName}`).emit('room_settings_updated', settingsPayload);
        }
      }
    }

    return liveStream;
  }

  public async muteAllSeats(requesterId: string, channelName: string, mute: boolean) {
    const liveStream = await Room.findOne({ channelName, status: 'live' });
    if (!liveStream) throw new Error('Active room not found');

    await this.verifyAdmin(requesterId, liveStream.hostId.toString());

    liveStream.muteAllSeats = mute;

    // Update isMuted flag on every seat (same as single muteSeat)
    if (liveStream.seats) {
      for (const seat of liveStream.seats) {
        if (seat.status === 'occupied') {
          seat.isMuted = mute;
        } else {
          seat.isMuted = false;
        }
      }
    }

    await liveStream.save();

    const io = this.getSocketIo();
    if (io) {
      await liveStream.populate({ path: 'seats.userId', select: '-password -fcmTokens -otp -mobile -email -whatsapp -hostVerificationCode -coinSellerCoins', populate: { path: 'profileImage' } });

      const roomAdmins = await this.getRoomAdmins(liveStream.hostId);

      // Emit seat_updated with populated seats (same as muteSeat does)
      io.to(`live_${channelName}`).emit('seat_updated', {
        channelName,
        seats: liveStream.toObject().seats,
        roomAdmins,
        roomAdmin: roomAdmins
      });

      // Emit all_seats_muted/unmuted event for UI
      io.to(`live_${channelName}`).emit(mute ? 'all_seats_muted' : 'all_seats_unmuted', { channelName });

      // Emit room_updated so clients get the new muteAllSeats boolean
      io.to(`live_${channelName}`).emit('room_updated', liveStream);
    }

    return liveStream;
  }

  public async kickUser(requesterId: string, channelName: string, userIdToKick: string) {
    const liveStream = await Room.findOne({ channelName, status: 'live' });
    if (!liveStream) throw new Error('Active room not found');

    await this.verifyAdmin(requesterId, liveStream.hostId.toString());

    // Remove from seat if they are on one
    if (liveStream.seats) {
      const seat = liveStream.seats.find(s => s.userId && s.userId.toString() === userIdToKick);
      if (seat) {
        seat.userId = undefined;
        seat.status = 'open';
      }
    }

    // Remove from viewers
    liveStream.viewers = liveStream.viewers.filter(uid => uid.toString() !== userIdToKick);
    liveStream.viewerCount = liveStream.viewers.length;

    await liveStream.save();

    const io = this.getSocketIo();
    if (io) {
      await liveStream.populate({ path: 'seats.userId', select: '-password -fcmTokens -otp -mobile -email -whatsapp -hostVerificationCode -coinSellerCoins', populate: { path: 'profileImage' } });
      const user = await User.findById(userIdToKick).select('-password -fcmTokens -otp -mobile -email -whatsapp -hostVerificationCode -coinSellerCoins').populate('profileImage');
      const roomAdmins = await this.getRoomAdmins(liveStream.hostId);
      io.to(`live_${channelName}`).emit('seat_updated', {
        channelName,
        seats: liveStream.toObject().seats,
        roomAdmins,
        roomAdmin: roomAdmins
      });
      io.to(`live_${channelName}`).emit('user_kicked', { userId: userIdToKick, channelName, user });
    }

    return liveStream;
  }

  public async inviteToSeat(requesterId: string, channelName: string, targetUserId: string, seatIndex: number) {
    const liveStream = await Room.findOne({ channelName, status: 'live' });
    if (!liveStream) throw new Error('Active room not found');

    await this.verifyAdmin(requesterId, liveStream.hostId.toString());

    const io = this.getSocketIo();
    if (io) {
      const user = await User.findById(targetUserId).select('-password -fcmTokens -otp -mobile -email -whatsapp -hostVerificationCode -coinSellerCoins').populate('profileImage');
      io.to(`live_${channelName}`).emit('user_invited_to_seat', { targetUserId, seatIndex, channelName, user });
    }
    return { success: true };
  }

  public async makeAdmin(requesterId: string, channelName: string, targetUserId: string, isAdmin: boolean) {
    // 1. Find the live room by channelName
    const activeStream = await Room.findOne({ channelName, status: 'live' });
    if (!activeStream) throw new Error('No active room found for this channel');

    const hostId = activeStream.hostId.toString();

    // 2. Verify the requester is the Host (only Host can promote/demote admins)
    if (requesterId !== hostId) {
      throw new Error('Unauthorized. Only the Host can make or remove admins');
    }

    // 3. Find or create RoomSetting for this host
    let roomSetting = await RoomSetting.findOne({ hostId });
    if (!roomSetting) roomSetting = await RoomSetting.create({ hostId });

    const targetObjId = new mongoose.Types.ObjectId(targetUserId);
    const isAdminNow = roomSetting.admins.some(id => id.toString() === targetUserId);

    if (isAdmin && !isAdminNow) {
      roomSetting.admins.push(targetObjId);
    } else if (!isAdmin && isAdminNow) {
      roomSetting.admins = roomSetting.admins.filter(id => id.toString() !== targetUserId);
    }

    await roomSetting.save();

    // 4. Broadcast to the correct room
    const io = this.getSocketIo();
    if (io) {
      const user = await User.findById(targetUserId).select('-password -fcmTokens -otp -mobile -email -whatsapp -hostVerificationCode -coinSellerCoins').populate('profileImage');
      io.to(`live_${channelName}`).emit('user_made_admin', { targetUserId, isAdmin, channelName, user });
    }

    return roomSetting;
  }

  private async verifyAdmin(requesterId: string, hostId: string) {
    if (requesterId === hostId) return true; // Host is always admin

    const roomSetting = await RoomSetting.findOne({ hostId });
    if (roomSetting && roomSetting.admins.some(id => id.toString() === requesterId)) {
      return true;
    }

    const requestor = await User.findById(requesterId);
    if (requestor && requestor.userRole === 'admin') return true; // Super admin

    throw new Error('Unauthorized. Only the host or room admin can perform this action.');
  }

  private async getRoomAdmins(hostId: any) {
    const roomSetting = await RoomSetting.findOne({ hostId }).populate({
      path: 'admins',
      select: '-password -fcmTokens -otp -mobile -email -whatsapp -hostVerificationCode -coinSellerCoins',
      populate: { path: 'profileImage' }
    });
    return roomSetting ? roomSetting.admins : [];
  }
}
