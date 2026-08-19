import { Service, Inject, Container } from 'typedi';
import mongoose from 'mongoose';
import { startOfDay, endOfDay, subDays, startOfMonth, endOfMonth } from 'date-fns';
import Agency from '../../models/Agency';
import AgencyHost from '../../models/AgencyHost';
import AgencyCommission from '../../models/AgencyCommission';
import User from '../../models/User';
import Room from '../../models/Room';
import Call from '../../models/Call';
import CoinHistory from '../../models/CoinHistory';
import { LevelService } from './LevelService';
import { getUserCountryAndLevels } from '../../utils/userLookup';

export type HostDateRange =
  | 'last_7_days'
  | 'last_30_days'
  | 'last_90_days'
  | 'this_month'
  | 'custom';

export interface HostDashboardFilters {
  range?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  page?: number;
  limit?: number;
}

interface ResolvedRange {
  range: HostDateRange;
  startDate: Date;
  endDate: Date;
  start_date: string;
  end_date: string;
}

interface RoomContext {
  roomType: 'livestream' | 'party_room';
  partyRoomOption?: 'live' | 'chat';
}

@Service()
export class HostDashboardService {
  constructor(@Inject() private levelService: LevelService) {}

  private localDateStr(date: Date): string {
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

  private clipDurationSeconds(startedAt: Date, endedAt: Date | undefined, startDate: Date, endDate: Date): number {
    const sessionStart = startedAt.getTime();
    const sessionEnd = (endedAt || new Date()).getTime();
    const clippedStart = Math.max(sessionStart, startDate.getTime());
    const clippedEnd = Math.min(sessionEnd, endDate.getTime());
    return Math.max(0, Math.round((clippedEnd - clippedStart) / 1000));
  }

  private parseYmd(value?: string): Date | null {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  public resolveDateRange(filters: HostDashboardFilters): ResolvedRange {
    const customStart = this.parseYmd(filters.startDate);
    const customEnd = this.parseYmd(filters.endDate);
    const now = new Date();

    if (customStart && customEnd) {
      if (customStart > customEnd) {
        throw new Error('start_date cannot be after end_date');
      }
      return {
        range: 'custom',
        startDate: startOfDay(customStart),
        endDate: endOfDay(customEnd),
        start_date: this.localDateStr(customStart),
        end_date: this.localDateStr(customEnd),
      };
    }

    const allowed: HostDateRange[] = ['last_7_days', 'last_30_days', 'last_90_days', 'this_month', 'custom'];
    const range = allowed.includes(filters.range as HostDateRange)
      ? (filters.range as HostDateRange)
      : 'last_30_days';

    let start = startOfDay(subDays(now, 29));
    let end = endOfDay(now);

    if (range === 'last_7_days') {
      start = startOfDay(subDays(now, 6));
    } else if (range === 'last_90_days') {
      start = startOfDay(subDays(now, 89));
    } else if (range === 'this_month') {
      start = startOfMonth(now);
      end = endOfMonth(now);
    }

    return {
      range,
      startDate: start,
      endDate: end,
      start_date: this.localDateStr(start),
      end_date: this.localDateStr(end),
    };
  }

  private async getOwnerAgency(ownerUserId: string) {
    const agency = await Agency.findOne({ creatorId: ownerUserId });
    if (!agency) {
      throw new Error('Agency not found for this user');
    }
    return agency;
  }

  private mediaUrl(profileImage: any): string | null {
    if (!profileImage) return null;
    if (typeof profileImage === 'string') return profileImage;
    return profileImage.url || null;
  }

  private isUserOnline(user: any): boolean {
    let io: any;
    try {
      io = Container.get('socket');
    } catch {
      io = null;
    }

    const hostId = user?._id?.toString();
    const socketOnline = io && hostId
      ? (io.sockets?.adapter?.rooms?.get(`user_${hostId}`)?.size || 0) > 0
      : false;
    const recentLogin = user?.lastLoginAt
      ? new Date(user.lastLoginAt).getTime() > Date.now() - 15 * 60 * 1000
      : false;
    return socketOnline || recentLogin;
  }

  private async findHostUserIdsBySearch(search?: string): Promise<mongoose.Types.ObjectId[] | null> {
    const query = search?.trim();
    if (!query) return null;

    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const digits = query.replace(/\D/g, '').replace(/^0+/, '') || query.replace(/\D/g, '');
    const numericId = Number(digits);
    const or: Record<string, unknown>[] = [
      {
        $expr: {
          $regexMatch: {
            input: { $toString: '$userId' },
            regex: escaped,
          },
        },
      },
    ];

    if (!Number.isNaN(numericId) && digits) {
      or.push({ userId: numericId });
    }

    const users = await User.find({ $or: or }).select('_id');
    return users.map((user) => user._id);
  }

  private async resolveHostMembership(agencyId: mongoose.Types.ObjectId, hostId: string) {
    const query: Record<string, unknown>[] = [];

    if (mongoose.Types.ObjectId.isValid(hostId)) {
      query.push({ _id: new mongoose.Types.ObjectId(hostId) });
      query.push({ userId: new mongoose.Types.ObjectId(hostId) });
    }

    const numericId = Number(hostId);
    if (!Number.isNaN(numericId) && numericId > 0) {
      const user = await User.findOne({ userId: numericId }).select('_id');
      if (user) {
        query.push({ userId: user._id });
      }
    }

    if (!query.length) {
      throw new Error('Host not found in this agency');
    }

    const membership = await AgencyHost.findOne({
      agencyId,
      status: 'ACCEPTED',
      $or: query,
    }).populate({
      path: 'userId',
      populate: [{ path: 'profileImage' }, { path: 'countryId' }],
    });

    if (!membership || !membership.userId) {
      throw new Error('Host not found in this agency');
    }

    return membership;
  }

  private resolveGiftBucket(
    history: { type?: string; contextType?: string; channelName?: string; description?: string; callId?: any },
    roomsByChannel: Map<string, RoomContext>
  ): 'live' | 'party' | 'chat' | 'video_call' | 'audio_call' | 'call' | 'platform' | 'commission' | 'other' {
    if (history.type === 'referral_reward') return 'platform';
    if (history.type === 'agency_commission') return 'commission';

    if (history.contextType === 'video_call') return 'video_call';
    if (history.contextType === 'audio_call') return 'audio_call';
    if (history.type === 'call_income') return 'call';

    if (history.contextType === 'live_stream') return 'live';
    if (history.contextType === 'party_room') {
      const room = history.channelName ? roomsByChannel.get(history.channelName) : undefined;
      return room?.partyRoomOption === 'chat' ? 'chat' : 'party';
    }

    if (history.channelName) {
      const room = roomsByChannel.get(history.channelName);
      if (room?.roomType === 'livestream') return 'live';
      if (room?.roomType === 'party_room') {
        return room.partyRoomOption === 'chat' ? 'chat' : 'party';
      }
    }

    const description = history.description || '';
    if (/during live_stream|during live stream/i.test(description)) return 'live';
    if (/during party_room/i.test(description)) return 'party';
    if (/during video_call/i.test(description)) return 'video_call';
    if (/during audio_call/i.test(description)) return 'audio_call';
    if (/chat/i.test(description)) return 'chat';

    if (history.type === 'gift_received' || history.type === 'charm_received') {
      return 'chat';
    }

    return 'other';
  }

  private async getLiveDurationsByHost(
    hostIds: mongoose.Types.ObjectId[],
    startDate: Date,
    endDate: Date
  ): Promise<Map<string, number>> {
    const durations = new Map<string, number>();
    if (!hostIds.length) return durations;

    const rooms = await Room.find({
      hostId: { $in: hostIds },
      roomType: { $ne: 'party_room' },
      startedAt: { $lte: endDate },
    }).select('hostId status startedAt endedAt');

    const now = new Date();
    rooms.forEach((room) => {
      const endedAt = room.status === 'live' ? now : room.endedAt;
      if (room.status !== 'live' && (!endedAt || endedAt < startDate)) return;
      const hostKey = room.hostId.toString();
      const seconds = this.clipDurationSeconds(room.startedAt, endedAt, startDate, endDate);
      durations.set(hostKey, (durations.get(hostKey) || 0) + seconds);
    });

    return durations;
  }

  private async getHostActivityAndIncome(userObjectId: mongoose.Types.ObjectId, startDate: Date, endDate: Date) {
    const now = new Date();
    const callDateRange = {
      $or: [
        { endedAt: { $gte: startDate, $lte: endDate } },
        { endedAt: { $exists: false }, createdAt: { $gte: startDate, $lte: endDate } },
      ],
    };

    const [endedCalls, giftHistory, hostedRooms] = await Promise.all([
      Call.find({
        receiverId: userObjectId,
        status: 'ended',
        ...callDateRange,
      }).select('_id callType duration coinsEarned'),
      CoinHistory.find({
        userId: userObjectId,
        amount: { $gt: 0 },
        type: {
          $in: [
            'gift_received',
            'charm_received',
            'call_income',
            'referral_reward',
            'agency_commission',
            'transfer',
            'other',
          ],
        },
        createdAt: { $gte: startDate, $lte: endDate },
      }).select('amount type contextType channelName description callId'),
      Room.find({
        hostId: userObjectId,
        startedAt: { $lte: endDate },
      }).select('roomType partyRoomOption status startedAt endedAt channelName'),
    ]);

    const roomsByChannel = new Map<string, RoomContext>();
    hostedRooms.forEach((room) => {
      roomsByChannel.set(room.channelName, {
        roomType: room.roomType === 'party_room' ? 'party_room' : 'livestream',
        partyRoomOption: room.partyRoomOption,
      });
    });

    let liveDurationSeconds = 0;
    let partyDurationSeconds = 0;
    hostedRooms.forEach((room) => {
      const endedAt = room.status === 'live' ? now : room.endedAt;
      if (room.status !== 'live' && (!endedAt || endedAt < startDate)) return;
      const seconds = this.clipDurationSeconds(room.startedAt, endedAt, startDate, endDate);
      if (room.roomType === 'party_room') {
        partyDurationSeconds += seconds;
      } else {
        liveDurationSeconds += seconds;
      }
    });

    const callTypeById = new Map<string, 'voice' | 'video'>();
    const callDurations = { voice: 0, video: 0 };
    const callIncomeFromCalls = { voice: 0, video: 0 };
    endedCalls.forEach((call) => {
      const key = call.callType === 'video' ? 'video' : 'voice';
      callTypeById.set(call._id.toString(), key);
      callDurations[key] += call.duration || 0;
      callIncomeFromCalls[key] += call.coinsEarned || 0;
    });

    const income = {
      live_income: 0,
      party_income: 0,
      chat_income: 0,
      video_call_income: 0,
      audio_call_income: 0,
      platform_rewards: 0,
      commission_income: 0,
      other_income: 0,
    };

    let usedCallHistory = false;
    giftHistory.forEach((history) => {
      const amount = Math.abs(history.amount || 0);
      let bucket = this.resolveGiftBucket(history, roomsByChannel);
      if (bucket === 'call') {
        const callType = history.callId ? callTypeById.get(history.callId.toString()) : undefined;
        bucket = callType === 'voice' ? 'audio_call' : 'video_call';
      }
      if (bucket === 'live') income.live_income += amount;
      else if (bucket === 'party') income.party_income += amount;
      else if (bucket === 'chat') income.chat_income += amount;
      else if (bucket === 'video_call') {
        income.video_call_income += amount;
        usedCallHistory = true;
      } else if (bucket === 'audio_call') {
        income.audio_call_income += amount;
        usedCallHistory = true;
      } else if (bucket === 'platform') income.platform_rewards += amount;
      else if (bucket === 'commission') income.commission_income += amount;
      else income.other_income += amount;
    });

    if (!usedCallHistory) {
      income.video_call_income += callIncomeFromCalls.video;
      income.audio_call_income += callIncomeFromCalls.voice;
    }

    const total_income =
      income.live_income +
      income.party_income +
      income.chat_income +
      income.video_call_income +
      income.audio_call_income +
      income.platform_rewards +
      income.commission_income +
      income.other_income;

    return {
      activity: {
        live_duration: this.formatSecondsToHHMMSS(liveDurationSeconds),
        live_duration_seconds: liveDurationSeconds,
        party_duration: this.formatSecondsToHHMMSS(partyDurationSeconds),
        party_duration_seconds: partyDurationSeconds,
        video_call_duration: this.formatSecondsToHHMMSS(callDurations.video),
        video_call_duration_seconds: callDurations.video,
        audio_call_duration: this.formatSecondsToHHMMSS(callDurations.voice),
        audio_call_duration_seconds: callDurations.voice,
      },
      income: {
        total_income,
        ...income,
      },
    };
  }

  public async getHostDashboard(ownerUserId: string, filters: HostDashboardFilters = {}) {
    const agency = await this.getOwnerAgency(ownerUserId);
    const dateRange = this.resolveDateRange(filters);
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(50, Math.max(1, filters.limit || 20));
    const skip = (page - 1) * limit;

    const hostQuery: Record<string, unknown> = { agencyId: agency._id, status: 'ACCEPTED' };
    const matchedUserIds = await this.findHostUserIdsBySearch(filters.search);
    if (matchedUserIds) {
      hostQuery.userId = { $in: matchedUserIds };
    }

    const [hosts, total, commissionAgg] = await Promise.all([
      AgencyHost.find(hostQuery)
        .populate({
          path: 'userId',
          populate: [{ path: 'profileImage' }, { path: 'countryId' }],
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      AgencyHost.countDocuments(hostQuery),
      AgencyCommission.aggregate([
        {
          $match: {
            agencyId: agency._id,
            type: 'accrual',
            createdAt: { $gte: dateRange.startDate, $lte: dateRange.endDate },
          },
        },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);

    const hostUserIds = hosts
      .map((host) => (host.userId as any)?._id)
      .filter(Boolean);
    const liveDurations = await this.getLiveDurationsByHost(
      hostUserIds,
      dateRange.startDate,
      dateRange.endDate
    );

    const userList = await Promise.all(
      hosts.map(async (host) => {
        const user = host.userId as any;
        if (!user) {
          return {
            host_record_id: host._id,
            avatar_url: null,
            display_name: 'Unknown',
            user_id: null,
            level: 0,
            live_duration: '00:00:00',
            live_duration_seconds: 0,
          };
        }

        const levels = await getUserCountryAndLevels(user, this.levelService);
        const liveSeconds = liveDurations.get(user._id.toString()) || 0;

        return {
          host_record_id: host._id,
          id: user._id,
          avatar_url: this.mediaUrl(user.profileImage),
          profile_image: user.profileImage || null,
          display_name: user.name || 'Unknown',
          user_id: user.userId ?? null,
          level: levels.charmLevel ?? levels.level ?? 0,
          live_duration: this.formatSecondsToHHMMSS(liveSeconds),
          live_duration_seconds: liveSeconds,
        };
      })
    );

    return {
      total_commission: Number(commissionAgg[0]?.total || 0),
      filters: {
        range: dateRange.range,
        start_date: dateRange.start_date,
        end_date: dateRange.end_date,
        search: filters.search?.trim() || null,
      },
      hosts: userList,
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit),
    };
  }

  public async getHostRevenueDetails(ownerUserId: string, hostId: string, filters: HostDashboardFilters = {}) {
    const agency = await this.getOwnerAgency(ownerUserId);
    const dateRange = this.resolveDateRange(filters);
    const membership = await this.resolveHostMembership(agency._id, hostId);
    const user = membership.userId as any;
    const levels = await getUserCountryAndLevels(user, this.levelService);
    const stats = await this.getHostActivityAndIncome(user._id, dateRange.startDate, dateRange.endDate);
    const isOnline = this.isUserOnline(user);

    return {
      filters: {
        range: dateRange.range,
        start_date: dateRange.start_date,
        end_date: dateRange.end_date,
      },
      host_info: {
        host_record_id: membership._id,
        id: user._id,
        name: user.name || 'Unknown',
        user_id: user.userId ?? null,
        avatar_url: this.mediaUrl(user.profileImage),
        profile_image: user.profileImage || null,
        status: isOnline ? 'online' : 'offline',
        is_online: isOnline,
        level: levels.charmLevel ?? levels.level ?? 0,
        country: levels.country,
        country_code: levels.country?.code || null,
        country_flag: levels.country?.flag || null,
        beans: user.beans || 0,
        can_remove_host: true,
      },
      activity_stats: stats.activity,
      revenue_stats: {
        total_beans_income: stats.income.total_income,
        breakdown: {
          live_income: stats.income.live_income,
          party_income: stats.income.party_income,
          chat_income: stats.income.chat_income,
          video_call_income: stats.income.video_call_income,
          audio_call_income: stats.income.audio_call_income,
          platform_rewards: stats.income.platform_rewards,
          commission_income: stats.income.commission_income,
          other_income: stats.income.other_income,
        },
      },
    };
  }

  public async removeHost(ownerUserId: string, hostId: string) {
    const agency = await this.getOwnerAgency(ownerUserId);
    const membership = await this.resolveHostMembership(agency._id, hostId);
    const user = membership.userId as any;

    membership.status = 'SUSPENDED';
    await membership.save();

    return {
      removed: true,
      host_record_id: membership._id,
      user_id: user?.userId ?? null,
      name: user?.name || 'Unknown',
      status: membership.status,
    };
  }
}
