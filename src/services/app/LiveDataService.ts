import { Service, Inject } from 'typedi';
import mongoose from 'mongoose';
import User from '../../models/User';
import Call from '../../models/Call';
import CoinHistory from '../../models/CoinHistory';
import Follow from '../../models/Follow';
import LiveDataLog from '../../models/LiveDataLog';
import Room from '../../models/Room';
import { AppSettingService } from '../common/AppSettingService';

@Service()
export class LiveDataService {
  constructor(@Inject() private appSettingService: AppSettingService) {}

  public localDateStr(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  public parseDateRange(queryDate?: string, type: 'daily' | 'monthly' = 'daily') {
    const now = new Date();
    let dateStr: string;
    let monthStr: string;
    let startDate: Date;
    let endDate: Date;

    const cleanDate = (queryDate || '').trim();

    if (type === 'monthly') {
      if (/^\d{4}-\d{2}/.test(cleanDate)) {
        monthStr = cleanDate.substring(0, 7);
      } else {
        monthStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
      }
      dateStr = `${monthStr}-01`;

      const [year, month] = monthStr.split('-').map(Number);
      startDate = new Date(year, month - 1, 1, 0, 0, 0, 0);
      endDate = new Date(year, month, 0, 23, 59, 59, 999);
    } else {
      if (/^\d{4}-\d{2}-\d{2}/.test(cleanDate)) {
        dateStr = cleanDate.substring(0, 10);
      } else {
        dateStr = this.localDateStr(now);
      }
      monthStr = dateStr.substring(0, 7);

      const [year, month, day] = dateStr.split('-').map(Number);
      startDate = new Date(year, month - 1, day, 0, 0, 0, 0);
      endDate = new Date(year, month - 1, day, 23, 59, 59, 999);
    }

    return { dateStr, monthStr, startDate, endDate, type };
  }

  private formatSecondsToHHMMSS(totalSeconds: number): string {
    const secs = Math.max(0, Math.floor(totalSeconds || 0));
    const hours = Math.floor(secs / 3600);
    const minutes = Math.floor((secs % 3600) / 60);
    const remainingSecs = secs % 60;

    const pad = (num: number) => num.toString().padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(remainingSecs)}`;
  }

  private secondsToEHours(totalSeconds: number): number {
    return Math.round((Math.max(0, totalSeconds || 0) / 3600) * 100) / 100;
  }

  private clipDurationSeconds(startedAt: Date, endedAt: Date | undefined, startDate: Date, endDate: Date): number {
    const sessionStart = startedAt.getTime();
    const sessionEnd = (endedAt || new Date()).getTime();
    const rangeStart = startDate.getTime();
    const rangeEnd = endDate.getTime();
    const clippedStart = Math.max(sessionStart, rangeStart);
    const clippedEnd = Math.min(sessionEnd, rangeEnd);
    return Math.max(0, Math.round((clippedEnd - clippedStart) / 1000));
  }

  private uniqueIdStrings(ids: Array<mongoose.Types.ObjectId | string | undefined | null>): string[] {
    const set = new Set<string>();
    ids.forEach(id => {
      if (id) set.add(id.toString());
    });
    return Array.from(set);
  }

  private normalizeContextType(contextType?: string): string {
    return (contextType || '').toString().trim().toLowerCase().replace(/[\s-]+/g, '_');
  }

  private resolveGiftContext(
    history: { type?: string; contextType?: string; channelName?: string; description?: string; createdAt?: Date },
    roomsByChannel: Map<string, 'livestream' | 'party_room'>,
    userPartyRoomDates?: { start: number; end: number }[],
    userLiveStreamDates?: { start: number; end: number }[]
  ): 'livestream' | 'party_room' | 'call' | undefined {
    if (history.type === 'call_income') {
      return 'call';
    }

    const contextType = this.normalizeContextType(history.contextType);
    if (
      contextType === 'live_stream' ||
      contextType === 'livestream' ||
      contextType === 'live' ||
      contextType === 'live_streaming' ||
      contextType === 'video_stream'
    ) {
      return 'livestream';
    }
    if (
      contextType === 'party_room' ||
      contextType === 'party' ||
      contextType === 'partyroom' ||
      contextType === 'audio_room'
    ) {
      return 'party_room';
    }
    if (
      contextType === 'audio_call' ||
      contextType === 'video_call' ||
      contextType === 'voice_call' ||
      contextType === 'voice' ||
      contextType === 'video' ||
      contextType === 'call'
    ) {
      return 'call';
    }

    const channelName = (history.channelName || '').toString().trim();
    if (channelName) {
      const directMatch = roomsByChannel.get(channelName) || roomsByChannel.get(channelName.toLowerCase());
      if (directMatch) {
        return directMatch;
      }
      if (/party/i.test(channelName)) {
        return 'party_room';
      }
      if (/live|stream/i.test(channelName)) {
        return 'livestream';
      }
      if (/call/i.test(channelName)) {
        return 'call';
      }
    }

    const description = history.description || '';
    if (/during live_stream|during live stream|during livestream|during live\b|in live stream/i.test(description)) {
      return 'livestream';
    }
    if (/during party_room|during party room|during party\b|in party room/i.test(description)) {
      return 'party_room';
    }
    if (/during audio_call|during video_call|during voice_call|during voice call|during video call|during call/i.test(description)) {
      return 'call';
    }

    // Timestamp-based heuristic fallback if user hosted rooms during createdAt
    if (history.createdAt) {
      const t = new Date(history.createdAt).getTime();
      if (userPartyRoomDates && userPartyRoomDates.some(range => t >= range.start - 60000 && t <= range.end + 60000)) {
        return 'party_room';
      }
      if (userLiveStreamDates && userLiveStreamDates.some(range => t >= range.start - 60000 && t <= range.end + 60000)) {
        return 'livestream';
      }
    }

    // If still unresolved but user has party room history, fallback to party_room or livestream
    if (userPartyRoomDates && userPartyRoomDates.length > 0 && (!userLiveStreamDates || userLiveStreamDates.length === 0)) {
      return 'party_room';
    }
    if (userLiveStreamDates && userLiveStreamDates.length > 0 && (!userPartyRoomDates || userPartyRoomDates.length === 0)) {
      return 'livestream';
    }

    // Default general gift income to livestream if received by host
    return 'livestream';
  }

  public async recordMicTime(hostUserId: string, micUserId: string, seconds: number, at: Date = new Date()) {
    if (!mongoose.Types.ObjectId.isValid(hostUserId) || seconds <= 0) {
      return;
    }

    const dateStr = this.localDateStr(at);
    const monthStr = dateStr.substring(0, 7);
    const update: any = {
      $set: { month: monthStr },
      $inc: { totalMicSeconds: Math.floor(seconds) }
    };

    if (mongoose.Types.ObjectId.isValid(micUserId)) {
      update.$addToSet = { micUserIds: new mongoose.Types.ObjectId(micUserId) };
    }

    await LiveDataLog.findOneAndUpdate(
      { userId: new mongoose.Types.ObjectId(hostUserId), date: dateStr },
      update,
      { upsert: true }
    );
  }

  public async recordEndedSession(params: {
    hostUserId: string;
    roomType: 'livestream' | 'party_room';
    durationSeconds: number;
    joinedUserIds: string[];
    micSessions?: { userId: string; seconds: number }[];
    endedAt?: Date;
  }) {
    if (!mongoose.Types.ObjectId.isValid(params.hostUserId)) {
      return;
    }

    const at = params.endedAt || new Date();
    const dateStr = this.localDateStr(at);
    const monthStr = dateStr.substring(0, 7);
    const hostId = params.hostUserId;
    const durationSeconds = Math.max(0, Math.floor(params.durationSeconds || 0));
    const audienceIds = this.uniqueIdStrings(params.joinedUserIds).filter(id => id !== hostId);
    const micSessions = params.micSessions || [];
    const extraMicSeconds = micSessions.reduce((sum, session) => sum + Math.max(0, Math.floor(session.seconds || 0)), 0);
    const micUserIds = this.uniqueIdStrings(micSessions.map(session => session.userId));

    const inc: Record<string, number> = {};
    const addToSet: Record<string, any> = {};

    if (params.roomType === 'party_room') {
      inc.roomOwnerSeconds = durationSeconds;
      if (extraMicSeconds > 0) {
        inc.totalMicSeconds = extraMicSeconds;
      }
      if (audienceIds.length) {
        addToSet.audienceUserIds = { $each: audienceIds.map(id => new mongoose.Types.ObjectId(id)) };
      }
      if (micUserIds.length) {
        addToSet.micUserIds = { $each: micUserIds.map(id => new mongoose.Types.ObjectId(id)) };
      }
    } else {
      inc.liveDurationSeconds = durationSeconds;
      inc.liveViewers = audienceIds.length;
      if (audienceIds.length) {
        addToSet.audienceUserIds = { $each: audienceIds.map(id => new mongoose.Types.ObjectId(id)) };
      }
    }

    const update: any = { $set: { month: monthStr } };
    if (Object.keys(inc).length) update.$inc = inc;
    if (Object.keys(addToSet).length) update.$addToSet = addToSet;

    await LiveDataLog.findOneAndUpdate(
      { userId: new mongoose.Types.ObjectId(hostId), date: dateStr },
      update,
      { upsert: true }
    );
  }

  public async getLiveData(
    userId: string,
    queryDate?: string,
    type: 'daily' | 'monthly' = 'daily'
  ) {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const user = await User.findById(userObjectId)
      .select('name profileImage isVerified userId gender')
      .populate('profileImage');

    if (!user) {
      throw new Error('User not found');
    }

    const { dateStr, monthStr, startDate, endDate } = this.parseDateRange(queryDate, type);
    const now = new Date();

    const logs = type === 'monthly'
      ? await LiveDataLog.find({ userId: userObjectId, month: monthStr })
      : await LiveDataLog.find({ userId: userObjectId, date: dateStr });

    const dataLog = logs[0];
    const isHost = user.gender === 'Female';
    const accountRole: 'host' | 'caller' = isHost ? 'host' : 'caller';
    const callDateRange = {
      $or: [
        { endedAt: { $gte: startDate, $lte: endDate } },
        { endedAt: { $exists: false }, createdAt: { $gte: startDate, $lte: endDate } }
      ]
    };

    const callAgg = await Call.aggregate([
      {
        $match: {
          ...(isHost ? { receiverId: userObjectId } : { callerId: userObjectId }),
          status: 'ended',
          ...callDateRange
        }
      },
      {
        $group: {
          _id: null,
          totalCalls: { $sum: 1 },
          totalDuration: { $sum: '$duration' },
          coinsSpent: { $sum: '$coinsDeducted' },
          voiceIncome: {
            $sum: {
              $cond: [{ $eq: ['$callType', 'voice'] }, '$coinsEarned', 0]
            }
          },
          videoIncome: {
            $sum: {
              $cond: [{ $eq: ['$callType', 'video'] }, '$coinsEarned', 0]
            }
          },
          counterparts: { $push: isHost ? '$callerId' : '$receiverId' }
        }
      }
    ]);

    const callIncomeAgg = isHost
      ? await CoinHistory.aggregate([
          {
            $match: {
              userId: userObjectId,
              type: 'call_income',
              createdAt: { $gte: startDate, $lte: endDate }
            }
          },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ])
      : [];

    const callStats = callAgg[0] || {
      totalCalls: 0,
      totalDuration: 0,
      coinsSpent: 0,
      voiceIncome: 0,
      videoIncome: 0,
      counterparts: []
    };

    const counterpartIds = (callStats.counterparts || [])
      .map((id: any) => id?.toString())
      .filter((id: string) => id && id !== userId);
    const uniqueCounterparts = new Set<string>(counterpartIds).size;

    const counterpartFrequency: { [key: string]: number } = {};
    counterpartIds.forEach((id: string) => {
      counterpartFrequency[id] = (counterpartFrequency[id] || 0) + 1;
    });
    const repeatUsersCount = isHost
      ? Object.values(counterpartFrequency).filter(count => count > 1).length
      : 0;

    const newFansCount = await Follow.countDocuments({
      followingId: userObjectId,
      status: 'accepted',
      createdAt: { $gte: startDate, $lte: endDate }
    });

    // 1. Fetch hosted rooms to get timing ranges and fallback metrics
    const hostedRooms = await Room.find({
      hostId: userObjectId,
      $or: [
        { startedAt: { $lte: endDate, $gte: startDate } },
        { startedAt: { $lte: endDate }, endedAt: { $gte: startDate } },
        { status: 'live', startedAt: { $lte: endDate } },
        { createdAt: { $gte: startDate, $lte: endDate } }
      ]
    }).select('roomType status startedAt endedAt joinedUsers viewers seats hostId channelName createdAt updatedAt');

    const userPartyRoomDates: { start: number; end: number }[] = [];
    const userLiveStreamDates: { start: number; end: number }[] = [];

    hostedRooms.forEach(room => {
      const start = (room.startedAt || room.createdAt || new Date()).getTime();
      const end = (room.status === 'live' ? now : (room.endedAt || room.updatedAt || room.startedAt || new Date())).getTime();
      if (room.roomType === 'party_room') {
        userPartyRoomDates.push({ start, end });
      } else {
        userLiveStreamDates.push({ start, end });
      }
    });

    // 2. Fetch gift history for user (only received beans)
    const giftHistory = await CoinHistory.find({
      userId: userObjectId,
      type: { $in: ['gift_received', 'charm_received', 'call_income'] },
      createdAt: { $gte: startDate, $lte: endDate }
    }).select('relatedUserId channelName amount type contextType description createdAt');

    const channelNames = this.uniqueIdStrings(
      giftHistory.map(h => h.channelName).filter((name): name is string => !!name)
    );
    const roomsByChannel = new Map<string, 'livestream' | 'party_room'>();
    if (channelNames.length) {
      const rooms = await Room.find({
        channelName: { $in: channelNames }
      }).select('channelName roomType');
      rooms.forEach(room => {
        const typeKey = room.roomType === 'party_room' ? 'party_room' : 'livestream';
        roomsByChannel.set(room.channelName, typeKey);
        roomsByChannel.set(room.channelName.toLowerCase(), typeKey);
      });
    }

    let liveBeansIncome = 0;
    let partyBeansIncome = 0;
    const liveGiftSenders = new Set<string>();
    const partyGiftSenders = new Set<string>();
    const callGiftSenders = new Set<string>();

    giftHistory.forEach(history => {
      const senderId = history.relatedUserId?.toString();
      const amount = Math.abs(history.amount || 0);
      const giftContext = this.resolveGiftContext(history, roomsByChannel, userPartyRoomDates, userLiveStreamDates);

      if (history.type === 'call_income' || giftContext === 'call') {
        if (isHost && senderId && senderId !== userId) {
          callGiftSenders.add(senderId);
        }
        return;
      }

      if (giftContext === 'party_room') {
        partyBeansIncome += amount;
        if (senderId && senderId !== userId) partyGiftSenders.add(senderId);
        return;
      }

      // Default all other received gifts to livestream
      liveBeansIncome += amount;
      if (senderId && senderId !== userId) liveGiftSenders.add(senderId);
    });

    // 3. Live Stream stats aggregation
    const liveViewerIds = new Set<string>();
    let liveDurationFromRooms = 0;

    hostedRooms.forEach(room => {
      if (room.roomType === 'party_room') return;
      const roomStart = room.startedAt || room.createdAt || new Date();
      const roomEnd = room.status === 'live' ? now : (room.endedAt || room.updatedAt || roomStart);
      if (room.status !== 'live' && roomEnd < startDate) return;
      if (roomStart > endDate) return;

      liveDurationFromRooms += this.clipDurationSeconds(roomStart, roomEnd, startDate, endDate);

      (room.joinedUsers || []).forEach(id => {
        if (id && id.toString() !== userId) liveViewerIds.add(id.toString());
      });
      (room.viewers || []).forEach(id => {
        if (id && id.toString() !== userId) liveViewerIds.add(id.toString());
      });
    });

    const liveDurationFromLogs = logs.reduce((sum, log) => sum + (log.liveDurationSeconds || 0), 0);
    const liveDurationSeconds = Math.max(liveDurationFromRooms, liveDurationFromLogs);
    const loggedLiveViewers = logs.reduce((sum, log) => sum + (log.liveViewers || 0), 0);
    const totalLiveViewersCount = Math.max(liveViewerIds.size, loggedLiveViewers);

    // 4. Party Room stats aggregation
    let partyRoomOwnerSecondsFromRooms = 0;
    let totalMicSecondsFromRooms = 0;
    const micUserIds = new Set<string>();
    const audienceUserIds = new Set<string>();
    const partySecondsByDate = new Map<string, number>();

    hostedRooms.forEach(room => {
      if (room.roomType !== 'party_room') return;
      const roomStart = room.startedAt || room.createdAt || new Date();
      const roomEnd = room.status === 'live' ? now : (room.endedAt || room.updatedAt || roomStart);
      if (room.status !== 'live' && roomEnd < startDate) return;
      if (roomStart > endDate) return;

      const partySeconds = this.clipDurationSeconds(roomStart, roomEnd, startDate, endDate);
      partyRoomOwnerSecondsFromRooms += partySeconds;

      const activityDate = this.localDateStr(roomEnd);
      partySecondsByDate.set(activityDate, (partySecondsByDate.get(activityDate) || 0) + partySeconds);

      (room.joinedUsers || []).forEach(id => {
        if (id && id.toString() !== userId) audienceUserIds.add(id.toString());
      });
      (room.viewers || []).forEach(id => {
        if (id && id.toString() !== userId) audienceUserIds.add(id.toString());
      });

      (room.seats || []).forEach(seat => {
        if (!seat.userId) return;
        micUserIds.add(seat.userId.toString());
        if (seat.occupiedAt) {
          const occupiedAt = new Date(seat.occupiedAt);
          if (occupiedAt <= endDate) {
            totalMicSecondsFromRooms += this.clipDurationSeconds(occupiedAt, roomEnd, startDate, endDate);
          }
        }
      });
    });

    // Merge with LiveDataLog
    const roomOwnerSecondsFromLogs = logs.reduce((sum, log) => sum + (log.roomOwnerSeconds || 0), 0);
    const totalMicSecondsFromLogs = logs.reduce((sum, log) => sum + (log.totalMicSeconds || 0), 0);
    const roomOwnerSeconds = Math.max(partyRoomOwnerSecondsFromRooms, roomOwnerSecondsFromLogs);
    const totalMicSeconds = Math.max(totalMicSecondsFromRooms, totalMicSecondsFromLogs);

    logs.forEach(log => {
      (log.micUserIds || []).forEach(id => micUserIds.add(id.toString()));
      (log.audienceUserIds || []).forEach(id => {
        if (id.toString() !== userId) audienceUserIds.add(id.toString());
      });
      if (log.roomOwnerSeconds) {
        partySecondsByDate.set(log.date, Math.max(partySecondsByDate.get(log.date) || 0, log.roomOwnerSeconds));
      }
    });

    const userOnMicCount = Math.max(micUserIds.size, logs.reduce((sum, log) => sum + (log.userOnMicCount || 0), 0));
    const audienceCount = Math.max(audienceUserIds.size, logs.reduce((sum, log) => sum + (log.audienceCount || 0), 0));

    // 5. Calls and Totals
    const loggedReports = logs.reduce((sum, log) => sum + (log.reportsCount || 0), 0);
    const loggedNewFans = logs.reduce((sum, log) => sum + (log.newFansCount || 0), 0);

    const totalCalls = callStats.totalCalls || 0;
    const totalDurationSeconds = callStats.totalDuration || 0;
    const totalCallIncome = isHost ? Number(callIncomeAgg[0]?.total || 0) : 0;
    const voiceIncome = isHost ? (callStats.voiceIncome || 0) : 0;
    const videoIncome = isHost ? (callStats.videoIncome || 0) : 0;
    const coinsSpent = isHost ? 0 : (callStats.coinsSpent || 0);
    const uniqueCallers = isHost ? uniqueCounterparts : 0;
    const uniqueHosts = isHost ? 0 : uniqueCounterparts;
    const giftSendersCount = isHost ? callGiftSenders.size : 0;
    const avgRating = dataLog?.avgRating || 4.8;
    const reportsCount = loggedReports;

    const eDayMinHours = Number(await this.appSettingService.getSettingValue('e_day_min_hours') ?? 1);
    const liveEHours = this.secondsToEHours(liveDurationSeconds);
    const partyEHours = this.secondsToEHours(roomOwnerSeconds);

    const partyEDay = type === 'monthly'
      ? Array.from(partySecondsByDate.values()).filter(seconds => this.secondsToEHours(seconds) >= eDayMinHours).length
      : (partyEHours >= eDayMinHours ? 1 : 0);

    const summaryBeansIncome = totalCallIncome + liveBeansIncome + partyBeansIncome;

    const completedMinutes = Math.floor(totalDurationSeconds / 60);
    const targetMinutes = dataLog?.hostTask?.targetMinutes || 120;
    const rewardBeans = dataLog?.hostTask?.rewardBeans || 10000;
    const isCompleted = completedMinutes >= targetMinutes;
    const progressPercentage = Math.min(100, Math.floor((completedMinutes / targetMinutes) * 100));

    return {
      user: {
        id: user._id,
        name: user.name || 'User',
        profileImage: user.profileImage,
        isVerified: user.isVerified || false,
        verificationStatus: user.isVerified ? 'Verified' : 'Unverified'
      },
      accountRole,
      type,
      selectedDate: dateStr,
      selectedMonth: monthStr,

      summary: {
        totalBeansIncome: summaryBeansIncome
      },

      callData: {
        totalBeansIncome: totalCallIncome,
        totalCallIncome,
        coinsSpent,
        totalCalls,
        voiceIncome,
        videoIncome,
        totalDuration: this.formatSecondsToHHMMSS(totalDurationSeconds),
        totalDurationSeconds,
        giftSenders: giftSendersCount,
        avgRating: `${avgRating.toFixed(1)}/5`,
        avgRatingValue: avgRating,
        uniqueCallers,
        uniqueHosts,
        repeatUsers: repeatUsersCount,
        reports: reportsCount
      },

      liveStreamData: {
        liveBeansIncome,
        eHours: liveEHours,
        viewers: totalLiveViewersCount,
        liveDuration: this.formatSecondsToHHMMSS(liveDurationSeconds),
        liveDurationSeconds,
        giftSenders: liveGiftSenders.size
      },

      partyRoomData: {
        partyBeansIncome,
        roomOwnerHour: this.formatSecondsToHHMMSS(roomOwnerSeconds),
        roomOwnerSeconds,
        eHours: partyEHours,
        totalMicHour: this.formatSecondsToHHMMSS(totalMicSeconds),
        totalMicSeconds,
        eDay: partyEDay,
        userOnMic: userOnMicCount,
        audience: audienceCount,
        giftSenders: partyGiftSenders.size
      },

      fans: {
        newFans: Math.max(newFansCount, loggedNewFans)
      },

      hostTask: {
        title: dataLog?.hostTask?.title || `Complete ${targetMinutes} min of 1v1 calls today to earn ${rewardBeans} extra beans!`,
        completedMinutes,
        targetMinutes,
        rewardBeans,
        isCompleted,
        progressPercentage
      }
    };
  }

  public async getPlatformLiveData(
    queryDate?: string,
    type: 'daily' | 'monthly' = 'daily'
  ) {
    const { dateStr, monthStr, startDate, endDate } = this.parseDateRange(queryDate, type);

    const giftHistory = await CoinHistory.find({
      type: { $in: ['gift_received', 'charm_received', 'call_income'] },
      createdAt: { $gte: startDate, $lte: endDate }
    }).select('channelName amount type contextType description createdAt');

    const channelNames = this.uniqueIdStrings(
      giftHistory.map(h => h.channelName).filter((name): name is string => !!name)
    );
    const roomsByChannel = new Map<string, 'livestream' | 'party_room'>();
    if (channelNames.length) {
      const rooms = await Room.find({ channelName: { $in: channelNames } }).select('channelName roomType');
      rooms.forEach(room => {
        const typeKey = room.roomType === 'party_room' ? 'party_room' : 'livestream';
        roomsByChannel.set(room.channelName, typeKey);
        roomsByChannel.set(room.channelName.toLowerCase(), typeKey);
      });
    }

    let liveBeansIncome = 0;
    let partyBeansIncome = 0;
    let callRevenue = 0;

    giftHistory.forEach(history => {
      const amount = Math.abs(history.amount || 0);
      const giftContext = this.resolveGiftContext(history, roomsByChannel);
      if (history.type === 'call_income' || giftContext === 'call') {
        if (history.type === 'call_income') {
          callRevenue += amount;
        }
        return;
      }
      if (giftContext === 'party_room') {
        partyBeansIncome += amount;
        return;
      }
      liveBeansIncome += amount;
    });

    const callAgg = await Call.aggregate([
      {
        $match: {
          status: 'ended',
          $or: [
            { endedAt: { $gte: startDate, $lte: endDate } },
            { endedAt: { $exists: false }, createdAt: { $gte: startDate, $lte: endDate } }
          ]
        }
      },
      {
        $group: {
          _id: null,
          totalCalls: { $sum: 1 },
          coinsSpent: { $sum: { $ifNull: ['$coinsDeducted', 0] } },
          hostBeansIncome: { $sum: { $ifNull: ['$coinsEarned', 0] } },
          platformFee: { $sum: { $ifNull: ['$platformFee', 0] } }
        }
      }
    ]);

    const callStats = callAgg[0] || { totalCalls: 0, coinsSpent: 0, hostBeansIncome: 0, platformFee: 0 };
    const hostCallRevenue = callRevenue || Number(callStats.hostBeansIncome || 0);

    return {
      type,
      selectedDate: dateStr,
      selectedMonth: monthStr,
      liveBeansIncome,
      partyBeansIncome,
      callRevenue: hostCallRevenue,
      coinsSpent: Number(callStats.coinsSpent || 0),
      platformFee: Number(callStats.platformFee || 0),
      totalCalls: Number(callStats.totalCalls || 0),
      totalBeansIncome: liveBeansIncome + partyBeansIncome + hostCallRevenue
    };
  }

  public async updateLiveData(userId: string, body: any) {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const dateStr = body.date || this.localDateStr();
    const monthStr = dateStr.substring(0, 7);

    const updated = await LiveDataLog.findOneAndUpdate(
      { userId: userObjectId, date: dateStr },
      {
        $set: { month: monthStr },
        $inc: {
          totalCalls: body.totalCalls || 0,
          totalDurationSeconds: body.totalDurationSeconds || 0,
          liveEHours: body.liveEHours || 0,
          liveViewers: body.liveViewers || 0,
          liveDurationSeconds: body.liveDurationSeconds || 0,
          liveGiftSendersCount: body.liveGiftSendersCount || 0,
          roomOwnerSeconds: body.roomOwnerSeconds || 0,
          partyEHours: body.partyEHours || 0,
          totalMicSeconds: body.totalMicSeconds || 0,
          userOnMicCount: body.userOnMicCount || 0,
          audienceCount: body.audienceCount || 0,
          partyEDay: body.partyEDay || 0,
          partyGiftSendersCount: body.partyGiftSendersCount || 0
        }
      },
      { new: true, upsert: true }
    );

    return updated;
  }
}

