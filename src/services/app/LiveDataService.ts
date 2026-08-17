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
      .select('name profileImage isVerified userId')
      .populate('profileImage');

    if (!user) {
      throw new Error('User not found');
    }

    let dateStr: string;
    let monthStr: string;
    let startDate: Date;
    let endDate: Date;

    const now = new Date();

    if (type === 'monthly') {
      if (queryDate && /^\d{4}-\d{2}$/.test(queryDate)) {
        monthStr = queryDate;
      } else if (queryDate && /^\d{4}-\d{2}-\d{2}$/.test(queryDate)) {
        monthStr = queryDate.substring(0, 7);
      } else {
        monthStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
      }
      dateStr = `${monthStr}-01`;

      const [year, month] = monthStr.split('-').map(Number);
      startDate = new Date(year, month - 1, 1, 0, 0, 0, 0);
      endDate = new Date(year, month, 0, 23, 59, 59, 999);
    } else {
      if (queryDate && /^\d{4}-\d{2}-\d{2}$/.test(queryDate)) {
        dateStr = queryDate;
      } else {
        dateStr = this.localDateStr(now);
      }
      monthStr = dateStr.substring(0, 7);

      const [year, month, day] = dateStr.split('-').map(Number);
      startDate = new Date(year, month - 1, day, 0, 0, 0, 0);
      endDate = new Date(year, month - 1, day, 23, 59, 59, 999);
    }

    const logs = type === 'monthly'
      ? await LiveDataLog.find({ userId: userObjectId, month: monthStr })
      : await LiveDataLog.find({ userId: userObjectId, date: dateStr });

    const dataLog = logs[0];

    const callMatch = {
      receiverId: userObjectId,
      status: 'ended',
      createdAt: { $gte: startDate, $lte: endDate }
    };

    const callAgg = await Call.aggregate([
      { $match: callMatch },
      {
        $group: {
          _id: null,
          totalCalls: { $sum: 1 },
          totalDuration: { $sum: '$duration' },
          totalCallIncome: { $sum: '$coinsEarned' },
          voiceIncome: {
            $sum: {
              $cond: [{ $eq: ['$callType', 'voice'] }, '$coinsEarned', 0]
            }
          },
          callers: { $push: '$callerId' }
        }
      }
    ]);

    const callStats = callAgg[0] || {
      totalCalls: 0,
      totalDuration: 0,
      totalCallIncome: 0,
      voiceIncome: 0,
      callers: []
    };

    const callerIdsStr = callStats.callers
      .map((c: any) => c?.toString())
      .filter((id: string) => id && id !== userId);
    const uniqueCallersCount = new Set<string>(callerIdsStr).size;

    const callerFrequency: { [key: string]: number } = {};
    callerIdsStr.forEach((c: string) => {
      callerFrequency[c] = (callerFrequency[c] || 0) + 1;
    });
    const repeatUsersCount = Object.values(callerFrequency).filter(count => count > 1).length;

    const newFansCount = await Follow.countDocuments({
      followingId: userObjectId,
      status: 'accepted',
      createdAt: { $gte: startDate, $lte: endDate }
    });

    const giftHistory = await CoinHistory.find({
      userId: userObjectId,
      type: { $in: ['gift_received', 'charm_received', 'call_income'] },
      createdAt: { $gte: startDate, $lte: endDate }
    }).select('relatedUserId channelName amount type');

    const channelNames = this.uniqueIdStrings(
      giftHistory.map(h => h.channelName).filter((name): name is string => !!name)
    );
    const roomsByChannel = new Map<string, 'livestream' | 'party_room'>();
    if (channelNames.length) {
      const rooms = await Room.find({ channelName: { $in: channelNames } }).select('channelName roomType');
      rooms.forEach(room => {
        roomsByChannel.set(room.channelName, room.roomType === 'party_room' ? 'party_room' : 'livestream');
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
      const roomType = history.channelName ? roomsByChannel.get(history.channelName) : undefined;

      if (history.type === 'call_income') {
        if (senderId && senderId !== userId) callGiftSenders.add(senderId);
        return;
      }

      if (roomType === 'livestream') {
        liveBeansIncome += amount;
        if (senderId && senderId !== userId) liveGiftSenders.add(senderId);
        return;
      }

      if (roomType === 'party_room') {
        partyBeansIncome += amount;
        if (senderId && senderId !== userId) partyGiftSenders.add(senderId);
        return;
      }

      if (senderId && senderId !== userId) {
        callGiftSenders.add(senderId);
      }
    });

    const hostedRooms = await Room.find({
      hostId: userObjectId,
      startedAt: { $lte: endDate }
    }).select('roomType status startedAt endedAt joinedUsers seats hostId');

    const liveViewerIds = new Set<string>();
    let liveDurationSeconds = 0;

    hostedRooms.forEach(room => {
      if (room.roomType === 'party_room') return;
      const endedAt = room.status === 'live' ? now : room.endedAt;
      if (room.status !== 'live' && (!endedAt || endedAt < startDate)) return;
      if (room.startedAt > endDate) return;

      liveDurationSeconds += this.clipDurationSeconds(room.startedAt, endedAt, startDate, endDate);
      (room.joinedUsers || []).forEach(id => {
        if (id.toString() !== userId) liveViewerIds.add(id.toString());
      });
    });

    let roomOwnerSeconds = logs.reduce((sum, log) => sum + (log.roomOwnerSeconds || 0), 0);
    let totalMicSeconds = logs.reduce((sum, log) => sum + (log.totalMicSeconds || 0), 0);
    const micUserIds = new Set<string>(
      logs.flatMap(log => (log.micUserIds || []).map(id => id.toString()))
    );
    const audienceUserIds = new Set<string>(
      logs.flatMap(log => (log.audienceUserIds || []).map(id => id.toString()))
    );
    const secondsByDate = new Map<string, number>();
    logs.forEach(log => {
      secondsByDate.set(log.date, (secondsByDate.get(log.date) || 0) + (log.roomOwnerSeconds || 0));
    });

    const livePartyRoom = hostedRooms.find(room => room.roomType === 'party_room' && room.status === 'live');
    if (livePartyRoom && livePartyRoom.startedAt <= endDate) {
      const currentPartySeconds = this.clipDurationSeconds(livePartyRoom.startedAt, now, startDate, endDate);
      roomOwnerSeconds += currentPartySeconds;

      const todayStr = this.localDateStr(now);
      if (todayStr >= this.localDateStr(startDate) && todayStr <= this.localDateStr(endDate)) {
        secondsByDate.set(todayStr, (secondsByDate.get(todayStr) || 0) + currentPartySeconds);
      }

      (livePartyRoom.joinedUsers || []).forEach(id => {
        if (id.toString() !== userId) audienceUserIds.add(id.toString());
      });

      (livePartyRoom.seats || []).forEach(seat => {
        if (!seat.userId) return;
        micUserIds.add(seat.userId.toString());
        if (seat.occupiedAt) {
          const occupiedAt = new Date(seat.occupiedAt);
          if (occupiedAt <= endDate) {
            totalMicSeconds += this.clipDurationSeconds(occupiedAt, now, startDate, endDate);
          }
        }
      });
    }

    const loggedCallIncome = logs.reduce((sum, log) => sum + (log.totalCallIncome || 0), 0);
    const loggedCalls = logs.reduce((sum, log) => sum + (log.totalCalls || 0), 0);
    const loggedVoiceIncome = logs.reduce((sum, log) => sum + (log.voiceIncome || 0), 0);
    const loggedCallDuration = logs.reduce((sum, log) => sum + (log.totalDurationSeconds || 0), 0);
    const loggedGiftSenders = logs.reduce((sum, log) => sum + (log.giftSendersCount || 0), 0);
    const loggedUniqueCallers = logs.reduce((sum, log) => sum + (log.uniqueCallersCount || 0), 0);
    const loggedRepeatUsers = logs.reduce((sum, log) => sum + (log.repeatUsersCount || 0), 0);
    const loggedReports = logs.reduce((sum, log) => sum + (log.reportsCount || 0), 0);
    const loggedNewFans = logs.reduce((sum, log) => sum + (log.newFansCount || 0), 0);

    const totalCallIncome = Math.max(callStats.totalCallIncome, loggedCallIncome);
    const totalCalls = Math.max(callStats.totalCalls, loggedCalls);
    const voiceIncome = Math.max(callStats.voiceIncome, loggedVoiceIncome);
    const totalDurationSeconds = Math.max(callStats.totalDuration, loggedCallDuration);
    const giftSendersCount = Math.max(callGiftSenders.size, loggedGiftSenders);
    const avgRating = dataLog?.avgRating || 4.8;
    const finalUniqueCallers = Math.max(uniqueCallersCount, loggedUniqueCallers);
    const finalRepeatUsers = Math.max(repeatUsersCount, loggedRepeatUsers);
    const reportsCount = loggedReports;

    const eDayMinHours = Number(await this.appSettingService.getSettingValue('e_day_min_hours') ?? 1);
    const liveEHours = this.secondsToEHours(liveDurationSeconds);
    const partyEHours = this.secondsToEHours(roomOwnerSeconds);
    const partyEDay = type === 'monthly'
      ? Array.from(secondsByDate.values()).filter(seconds => this.secondsToEHours(seconds) >= eDayMinHours).length
      : (partyEHours >= eDayMinHours ? 1 : 0);

    const totalBeansIncome = totalCallIncome + liveBeansIncome + partyBeansIncome;

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
      type,
      selectedDate: dateStr,
      selectedMonth: monthStr,

      summary: {
        totalBeansIncome
      },

      callData: {
        totalBeansIncome,
        totalCallIncome,
        totalCalls,
        voiceIncome,
        totalDuration: this.formatSecondsToHHMMSS(totalDurationSeconds),
        totalDurationSeconds,
        giftSenders: giftSendersCount,
        avgRating: `${avgRating.toFixed(1)}/5`,
        avgRatingValue: avgRating,
        uniqueCallers: finalUniqueCallers,
        repeatUsers: finalRepeatUsers,
        reports: reportsCount
      },

      liveStreamData: {
        liveBeansIncome,
        eHours: liveEHours,
        viewers: liveViewerIds.size,
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
        userOnMic: micUserIds.size,
        audience: audienceUserIds.size,
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

  public async updateLiveData(userId: string, body: any) {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const dateStr = body.date || this.localDateStr();
    const monthStr = dateStr.substring(0, 7);

    const updated = await LiveDataLog.findOneAndUpdate(
      { userId: userObjectId, date: dateStr },
      {
        $set: { month: monthStr },
        $inc: {
          totalBeansIncome: body.totalBeansIncome || 0,
          totalCallIncome: body.totalCallIncome || 0,
          totalCalls: body.totalCalls || 0,
          voiceIncome: body.voiceIncome || 0,
          totalDurationSeconds: body.totalDurationSeconds || 0,
          liveBeansIncome: body.liveBeansIncome || 0,
          liveEHours: body.liveEHours || 0,
          liveViewers: body.liveViewers || 0,
          liveDurationSeconds: body.liveDurationSeconds || 0,
          liveGiftSendersCount: body.liveGiftSendersCount || 0,
          partyBeansIncome: body.partyBeansIncome || 0,
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
