import { Service } from 'typedi';
import mongoose from 'mongoose';
import User from '../../models/User';
import Call from '../../models/Call';
import CoinHistory from '../../models/CoinHistory';
import Follow from '../../models/Follow';
import LiveDataLog from '../../models/LiveDataLog';

@Service()
export class LiveDataService {
  private formatSecondsToHHMMSS(totalSeconds: number): string {
    const secs = Math.max(0, Math.floor(totalSeconds || 0));
    const hours = Math.floor(secs / 3600);
    const minutes = Math.floor((secs % 3600) / 60);
    const remainingSecs = secs % 60;

    const pad = (num: number) => num.toString().padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(remainingSecs)}`;
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
        dateStr = now.toISOString().split('T')[0];
      }
      monthStr = dateStr.substring(0, 7);

      const [year, month, day] = dateStr.split('-').map(Number);
      startDate = new Date(year, month - 1, day, 0, 0, 0, 0);
      endDate = new Date(year, month - 1, day, 23, 59, 59, 999);
    }

    // 1. Fetch Log from LiveDataLog DB
    let dataLog = await LiveDataLog.findOne({ userId: userObjectId, date: dateStr });

    // 2. Fetch real-time aggregate calls data within range
    const callMatch = {
      $or: [{ receiverId: userObjectId }, { callerId: userObjectId }],
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

    const callerIdsStr = callStats.callers.map((c: any) => c.toString());
    const uniqueCallerSet = new Set<string>(callerIdsStr);
    const uniqueCallersCount = uniqueCallerSet.size;

    // Calculate repeat users
    const callerFrequency: { [key: string]: number } = {};
    callerIdsStr.forEach((c: string) => {
      callerFrequency[c] = (callerFrequency[c] || 0) + 1;
    });
    const repeatUsersCount = Object.values(callerFrequency).filter(count => count > 1).length;

    // 3. New Fans gained in period
    const newFansCount = await Follow.countDocuments({
      followingId: userObjectId,
      status: 'accepted',
      createdAt: { $gte: startDate, $lte: endDate }
    });

    // 4. Gift senders count from CoinHistory
    const giftHistory = await CoinHistory.find({
      userId: userObjectId,
      type: { $in: ['gift_received', 'charm_received', 'call_income'] },
      createdAt: { $gte: startDate, $lte: endDate }
    }).select('relatedUserId');

    const giftSendersSet = new Set<string>();
    giftHistory.forEach(h => {
      if (h.relatedUserId) {
        giftSendersSet.add(h.relatedUserId.toString());
      }
    });

    // Combine logged values with real-time aggregates
    const totalCallIncome = Math.max(callStats.totalCallIncome, dataLog?.totalCallIncome || 0);
    const totalCalls = Math.max(callStats.totalCalls, dataLog?.totalCalls || 0);
    const voiceIncome = Math.max(callStats.voiceIncome, dataLog?.voiceIncome || 0);
    const totalDurationSeconds = Math.max(callStats.totalDuration, dataLog?.totalDurationSeconds || 0);
    const giftSendersCount = Math.max(giftSendersSet.size, dataLog?.giftSendersCount || 0);
    const avgRating = dataLog?.avgRating || 4.8;
    const finalUniqueCallers = Math.max(uniqueCallersCount, dataLog?.uniqueCallersCount || 0);
    const finalRepeatUsers = Math.max(repeatUsersCount, dataLog?.repeatUsersCount || 0);
    const reportsCount = dataLog?.reportsCount || 0;

    // Live Stream stats
    const liveBeansIncome = dataLog?.liveBeansIncome || 0;
    const liveEHours = dataLog?.liveEHours || 0;
    const liveViewers = dataLog?.liveViewers || 0;
    const liveDurationSeconds = dataLog?.liveDurationSeconds || 0;
    const liveGiftSendersCount = dataLog?.liveGiftSendersCount || 0;

    // Party Room stats
    const partyBeansIncome = dataLog?.partyBeansIncome || 0;
    const roomOwnerSeconds = dataLog?.roomOwnerSeconds || 0;
    const partyEHours = dataLog?.partyEHours || 0;
    const totalMicSeconds = dataLog?.totalMicSeconds || 0;
    const partyEDay = dataLog?.partyEDay || 0;
    const userOnMicCount = dataLog?.userOnMicCount || 0;
    const audienceCount = dataLog?.audienceCount || 0;
    const partyGiftSendersCount = dataLog?.partyGiftSendersCount || 0;

    // Total Beans Calculation
    const totalBeansIncome = totalCallIncome + liveBeansIncome + partyBeansIncome;

    // Host Task calculation (1v1 call duration in mins vs target)
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

      // Total Beans Summary
      summary: {
        totalBeansIncome
      },

      // Call Data (1v1 Calls)
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

      // Live Stream Data
      liveStreamData: {
        liveBeansIncome,
        eHours: liveEHours,
        viewers: liveViewers,
        liveDuration: this.formatSecondsToHHMMSS(liveDurationSeconds),
        liveDurationSeconds,
        giftSenders: liveGiftSendersCount
      },

      // Party Room Data
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
        giftSenders: partyGiftSendersCount
      },

      // New Fans
      fans: {
        newFans: Math.max(newFansCount, dataLog?.newFansCount || 0)
      },

      // Host Task
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
    const dateStr = body.date || new Date().toISOString().split('T')[0];
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
          partyBeansIncome: body.partyBeansIncome || 0,
          roomOwnerSeconds: body.roomOwnerSeconds || 0,
          partyEHours: body.partyEHours || 0,
          totalMicSeconds: body.totalMicSeconds || 0,
          userOnMicCount: body.userOnMicCount || 0,
          audienceCount: body.audienceCount || 0
        }
      },
      { new: true, upsert: true }
    );

    return updated;
  }
}
