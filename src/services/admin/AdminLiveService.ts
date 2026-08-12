import { Service, Container } from 'typedi';
import mongoose from 'mongoose';
import Room from '../../models/Room';
import User from '../../models/User';
import LiveBan from '../../models/LiveBan';
import AdminNotification from '../../models/AdminNotification';
import CoinHistory from '../../models/CoinHistory';
import Country from '../../models/Country';
import { LevelService } from '../app/LevelService';
import { LiveStreamService } from '../app/LiveStreamService';

@Service()
export class AdminLiveService {
  private levelService = Container.get(LevelService);
  private liveStreamService = Container.get(LiveStreamService);

  private liveTypeLabel(roomType?: string): string {
    return roomType === 'party_room' ? 'Audio Live' : 'Normal Live';
  }

  private seatedCount(seats?: any[]): number {
    if (!Array.isArray(seats)) return 0;
    return seats.filter((s) => s.status === 'occupied').length;
  }

  private formatDuration(startedAt?: Date, endedAt?: Date): string {
    if (!startedAt || !endedAt) return '-';
    const ms = Math.max(0, endedAt.getTime() - startedAt.getTime());
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  private async enrichHost(host: any) {
    if (!host) return null;
    const hostObj = host.toObject ? host.toObject() : { ...host };
    const wealthCoins = hostObj.wealthCoins || 0;
    const levelInfo = await this.levelService.getLevelInfoForCoins(wealthCoins, 'rich');
    const current = levelInfo.currentLevel;
    return {
      ...hostObj,
      uniqueId: hostObj.userId,
      wealthLevel: current
        ? {
            name: current.name,
            levelNumber: current.levelNumber,
            color: current.color,
            image: current.image,
          }
        : null,
    };
  }

  private async enrichRoom(room: any) {
    const obj = room.toObject ? room.toObject() : { ...room };
    obj.host = await this.enrichHost(obj.hostId);
    obj.seatedCount = this.seatedCount(obj.seats);
    obj.liveType = this.liveTypeLabel(obj.roomType);
    obj.coins = obj.totalGiftRevenue || 0;
    obj.comments = obj.commentCount || 0;
    obj.viewers = obj.viewerCount || 0;
    obj.joinedUsersCount = Array.isArray(obj.joinedUsers) ? obj.joinedUsers.length : 0;
    if (obj.status === 'ended') {
      obj.duration = this.formatDuration(
        obj.startedAt ? new Date(obj.startedAt) : undefined,
        obj.endedAt ? new Date(obj.endedAt) : undefined
      );
      obj.newFans = obj.roomFollowerCount || 0;
    }
    return obj;
  }

  private async resolveHostIdsBySearch(search?: string): Promise<mongoose.Types.ObjectId[] | null> {
    if (!search || !search.trim()) return null;
    const term = search.trim();
    const or: any[] = [
      { name: { $regex: term, $options: 'i' } },
      { email: { $regex: term, $options: 'i' } },
    ];
    const asNum = Number(term);
    if (!isNaN(asNum)) {
      or.push({ userId: asNum });
    }
    if (mongoose.Types.ObjectId.isValid(term)) {
      or.push({ _id: new mongoose.Types.ObjectId(term) });
    }
    const users = await User.find({ $or: or }).select('_id');
    return users.map((u) => u._id as mongoose.Types.ObjectId);
  }

  private async applyCountryFilter(query: any, country?: string) {
    if (!country || country.trim() === '' || country.trim().toLowerCase() === 'all') return;
    const targetCountry = country.trim();
    const countryConditions: any[] = [];
    if (mongoose.Types.ObjectId.isValid(targetCountry)) {
      countryConditions.push({ _id: new mongoose.Types.ObjectId(targetCountry) });
    }
    countryConditions.push({ name: { $regex: new RegExp(`^${targetCountry}$`, 'i') } });
    countryConditions.push({ code: { $regex: new RegExp(`^${targetCountry}$`, 'i') } });
    countryConditions.push({ name: { $regex: targetCountry, $options: 'i' } });

    const matchingCountries = await Country.find({ $or: countryConditions });
    const countryObjIds = matchingCountries.map((c) => c._id);
    const countryNames = matchingCountries.map((c) => c.name);
    const countryCodes = matchingCountries.map((c) => c.code);

    const userQueryConditions: any[] = [];
    if (countryObjIds.length > 0) {
      userQueryConditions.push({ countryId: { $in: countryObjIds } });
    }
    if (mongoose.Types.ObjectId.isValid(targetCountry)) {
      userQueryConditions.push({ countryId: new mongoose.Types.ObjectId(targetCountry) });
    }
    userQueryConditions.push({ country: { $regex: new RegExp(targetCountry, 'i') } });
    if (countryNames.length > 0) userQueryConditions.push({ country: { $in: countryNames } });
    if (countryCodes.length > 0) userQueryConditions.push({ country: { $in: countryCodes } });

    const matchingUsers = await User.find({ $or: userQueryConditions }).select('_id');
    const hostIds = matchingUsers.map((u) => u._id);
    if (query.hostId?.$in) {
      const set = new Set(hostIds.map((id) => id.toString()));
      query.hostId.$in = query.hostId.$in.filter((id: any) => set.has(id.toString()));
    } else {
      query.hostId = { $in: hostIds };
    }
  }

  public async getActiveList(opts: {
    page?: number;
    limit?: number;
    roomType?: 'livestream' | 'party_room';
    country?: string;
    search?: string;
  }) {
    const page = opts.page || 1;
    const limit = opts.limit || 10;
    const query: any = { status: 'live' };

    if (opts.roomType === 'livestream' || opts.roomType === 'party_room') {
      query.roomType = opts.roomType;
    }

    const searchHostIds = await this.resolveHostIdsBySearch(opts.search);
    if (opts.search?.trim()) {
      const term = opts.search.trim();
      const or: any[] = [{ channelName: { $regex: term, $options: 'i' } }, { title: { $regex: term, $options: 'i' } }];
      if (searchHostIds && searchHostIds.length > 0) {
        or.push({ hostId: { $in: searchHostIds } });
      }
      query.$or = or;
    }

    await this.applyCountryFilter(query, opts.country);

    const [rooms, total] = await Promise.all([
      Room.find(query)
        .populate({
          path: 'hostId',
          select: 'userId name email profileImage wealthCoins country countryId isPremium',
          populate: [{ path: 'profileImage' }, { path: 'countryId' }],
        })
        .sort({ viewerCount: -1, startedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Room.countDocuments(query),
    ]);

    const streams = await Promise.all(rooms.map((r) => this.enrichRoom(r)));

    return {
      streams,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  public async getActiveStats(roomType?: 'livestream' | 'party_room') {
    const match: any = { status: 'live' };
    if (roomType === 'livestream' || roomType === 'party_room') {
      match.roomType = roomType;
    }

    const [agg] = await Room.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          liveNow: { $sum: 1 },
          totalViewers: { $sum: '$viewerCount' },
          totalRevenue: { $sum: { $ifNull: ['$totalGiftRevenue', 0] } },
        },
      },
    ]);

    const channelNames = await Room.find(match).select('channelName').lean();
    const names = channelNames.map((r) => r.channelName);
    let totalGifts = 0;
    if (names.length > 0) {
      totalGifts = await CoinHistory.countDocuments({
        channelName: { $in: names },
        type: 'charm_received',
      });
    }

    return {
      liveNow: agg?.liveNow || 0,
      totalViewers: agg?.totalViewers || 0,
      totalGifts,
      totalRevenue: agg?.totalRevenue || 0,
    };
  }

  public async getDetails(channelName: string) {
    const room = await Room.findOne({ channelName })
      .populate({
        path: 'hostId',
        select: 'userId name email profileImage wealthCoins country countryId isPremium',
        populate: [{ path: 'profileImage' }, { path: 'countryId' }],
      });

    if (!room) throw new Error('Room not found');

    const enriched = await this.enrichRoom(room);
    const giftCount = await CoinHistory.countDocuments({
      channelName: room.channelName,
      type: 'charm_received',
    });

    return {
      ...enriched,
      giftsReceived: giftCount,
      newFans: enriched.roomFollowerCount || 0,
      streamHost: enriched.host,
      streamInformation: {
        sessionId: enriched.channelName,
        startedAt: enriched.startedAt,
        endedAt: enriched.endedAt,
        viewers: enriched.viewerCount || 0,
        comments: enriched.commentCount || 0,
        liveType: enriched.liveType,
        room: enriched.partyRoomOption || null,
        seatedCount: enriched.seatedCount,
      },
      engagement: {
        newFans: enriched.roomFollowerCount || 0,
        giftsReceived: giftCount,
        earnedCoins: enriched.totalGiftRevenue || 0,
      },
    };
  }

  public async getHistory(opts: {
    page?: number;
    limit?: number;
    roomType?: 'livestream' | 'party_room' | 'all';
    search?: string;
  }) {
    const page = opts.page || 1;
    const limit = opts.limit || 10;
    const query: any = { status: 'ended' };

    if (opts.roomType === 'livestream' || opts.roomType === 'party_room') {
      query.roomType = opts.roomType;
    }

    const searchHostIds = await this.resolveHostIdsBySearch(opts.search);
    if (opts.search?.trim()) {
      const term = opts.search.trim();
      const or: any[] = [{ channelName: { $regex: term, $options: 'i' } }, { title: { $regex: term, $options: 'i' } }];
      if (searchHostIds && searchHostIds.length > 0) {
        or.push({ hostId: { $in: searchHostIds } });
      }
      query.$or = or;
    }

    const [rooms, total] = await Promise.all([
      Room.find(query)
        .populate({
          path: 'hostId',
          select: 'userId name email profileImage wealthCoins country countryId isPremium',
          populate: [{ path: 'profileImage' }, { path: 'countryId' }],
        })
        .sort({ endedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Room.countDocuments(query),
    ]);

    const streams = await Promise.all(
      rooms.map(async (r) => {
        const enriched = await this.enrichRoom(r);
        const gifts = await CoinHistory.countDocuments({
          channelName: r.channelName,
          type: 'charm_received',
        });
        return {
          ...enriched,
          gifts,
          viewers: Array.isArray(enriched.joinedUsers) ? enriched.joinedUsers.length : enriched.viewerCount || 0,
        };
      })
    );

    return {
      streams,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  public async getHistoryStats() {
    const ended = { status: 'ended' as const };
    const [
      totalSessions,
      normalLive,
      audioLive,
      earnedAgg,
      totalViewersAgg,
      totalCommentsAgg,
      giftCount,
    ] = await Promise.all([
      Room.countDocuments(ended),
      Room.countDocuments({ ...ended, roomType: 'livestream' }),
      Room.countDocuments({ ...ended, roomType: 'party_room' }),
      Room.aggregate([
        { $match: ended },
        { $group: { _id: null, earnedCoins: { $sum: { $ifNull: ['$totalGiftRevenue', 0] } } } },
      ]),
      Room.aggregate([
        { $match: ended },
        {
          $group: {
            _id: null,
            totalViewers: {
              $sum: {
                $cond: [
                  { $gt: [{ $size: { $ifNull: ['$joinedUsers', []] } }, 0] },
                  { $size: { $ifNull: ['$joinedUsers', []] } },
                  { $ifNull: ['$viewerCount', 0] },
                ],
              },
            },
          },
        },
      ]),
      Room.aggregate([
        { $match: ended },
        { $group: { _id: null, totalComments: { $sum: { $ifNull: ['$commentCount', 0] } } } },
      ]),
      CoinHistory.countDocuments({
        type: 'charm_received',
        channelName: { $exists: true, $ne: null },
      }),
    ]);

    return {
      totalSessions,
      normalLive,
      audioLive,
      multiLive: 0,
      callJoin: 0,
      pkSessions: 0,
      earnedCoins: earnedAgg[0]?.earnedCoins || 0,
      receivedGifts: giftCount,
      totalViewers: totalViewersAgg[0]?.totalViewers || 0,
      totalComments: totalCommentsAgg[0]?.totalComments || 0,
    };
  }

  public async isUserLiveBanned(userId: string): Promise<boolean> {
    if (!mongoose.Types.ObjectId.isValid(userId)) return false;
    const now = new Date();
    const ban = await LiveBan.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      status: 'active',
      $or: [{ banType: 'permanent' }, { banType: 'temporary', expiresAt: { $gt: now } }],
    });

    if (!ban) return false;

    if (ban.banType === 'temporary' && ban.expiresAt && ban.expiresAt <= now) {
      ban.status = 'expired';
      await ban.save();
      return false;
    }
    return true;
  }

  public async banUser(opts: {
    userId: string;
    adminId: string;
    reason?: string;
    banType?: 'permanent' | 'temporary';
    expiresAt?: Date | string;
    endActiveRooms?: boolean;
  }) {
    if (!mongoose.Types.ObjectId.isValid(opts.userId)) throw new Error('Invalid user ID');
    if (!mongoose.Types.ObjectId.isValid(opts.adminId)) throw new Error('Invalid admin ID');

    const user = await User.findById(opts.userId).select('userId name email');
    if (!user) throw new Error('User not found');

    await LiveBan.updateMany(
      { userId: opts.userId, status: 'active' },
      { $set: { status: 'lifted' } }
    );

    const ban = await LiveBan.create({
      userId: opts.userId,
      bannedBy: opts.adminId,
      reason: opts.reason || 'Banned from live streaming',
      banType: opts.banType || 'permanent',
      expiresAt: opts.expiresAt ? new Date(opts.expiresAt) : undefined,
      status: 'active',
    });

    if (opts.endActiveRooms !== false) {
      const activeRooms = await Room.find({ hostId: opts.userId, status: 'live' });
      for (const room of activeRooms) {
        try {
          await this.liveStreamService.endLiveStream(opts.userId, room.channelName);
        } catch {
          room.status = 'ended';
          room.endedAt = new Date();
          await room.save();
        }
      }
    }

    const notification = await AdminNotification.create({
      type: 'live_ban',
      title: 'User banned from live',
      message: `${user.name || user.email || user.userId} was banned from live streaming. Reason: ${ban.reason}`,
      meta: {
        userId: user._id,
        uniqueId: user.userId,
        banId: ban._id,
        reason: ban.reason,
      },
      isRead: false,
    });

    const populated = await LiveBan.findById(ban._id)
      .populate({
        path: 'userId',
        select: 'userId name email profileImage country countryId',
        populate: [{ path: 'profileImage' }, { path: 'countryId' }],
      })
      .populate({ path: 'bannedBy', select: 'name email userId' });

    return { ban: populated, notification };
  }

  public async unbanUser(banId: string) {
    if (!mongoose.Types.ObjectId.isValid(banId)) throw new Error('Invalid ban ID');
    const ban = await LiveBan.findById(banId);
    if (!ban) throw new Error('Ban not found');
    ban.status = 'lifted';
    await ban.save();
    return ban;
  }

  public async getBans(opts: { page?: number; limit?: number; search?: string; status?: string }) {
    const page = opts.page || 1;
    const limit = opts.limit || 10;
    const query: any = {};

    if (opts.status && opts.status !== 'all') {
      query.status = opts.status;
    }

    if (opts.search?.trim()) {
      const hostIds = await this.resolveHostIdsBySearch(opts.search);
      if (hostIds && hostIds.length > 0) {
        query.userId = { $in: hostIds };
      } else {
        return {
          bans: [],
          pagination: { total: 0, page, limit, totalPages: 1 },
        };
      }
    }

    const [bans, total] = await Promise.all([
      LiveBan.find(query)
        .populate({
          path: 'userId',
          select: 'userId name email profileImage country countryId',
          populate: [{ path: 'profileImage' }, { path: 'countryId' }],
        })
        .populate({ path: 'bannedBy', select: 'name email userId' })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      LiveBan.countDocuments(query),
    ]);

    return {
      bans,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  public async getBanStats() {
    const now = new Date();
    await LiveBan.updateMany(
      { status: 'active', banType: 'temporary', expiresAt: { $lte: now } },
      { $set: { status: 'expired' } }
    );

    const [totalBanned, permanentBans, temporaryBans, activeBans, expiredBans] = await Promise.all([
      LiveBan.countDocuments({}),
      LiveBan.countDocuments({ banType: 'permanent' }),
      LiveBan.countDocuments({ banType: 'temporary' }),
      LiveBan.countDocuments({ status: 'active' }),
      LiveBan.countDocuments({ status: 'expired' }),
    ]);

    return { totalBanned, permanentBans, temporaryBans, activeBans, expiredBans };
  }

  public async getNotifications(opts: { page?: number; limit?: number; unreadOnly?: boolean }) {
    const page = opts.page || 1;
    const limit = opts.limit || 20;
    const query: any = {};
    if (opts.unreadOnly) query.isRead = false;

    const [notifications, total, unreadCount] = await Promise.all([
      AdminNotification.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      AdminNotification.countDocuments(query),
      AdminNotification.countDocuments({ isRead: false }),
    ]);

    return {
      notifications,
      unreadCount,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  public async markNotificationRead(id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) throw new Error('Invalid notification ID');
    const n = await AdminNotification.findByIdAndUpdate(id, { isRead: true }, { new: true });
    if (!n) throw new Error('Notification not found');
    return n;
  }

  public async markAllNotificationsRead() {
    await AdminNotification.updateMany({ isRead: false }, { $set: { isRead: true } });
    return { success: true };
  }
}
