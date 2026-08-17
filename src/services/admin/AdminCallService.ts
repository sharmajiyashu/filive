import { Service } from 'typedi';
import mongoose from 'mongoose';
import Call from '../../models/Call';
import User from '../../models/User';

const USER_SELECT = 'name userId email profileImage';
const CALL_EXCLUDE = '-agoraToken -callerAgoraToken -receiverAgoraToken -callerAgoraAccountToken -receiverAgoraAccountToken';

const ONGOING_STATUSES = ['initiated', 'accepted'];
const COMPLETED_STATUS = 'ended';

@Service()
export class AdminCallService {
  private formatDuration(seconds?: number): string {
    const total = Math.max(0, Math.floor(seconds || 0));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  private startOfToday(): Date {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return start;
  }

  private async resolveUserIdsBySearch(search?: string): Promise<mongoose.Types.ObjectId[]> {
    if (!search?.trim()) return [];
    const term = search.trim();
    const or: Record<string, unknown>[] = [
      { name: { $regex: term, $options: 'i' } },
      { email: { $regex: term, $options: 'i' } },
    ];
    const asNum = Number(term);
    if (!Number.isNaN(asNum)) {
      or.push({ userId: asNum });
    }
    if (mongoose.Types.ObjectId.isValid(term)) {
      or.push({ _id: new mongoose.Types.ObjectId(term) });
    }
    const users = await User.find({ $or: or }).select('_id');
    return users.map((u) => u._id as mongoose.Types.ObjectId);
  }

  private buildListQuery(params: { search?: string; status?: string; type?: string; userIds: mongoose.Types.ObjectId[] }) {
    const query: Record<string, unknown> = {};
    const status = params.status?.trim().toLowerCase();
    const type = params.type?.trim().toLowerCase();

    if (status === 'ongoing') {
      query.status = { $in: ONGOING_STATUSES };
    } else if (status === 'completed') {
      query.status = COMPLETED_STATUS;
    } else if (status && status !== 'all') {
      query.status = status;
    }

    if (type === 'voice' || type === 'video') {
      query.callType = type;
    }

    const search = params.search?.trim();
    if (search) {
      const or: Record<string, unknown>[] = [];
      if (params.userIds.length > 0) {
        or.push({ callerId: { $in: params.userIds } });
        or.push({ receiverId: { $in: params.userIds } });
      }
      if (mongoose.Types.ObjectId.isValid(search)) {
        or.push({ _id: new mongoose.Types.ObjectId(search) });
      }
      or.push({ roomId: { $regex: search, $options: 'i' } });
      query.$or = or;
    }

    return query;
  }

  private mapCall(call: any) {
    const obj = call.toObject ? call.toObject() : { ...call };
    const caller = obj.callerId && typeof obj.callerId === 'object' ? obj.callerId : null;
    const receiver = obj.receiverId && typeof obj.receiverId === 'object' ? obj.receiverId : null;
    if (caller) caller.uniqueId = caller.userId;
    if (receiver) receiver.uniqueId = receiver.userId;
    return {
      ...obj,
      caller,
      receiver,
      senderCoins: obj.coinsDeducted || 0,
      receiverCoins: obj.coinsEarned || 0,
      adminCoins: obj.platformFee || 0,
      durationLabel: this.formatDuration(obj.duration),
    };
  }

  public async getStats() {
    const startToday = this.startOfToday();
    const [statusCounts, totals, today] = await Promise.all([
      Call.aggregate<{ _id: string; count: number }>([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Call.aggregate<{
        totalCalls: number;
        totalRevenue: number;
        adminRevenue: number;
        receiverRevenue: number;
        avgDuration: number;
      }>([
        {
          $group: {
            _id: null,
            totalCalls: { $sum: 1 },
            totalRevenue: { $sum: { $ifNull: ['$coinsDeducted', 0] } },
            adminRevenue: { $sum: { $ifNull: ['$platformFee', 0] } },
            receiverRevenue: { $sum: { $ifNull: ['$coinsEarned', 0] } },
            avgDuration: { $avg: { $ifNull: ['$duration', 0] } },
          },
        },
      ]),
      Call.aggregate<{ todayCalls: number; todayRevenue: number }>([
        { $match: { createdAt: { $gte: startToday } } },
        {
          $group: {
            _id: null,
            todayCalls: { $sum: 1 },
            todayRevenue: { $sum: { $ifNull: ['$coinsDeducted', 0] } },
          },
        },
      ]),
    ]);

    const byStatus = Object.fromEntries(statusCounts.map((row) => [row._id, row.count]));
    const summary = totals[0];
    const todaySummary = today[0];
    const avgSeconds = summary?.avgDuration || 0;

    return {
      totalCalls: summary?.totalCalls || 0,
      ongoingCalls: (byStatus.initiated || 0) + (byStatus.accepted || 0),
      completedCalls: byStatus.ended || 0,
      missedCalls: byStatus.missed || 0,
      totalRevenue: summary?.totalRevenue || 0,
      adminRevenue: summary?.adminRevenue || 0,
      receiverRevenue: summary?.receiverRevenue || 0,
      todayCalls: todaySummary?.todayCalls || 0,
      todayRevenue: todaySummary?.todayRevenue || 0,
      avgDurationMin: Number((avgSeconds / 60).toFixed(1)),
      avgDurationSec: Math.round(avgSeconds % 60),
    };
  }

  public async list(params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    type?: string;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.max(1, Math.min(100, params.limit || 10));
    const skip = (page - 1) * limit;
    const userIds = await this.resolveUserIdsBySearch(params.search);
    const query = this.buildListQuery({ ...params, userIds });

    const [total, calls] = await Promise.all([
      Call.countDocuments(query),
      Call.find(query)
        .select(CALL_EXCLUDE)
        .populate({ path: 'callerId', select: USER_SELECT, populate: { path: 'profileImage' } })
        .populate({ path: 'receiverId', select: USER_SELECT, populate: { path: 'profileImage' } })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
    ]);

    return {
      calls: calls.map((call) => this.mapCall(call)),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  public async getById(id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new Error('Invalid call ID');
    }
    const call = await Call.findById(id)
      .select(CALL_EXCLUDE)
      .populate({ path: 'callerId', select: USER_SELECT, populate: { path: 'profileImage' } })
      .populate({ path: 'receiverId', select: USER_SELECT, populate: { path: 'profileImage' } });
    if (!call) throw new Error('Call not found');
    return this.mapCall(call);
  }
}
