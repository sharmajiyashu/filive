import { Service, Inject } from 'typedi';
import mongoose from 'mongoose';
import Agency from '../../models/Agency';
import AgencyHost from '../../models/AgencyHost';
import Country from '../../models/Country';
import User from '../../models/User';
import { UserService } from './UserService';
import { AdminAgencyCommissionService } from './AgencyCommissionService';
import { FirebasePushService } from '../common/FirebasePushService';

@Service()
export class AgencyService {
  constructor(
    @Inject() private userService: UserService,
    @Inject() private commissionService: AdminAgencyCommissionService,
    @Inject() private firebasePushService: FirebasePushService,
  ) {}

  private async generateAgencyCode(): Promise<string> {
    for (let i = 0; i < 10; i++) {
      const code = `AG${Math.floor(100000 + Math.random() * 900000)}`;
      const exists = await Agency.findOne({ agencyCode: code }).select('_id').lean();
      if (!exists) return code;
    }
    return `AG${Date.now().toString().slice(-8)}`;
  }

  private populateAgency(query: any) {
    return query
      .populate('countryId', 'name code flag')
      .populate('creatorId', 'name email profileImage userId mobile coins')
      .populate('bdId', 'name email profileImage userId mobile')
      .populate('logo');
  }

  public async getStats() {
    const [totalAgencies, activeAgencies, totalHosts, earningsAgg] = await Promise.all([
      Agency.countDocuments({}),
      Agency.countDocuments({ status: 'approved' }),
      AgencyHost.countDocuments({ status: { $in: ['ACCEPTED', 'PENDING', 'SUSPENDED'] } }),
      Agency.aggregate([
        { $group: { _id: null, total: { $sum: '$totalEarnings' } } },
      ]),
    ]);

    return {
      totalAgencies,
      activeAgencies,
      totalHosts,
      totalAgencyEarnings: earningsAgg[0]?.total ?? 0,
    };
  }

  public async getAgencies(
    pagination: { page: number; limit: number },
    filters: { status?: string; search?: string }
  ) {
    const { page, limit } = pagination;
    const { status, search } = filters;

    const query: any = {};

    if (status && status !== 'all') {
      query.status = status;
    }

    if (search) {
      const regex = { $regex: search, $options: 'i' };
      const or: any[] = [
        { name: regex },
        { email: regex },
        { mobile: regex },
        { agencyCode: regex },
      ];

      const [matchingCountries, matchingUsers] = await Promise.all([
        Country.find({ name: regex }).select('_id').lean(),
        User.find({
          $or: [
            { name: regex },
            { email: regex },
            { mobile: regex },
            ...(Number.isFinite(Number(search)) ? [{ userId: Number(search) }] : []),
          ],
        })
          .select('_id')
          .lean(),
      ]);

      if (matchingCountries.length) {
        or.push({ countryId: { $in: matchingCountries.map((c) => c._id) } });
      }
      if (matchingUsers.length) {
        const userIds = matchingUsers.map((u) => u._id);
        or.push({ creatorId: { $in: userIds } }, { bdId: { $in: userIds } });
      }

      query.$or = or;
    }

    const total = await Agency.countDocuments(query);
    const agencies = await this.populateAgency(
      Agency.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)
    );

    const agencyIds = agencies.map((a: any) => a._id);
    const hostCounts = await AgencyHost.aggregate([
      { $match: { agencyId: { $in: agencyIds } } },
      {
        $group: {
          _id: '$agencyId',
          total: { $sum: 1 },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'PENDING'] }, 1, 0] } },
          active: { $sum: { $cond: [{ $eq: ['$status', 'ACCEPTED'] }, 1, 0] } },
          suspended: { $sum: { $cond: [{ $eq: ['$status', 'SUSPENDED'] }, 1, 0] } },
        },
      },
    ]);

    const hostCountMap = new Map(hostCounts.map((h) => [h._id.toString(), h]));

    const enriched = agencies.map((agency: any) => {
      const plain = agency.toObject ? agency.toObject() : agency;
      const counts = hostCountMap.get(plain._id.toString()) || {
        total: 0,
        pending: 0,
        active: 0,
        suspended: 0,
      };
      const hostEarnings = plain.thisWeekHostEarnings || 0;
      const lifetimeEarnings = plain.totalEarnings || 0;
      const netEarnings = Math.max(0, lifetimeEarnings - (plain.pendingCommission || 0));

      return {
        ...plain,
        hostCount: counts.total,
        hostCounts: {
          total: counts.total,
          pending: counts.pending,
          active: counts.active,
          suspended: counts.suspended,
        },
        hostEarnings,
        lifetimeEarnings,
        netEarnings,
      };
    });

    return {
      agencies: enriched,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  public async getAgencyDetails(agencyId: string) {
    const agency = await this.populateAgency(Agency.findById(agencyId));

    if (!agency) {
      throw new Error('Agency not found');
    }

    const hostCounts = await AgencyHost.aggregate([
      { $match: { agencyId: new mongoose.Types.ObjectId(agencyId) } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'PENDING'] }, 1, 0] } },
          active: { $sum: { $cond: [{ $eq: ['$status', 'ACCEPTED'] }, 1, 0] } },
          suspended: { $sum: { $cond: [{ $eq: ['$status', 'SUSPENDED'] }, 1, 0] } },
        },
      },
    ]);

    const counts = hostCounts[0] || { total: 0, pending: 0, active: 0, suspended: 0 };
    const plain = agency.toObject ? agency.toObject() : agency;

    return {
      ...plain,
      hostCount: counts.total,
      hostCounts: {
        total: counts.total,
        pending: counts.pending,
        active: counts.active,
        suspended: counts.suspended,
      },
      hostEarnings: plain.thisWeekHostEarnings || 0,
      lifetimeEarnings: plain.totalEarnings || 0,
      netEarnings: Math.max(0, (plain.totalEarnings || 0) - (plain.pendingCommission || 0)),
    };
  }

  public async createAgency(data: {
    creatorId: string;
    bdId?: string;
    name: string;
    email?: string;
    mobile: string;
    commissionRate?: number;
    countryId: string;
    description?: string;
    logoId?: string;
  }) {
    if (!data.creatorId || !data.name || !data.mobile || !data.countryId) {
      throw new Error('creatorId, name, mobile, and countryId are required');
    }

    const creator = await User.findById(data.creatorId);
    if (!creator) throw new Error('Selected user not found');

    const existingAgency = await Agency.findOne({ creatorId: data.creatorId });
    if (existingAgency) {
      throw new Error('This user already has an agency');
    }

    const country = await Country.findById(data.countryId);
    if (!country) throw new Error('Country not found');

    if (data.bdId) {
      const bd = await User.findById(data.bdId);
      if (!bd) throw new Error('Selected BD user not found');
      if (data.bdId === data.creatorId) {
        throw new Error('BD cannot be the same as the agency owner');
      }
    }

    const commissionRate = Number(data.commissionRate ?? 0);
    if (Number.isNaN(commissionRate) || commissionRate < 0) {
      throw new Error('Commission rate must be at least 0%');
    }

    const agencyCode = await this.generateAgencyCode();

    const agency = await Agency.create({
      name: data.name.trim(),
      email: data.email?.trim() || '',
      mobile: data.mobile.trim(),
      countryId: data.countryId,
      description: data.description?.trim() || '',
      creatorId: data.creatorId,
      bdId: data.bdId || undefined,
      logo: data.logoId || undefined,
      agencyCode,
      commissionRate,
      useAgencyCommissionRate: true,
      status: 'approved',
      isVerified: true,
    });

    return this.getAgencyDetails(agency._id.toString());
  }

  public async updateAgency(
    agencyId: string,
    data: {
      name?: string;
      email?: string;
      mobile?: string;
      commissionRate?: number;
      countryId?: string;
      description?: string;
      logoId?: string;
    }
  ) {
    const agency = await Agency.findById(agencyId);
    if (!agency) throw new Error('Agency not found');

    if (data.name != null) agency.name = data.name.trim();
    if (data.email != null) agency.email = data.email.trim();
    if (data.mobile != null) agency.mobile = data.mobile.trim();
    if (data.description != null) agency.description = data.description.trim();

    if (data.countryId != null) {
      const country = await Country.findById(data.countryId);
      if (!country) throw new Error('Country not found');
      agency.countryId = new mongoose.Types.ObjectId(data.countryId);
    }

    if (data.commissionRate != null) {
      const commissionRate = Number(data.commissionRate);
      if (Number.isNaN(commissionRate) || commissionRate < 0) {
        throw new Error('Commission rate must be at least 0%');
      }
      agency.commissionRate = commissionRate;
      agency.useAgencyCommissionRate = true;
    }

    if (data.logoId) {
      agency.logo = new mongoose.Types.ObjectId(data.logoId);
    }

    await agency.save();
    return this.getAgencyDetails(agencyId);
  }

  public async updateAgencyStatus(agencyId: string, status: 'approved' | 'rejected') {
    const agency = await Agency.findById(agencyId);
    if (!agency) {
      throw new Error('Agency not found');
    }

    agency.status = status;
    if (status === 'approved') {
      agency.isVerified = true;
    }
    await agency.save();

    return this.getAgencyDetails(agencyId);
  }

  public async getAgencyHosts(
    agencyId: string,
    pagination: { page: number; limit: number },
    statusFilter: string = 'all'
  ) {
    const agency = await Agency.findById(agencyId).select('_id');
    if (!agency) throw new Error('Agency not found');

    const query: any = { agencyId };
    const statusMap: Record<string, string> = {
      pending: 'PENDING',
      active: 'ACCEPTED',
      suspended: 'SUSPENDED',
      rejected: 'REJECTED',
    };

    if (statusFilter && statusFilter !== 'all') {
      const mapped = statusMap[statusFilter.toLowerCase()];
      if (!mapped) throw new Error('Invalid host status filter');
      query.status = mapped;
    }

    const { page, limit } = pagination;
    const total = await AgencyHost.countDocuments(query);
    const hosts = await AgencyHost.find(query)
      .populate('userId', 'name email profileImage userId mobile coins isBlocked')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    return {
      hosts,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  public async updateHostStatus(
    agencyId: string,
    hostId: string,
    status: 'ACCEPTED' | 'SUSPENDED' | 'REJECTED' | 'PENDING'
  ) {
    const host = await AgencyHost.findOne({ _id: hostId, agencyId });
    if (!host) throw new Error('Host not found for this agency');

    host.status = status;
    if (status === 'ACCEPTED') {
      host.isVerified = true;
      host.verifiedAt = new Date();
    }
    await host.save();

    return host.populate('userId', 'name email profileImage userId mobile coins isBlocked');
  }

  public async getTransactions(
    agencyId: string,
    page = 1,
    limit = 20,
    filters?: { type?: string; status?: string }
  ) {
    const agency = await Agency.findById(agencyId).select('_id');
    if (!agency) throw new Error('Agency not found');
    return this.commissionService.getCommissionLogs(agencyId, page, limit, filters);
  }

  public async adjustCoins(agencyId: string, amount: number, description?: string) {
    const agency = await Agency.findById(agencyId).select('creatorId name');
    if (!agency) throw new Error('Agency not found');

    const user = await this.userService.adjustUserCoins(
      agency.creatorId.toString(),
      amount,
      description || `Agency coin adjustment for ${agency.name}`
    );

    return {
      agencyId,
      creatorId: agency.creatorId,
      coins: user.coins,
      amount,
    };
  }

  public async sendNotification(
    agencyId: string,
    data: { title: string; message: string; imageUrl?: string }
  ) {
    const agency = await Agency.findById(agencyId)
      .populate('creatorId', 'name userId fcmTokens')
      .select('creatorId name');
    if (!agency) throw new Error('Agency not found');

    const creator: any = agency.creatorId;
    if (!creator?._id) throw new Error('Agency owner not found');

    if (!data.title?.trim() || !data.message?.trim()) {
      throw new Error('Title and message are required');
    }

    const pushData: Record<string, string> = {
      type: 'agency_admin_notification',
      agencyId: agencyId.toString(),
    };
    if (data.imageUrl) pushData.imageUrl = data.imageUrl;

    await this.firebasePushService.notifyUser(creator._id.toString(), {
      title: data.title.trim(),
      body: data.message.trim(),
      data: pushData,
    });

    return {
      agencyId,
      userId: creator._id,
      title: data.title.trim(),
      message: data.message.trim(),
      imageUrl: data.imageUrl || null,
      sent: true,
    };
  }
}
