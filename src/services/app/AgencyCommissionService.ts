import { Service, Inject } from 'typedi';
import mongoose from 'mongoose';
import { isBefore } from 'date-fns';
import Agency from '../../models/Agency';
import AgencyHost from '../../models/AgencyHost';
import AgencyCommission from '../../models/AgencyCommission';
import AgencySettlement from '../../models/AgencySettlement';
import CommissionSlab from '../../models/CommissionSlab';
import HostVerifiedEarning, { EarningInvalidReason } from '../../models/HostVerifiedEarning';
import User from '../../models/User';
import CoinHistory from '../../models/CoinHistory';
import { AppSettingService } from '../common/AppSettingService';
import AppLogger from '../../api/loaders/logger';
import {
  AGENCY_WEEK_STARTS_ON,
  endOfIstWeek,
  getIstDayOfWeek,
  last7IstDays,
  lastCompletedAgencyWeek,
  nextIstWeekday,
  startOfIstDay,
  startOfIstWeek,
} from '../../utils/istTime';

export interface GiftEarningInput {
  hostUserId: string;
  senderUserId: string;
  beansAmount: number;
  giftTransactionId?: string;
  rechargeTransactionId?: string;
  isSuspicious?: boolean;
  isRefunded?: boolean;
  isChargeback?: boolean;
  isCancelled?: boolean;
}

export interface AgencyDashboardStats {
  totalHosts: number;
  activeHosts: number;
  totalHostEarnings: number;
  currentCommissionRate: number;
  pendingCommission: number;
  thisWeekCommission: number;
  lastSettlementDate: Date | null;
  nextSettlementDate: Date | null;
  currentCycleStart?: Date | null;
  currentCycleEnd?: Date | null;
  isFrozen: boolean;
  isCommissionHeld: boolean;
  slabProgress?: {
    currentCommissionRate: number;
    currentSlabName?: string | null;
    weeklyEligibleBeans: number;
    nextSlabMinEarnings: number | null;
    nextSlabRate: number | null;
    nextSlabName?: string | null;
    remainingBeans: number;
    progressPercentage: number;
  };
}

@Service()
export class AgencyCommissionService {
  constructor(@Inject() private appSettingService: AppSettingService) { }

  public async getSettlementWeekday(): Promise<number> {
    const day = Number(await this.appSettingService.getSettingValue('agency_settlement_day'));
    return Number.isFinite(day) ? day : AGENCY_WEEK_STARTS_ON;
  }

  public getCycleStart(date: Date = new Date()): Date {
    return startOfIstWeek(date, AGENCY_WEEK_STARTS_ON);
  }

  public getCycleEnd(date: Date = new Date()): Date {
    return endOfIstWeek(date, AGENCY_WEEK_STARTS_ON);
  }

  public getNextSettlementDate(from: Date = new Date(), weekday: number = AGENCY_WEEK_STARTS_ON): Date {
    const today = startOfIstDay(from);
    const next = nextIstWeekday(from, weekday);
    if (getIstDayOfWeek(from) === weekday) return today;
    return next;
  }

  private async ensureAgencyCycle(agency: InstanceType<typeof Agency>) {
    const cycleStart = this.getCycleStart();
    const currentStart = agency.currentCycleStart ? new Date(agency.currentCycleStart) : null;
    if (!currentStart || currentStart.getTime() < cycleStart.getTime()) {
      if (currentStart && (agency.thisWeekHostEarnings > 0 || agency.pendingCommission > 0)) {
        agency.frozenWeekHostEarnings = agency.thisWeekHostEarnings;
        agency.lastCompletedCycleStart = currentStart;
      }
      agency.currentCycleStart = cycleStart;
      agency.thisWeekHostEarnings = 0;
      agency.thisWeekCommission = 0;
    }
    const weekday = await this.getSettlementWeekday();
    if (!agency.nextSettlementDate) {
      agency.nextSettlementDate = this.getNextSettlementDate(new Date(), weekday);
    }
    await agency.save();
  }

  public async resolveCommissionRate(
    weekEarnings: number,
    agency?: InstanceType<typeof Agency> | null
  ): Promise<number> {
    if (agency?.useAgencyCommissionRate) {
      return agency.commissionRate ?? 10;
    }

    const useSlabs = await this.appSettingService.getSettingValue('agency_use_commission_slabs');
    if (useSlabs !== false) {
      const slabs = await CommissionSlab.find({ isActive: true }).sort({ sortOrder: 1, minEarnings: 1 });
      if (slabs.length > 0) {
        for (const slab of slabs) {
          const withinMin = weekEarnings >= slab.minEarnings;
          const withinMax = slab.maxEarnings == null || weekEarnings <= slab.maxEarnings;
          if (withinMin && withinMax) {
            return slab.percentage;
          }
        }
        const highest = slabs[slabs.length - 1];
        if (weekEarnings > (highest.maxEarnings ?? highest.minEarnings)) {
          return highest.percentage;
        }
      }
    }

    const globalRate = await this.appSettingService.getSettingValue('agency_global_commission_rate');
    if (globalRate != null) return Number(globalRate);

    return agency?.commissionRate ?? 10;
  }

  /**
   * Calculate all eligible host earnings for an agency during a cycle
   * Strictly includes Agency Owner Self ID as an eligible host/member!
   * Counts User Gifting + Voice Calls + Video Calls; Excludes Platform Rewards.
   */
  public async calculateAgencyWeeklyEarnings(
    agencyId: string,
    cycleStart: Date,
    cycleEnd: Date
  ): Promise<{
    totalEligibleBeans: number;
    giftingBeans: number;
    voiceCallBeans: number;
    videoCallBeans: number;
    hostCount: number;
    currentSlabName?: string;
    warning?: string;
  }> {
    const breakdown = await this.getAgencyHostEarningBreakdown(agencyId, cycleStart, cycleEnd);
    return {
      totalEligibleBeans: breakdown.totalEligibleBeans,
      giftingBeans: breakdown.totalGifting,
      voiceCallBeans: breakdown.totalVoice,
      videoCallBeans: breakdown.totalVideo,
      hostCount: breakdown.hosts.length,
      currentSlabName: breakdown.currentSlabName,
      warning: breakdown.warning,
    };
  }

  /**
   * Get host-by-host breakdown for an agency
   * Includes Owner Self ID clearly labelled "Agency Owner - Self Host"
   */
  public async getAgencyHostEarningBreakdown(
    agencyId: string,
    cycleStart: Date,
    cycleEnd: Date
  ): Promise<{
    hosts: Array<{
      hostId: string;
      numericId: number;
      name: string;
      avatar?: string;
      isOwnerSelfHost: boolean;
      roleLabel: string;
      giftingBeans: number;
      voiceCallBeans: number;
      videoCallBeans: number;
      platformRewardsExcluded: number;
      netEligibleBeans: number;
    }>;
    totalEligibleBeans: number;
    totalGifting: number;
    totalVoice: number;
    totalVideo: number;
    currentSlabName?: string;
    warning?: string;
  }> {
    const agency = await Agency.findById(agencyId);
    if (!agency) throw new Error('Agency not found');

    // 1. Get all accepted agency hosts
    const memberships = await AgencyHost.find({
      agencyId: agency._id,
      status: 'ACCEPTED',
    }).populate('userId', 'userId name profileImage').lean();

    const hostMap = new Map<string, any>();
    for (const m of memberships) {
      if (m.userId && (m.userId as any)._id) {
        hostMap.set((m.userId as any)._id.toString(), {
          user: m.userId,
          isOwner: false,
        });
      }
    }

    // 2. Section I & A.2: Agency owner ka Self ID bhi usi agency ka host/member hoga
    const ownerIdStr = agency.creatorId.toString();
    const ownerUser = await User.findById(agency.creatorId).select('userId name profileImage').lean();
    if (ownerUser) {
      hostMap.set(ownerIdStr, {
        user: ownerUser,
        isOwner: true,
      });
    }

    // 3. For each host, calculate Gifting + Voice Calls + Video Calls between cycleStart and cycleEnd
    const hostBreakdownList: any[] = [];
    let totalEligibleBeans = 0;
    let totalGifting = 0;
    let totalVoice = 0;
    let totalVideo = 0;

    for (const [uidStr, item] of hostMap.entries()) {
      const userObjId = new mongoose.Types.ObjectId(uidStr);

      // Gifting Beans (gift_received, charm_received)
      const giftAgg = await CoinHistory.aggregate([
        {
          $match: {
            userId: userObjId,
            amount: { $gt: 0 },
            type: { $in: ['gift_received', 'charm_received'] },
            createdAt: { $gte: cycleStart, $lte: cycleEnd },
          },
        },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]);
      const giftingBeans = giftAgg[0]?.total || 0;

      // Voice Call Beans (call_income with audio context)
      const voiceAgg = await CoinHistory.aggregate([
        {
          $match: {
            userId: userObjId,
            amount: { $gt: 0 },
            type: 'call_income',
            contextType: 'audio_call',
            createdAt: { $gte: cycleStart, $lte: cycleEnd },
          },
        },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]);
      const voiceCallBeans = voiceAgg[0]?.total || 0;

      // Video Call Beans (call_income with video context or general call_income)
      const videoAgg = await CoinHistory.aggregate([
        {
          $match: {
            userId: userObjId,
            amount: { $gt: 0 },
            type: 'call_income',
            contextType: { $ne: 'audio_call' },
            createdAt: { $gte: cycleStart, $lte: cycleEnd },
          },
        },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]);
      const videoCallBeans = videoAgg[0]?.total || 0;

      // Platform rewards: explicitly 0 towards eligible commission
      const platformRewardsExcluded = 0;
      const netEligibleBeans = giftingBeans + voiceCallBeans + videoCallBeans;

      totalEligibleBeans += netEligibleBeans;
      totalGifting += giftingBeans;
      totalVoice += voiceCallBeans;
      totalVideo += videoCallBeans;

      hostBreakdownList.push({
        hostId: uidStr,
        numericId: item.user?.userId,
        name: item.user?.name || (item.isOwner ? 'Agency Owner' : 'Host'),
        avatar: item.user?.profileImage?.url || null,
        isOwnerSelfHost: item.isOwner,
        roleLabel: item.isOwner ? 'Agency Owner - Self Host' : 'Host',
        giftingBeans,
        voiceCallBeans,
        videoCallBeans,
        platformRewardsExcluded,
        netEligibleBeans,
      });
    }

    // Sort: Owner Self ID on top, then by net eligible beans DESC
    hostBreakdownList.sort((a, b) => {
      if (a.isOwnerSelfHost && !b.isOwnerSelfHost) return -1;
      if (!a.isOwnerSelfHost && b.isOwnerSelfHost) return 1;
      return b.netEligibleBeans - a.netEligibleBeans;
    });

    // Determine current slab name and check boundary/warning
    let currentSlabName = 'No Slab';
    let warning = undefined;

    const slabs = await CommissionSlab.find({ isActive: true }).sort({ minEarnings: 1 }).lean();
    if (slabs.length > 0) {
      let matchedSlab = null;
      for (const slab of slabs) {
        const withinMin = totalEligibleBeans >= slab.minEarnings;
        const withinMax = slab.isUnlimited || slab.maxEarnings == null || totalEligibleBeans <= slab.maxEarnings;
        if (withinMin && withinMax) {
          matchedSlab = slab;
          break;
        }
      }

      if (matchedSlab) {
        currentSlabName = `${matchedSlab.name} (${matchedSlab.percentage}%)`;
      } else {
        const highest = slabs[slabs.length - 1];
        if (totalEligibleBeans > (highest.maxEarnings ?? highest.minEarnings) && !highest.isUnlimited) {
          warning = 'Slab not configured for this volume';
          currentSlabName = 'Above Maximum Slab (Warning)';
        }
      }
    }

    return {
      hosts: hostBreakdownList,
      totalEligibleBeans,
      totalGifting,
      totalVoice,
      totalVideo,
      currentSlabName,
      warning,
    };
  }

  private async validateGiftEarning(
    agency: InstanceType<typeof Agency>,
    input: GiftEarningInput
  ): Promise<{ valid: boolean; reason?: EarningInvalidReason }> {
    if (agency.isFrozen) return { valid: false, reason: 'agency_frozen' };
    if (agency.isCommissionHeld) return { valid: false, reason: 'commission_held' };
    if (input.beansAmount <= 0) return { valid: false, reason: 'suspicious_gift' };
    if (input.hostUserId === input.senderUserId) return { valid: false, reason: 'self_gifting' };
    if (input.isSuspicious) return { valid: false, reason: 'suspicious_gift' };
    if (input.isRefunded) return { valid: false, reason: 'refunded_recharge' };
    if (input.isChargeback) return { valid: false, reason: 'chargeback' };
    if (input.isCancelled) return { valid: false, reason: 'cancelled_payment' };

    const [sender, hostMembership] = await Promise.all([
      User.findById(input.senderUserId).select('isBlocked'),
      AgencyHost.findOne({
        agencyId: agency._id,
        userId: input.hostUserId,
        status: 'ACCEPTED',
      }),
    ]);

    if (!hostMembership) return { valid: false, reason: 'suspicious_gift' };
    if (sender?.isBlocked) return { valid: false, reason: 'blocked_user' };

    return { valid: true };
  }

  private async recalculateAgencyCommission(agency: InstanceType<typeof Agency>) {
    const rate = await this.resolveCommissionRate(agency.thisWeekHostEarnings, agency);
    const commission = Number(((agency.thisWeekHostEarnings * rate) / 100).toFixed(2));

    agency.thisWeekCommission = commission;
    agency.pendingCommission = commission;
    agency.totalEarnings = agency.thisWeekHostEarnings;
    await agency.save();

    return { rate, commission };
  }

  public async tryRecordVerifiedHostEarning(input: GiftEarningInput) {
    try {
      return await this.recordVerifiedHostEarning(input);
    } catch (err) {
      AppLogger.warn(
        `[AgencyCommission] Skip host earning for ${input.hostUserId}: ${(err as Error).message}`
      );
      return null;
    }
  }

  public async recordVerifiedHostEarning(input: GiftEarningInput) {
    const hostMembership = await AgencyHost.findOne({
      userId: input.hostUserId,
      status: 'ACCEPTED',
    });
    if (!hostMembership) {
      return null;
    }

    const agency = await Agency.findById(hostMembership.agencyId);
    if (!agency || agency.status !== 'approved') {
      throw new Error('Agency not found or not approved');
    }

    await this.ensureAgencyCycle(agency);

    const validation = await this.validateGiftEarning(agency, input);
    const cycleStart = agency.currentCycleStart;

    const earning = await HostVerifiedEarning.create({
      agencyId: agency._id,
      hostUserId: input.hostUserId,
      senderUserId: input.senderUserId,
      beansAmount: input.beansAmount,
      giftTransactionId: input.giftTransactionId,
      rechargeTransactionId: input.rechargeTransactionId,
      isValid: validation.valid,
      invalidReason: validation.reason,
      cycleStart,
    });

    if (!validation.valid) {
      return { earning, commissionAccrued: 0, rate: 0 };
    }

    const previousCommission = agency.thisWeekCommission;
    agency.thisWeekHostEarnings += input.beansAmount;
    const { rate, commission } = await this.recalculateAgencyCommission(agency);
    const commissionDelta = Number((commission - previousCommission).toFixed(2));

    if (commissionDelta > 0) {
      await AgencyCommission.create({
        agencyId: agency._id,
        hostUserId: input.hostUserId,
        amount: commissionDelta,
        commissionRate: rate,
        hostEarningsAmount: input.beansAmount,
        type: 'accrual',
        status: agency.isCommissionHeld ? 'held' : 'pending',
        cycleStart,
        description: `Commission accrual from host earning of ${input.beansAmount} beans at ${rate}%`,
      });
      const roundedDeduction = Math.round(commissionDelta);
      if (roundedDeduction > 0) {
        await User.findByIdAndUpdate(input.hostUserId, { $inc: { beans: -roundedDeduction } });
        await CoinHistory.create({
          userId: new mongoose.Types.ObjectId(input.hostUserId),
          relatedUserId: agency.creatorId,
          amount: -roundedDeduction,
          type: 'agency_commission_deduction',
          wallet: 'beans',
          description: `Agency commission deduction (${rate}% cut: -${roundedDeduction} beans) for agency '${agency.name}'`,
        });
        AppLogger.info(`[AgencyCommission] Deducted ${roundedDeduction} beans from host ${input.hostUserId} for agency '${agency.name}' (Rate: ${rate}%)`); } /*
      }
      });
    }

*/ } return { earning, commissionAccrued: commissionDelta, rate, totalPendingCommission: commission };
  }

  public async getActiveHostCount(agencyId: mongoose.Types.ObjectId, cycleStart: Date): Promise<number> {
    const activeHostIds = await HostVerifiedEarning.distinct('hostUserId', {
      agencyId,
      cycleStart,
      isValid: true,
      beansAmount: { $gt: 0 },
    });
    return activeHostIds.length;
  }

  public async getDashboardStats(agencyId: string, ownerUserId: string): Promise<AgencyDashboardStats> {
    const agency = await Agency.findById(agencyId);
    if (!agency) {
      throw new Error('Agency not found');
    }
    const isOwner = agency.creatorId.toString() === ownerUserId;
    const isHost = isOwner ? true : await AgencyHost.exists({ agencyId: agency._id, userId: ownerUserId, status: { $in: ['ACCEPTED', 'approved'] } });
    if (!isOwner && !isHost) {
      throw new Error('Unauthorized or agency not found');
    }

    await this.ensureAgencyCycle(agency);

    const [totalHosts, activeHosts, rate] = await Promise.all([
      AgencyHost.countDocuments({ agencyId: agency._id, status: 'ACCEPTED' }),
      this.getActiveHostCount(agency._id, agency.currentCycleStart),
      this.resolveCommissionRate(agency.thisWeekHostEarnings, agency),
    ]);

    const slabProgress = await this.getSlabProgress(agency.thisWeekHostEarnings, agency);

    return {
      totalHosts,
      activeHosts,
      totalHostEarnings: agency.thisWeekHostEarnings,
      currentCommissionRate: rate,
      pendingCommission: agency.pendingCommission,
      thisWeekCommission: agency.thisWeekCommission,
      lastSettlementDate: agency.lastSettlementDate ?? null,
      nextSettlementDate: agency.nextSettlementDate ?? this.getNextSettlementDate(),
      currentCycleStart: agency.currentCycleStart ?? null,
      currentCycleEnd: agency.currentCycleStart ? this.getCycleEnd(agency.currentCycleStart) : null,
      isFrozen: agency.isFrozen,
      isCommissionHeld: agency.isCommissionHeld,
      slabProgress,
    };
  }

  public async getSlabProgress(
    weekEarnings: number,
    agency?: InstanceType<typeof Agency> | null
  ) {
    const currentCommissionRate = await this.resolveCommissionRate(weekEarnings, agency);
    const slabs = await CommissionSlab.find({ isActive: true }).sort({ sortOrder: 1, minEarnings: 1 });
    const currentSlab = slabs
      .filter((s) => weekEarnings >= s.minEarnings && (s.isUnlimited || s.maxEarnings == null || weekEarnings <= s.maxEarnings))
      .pop();
    const nextSlab = slabs.find((slab) => weekEarnings < slab.minEarnings);
    const remainingBeans = nextSlab ? Math.max(0, nextSlab.minEarnings - weekEarnings) : 0;
    const progressPercentage = nextSlab && nextSlab.minEarnings > 0
      ? Math.min(100, Math.max(0, Math.round((weekEarnings / nextSlab.minEarnings) * 100)))
      : (slabs.length > 0 ? 100 : 0);

    return {
      currentCommissionRate,
      currentSlabName: currentSlab?.name ?? null,
      weeklyEligibleBeans: weekEarnings,
      nextSlabMinEarnings: nextSlab?.minEarnings ?? null,
      nextSlabRate: nextSlab?.percentage ?? null,
      nextSlabName: nextSlab?.name ?? null,
      remainingBeans,
      progressPercentage,
    };
  }

  public async settleAgency(
    agencyId: string,
    type: 'auto' | 'manual' = 'manual',
    notes?: string
  ) {
    const agency = await Agency.findById(agencyId);
    if (!agency) throw new Error('Agency not found');
    if (agency.isFrozen) throw new Error('Agency account is frozen');
    if (agency.isCommissionHeld) throw new Error('Agency commission is on hold');

    const amount = Math.round(agency.pendingCommission);
    if (amount <= 0) {
      return { settled: false, amount: 0, message: 'No pending commission to settle' };
    }

    const hostEarnings =
      (agency.frozenWeekHostEarnings || 0) > 0
        ? agency.frozenWeekHostEarnings
        : agency.thisWeekHostEarnings;
    const rate = await this.resolveCommissionRate(hostEarnings, agency);
    const periodStart = agency.lastCompletedCycleStart || agency.currentCycleStart;
    const periodEnd = this.getCycleEnd(periodStart);

    const existing = await AgencySettlement.findOne({
      agencyId: agency._id,
      periodStart,
      status: 'completed',
    });
    if (existing) {
      return { settled: false, amount: 0, message: 'This week has already been settled' };
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const settlement = await AgencySettlement.create([{
        agencyId: agency._id,
        ownerUserId: agency.creatorId,
        amount,
        commissionRate: rate,
        hostEarningsTotal: hostEarnings,
        periodStart,
        periodEnd,
        type,
        status: 'completed',
        notes,
      }], { session });

      await User.findByIdAndUpdate(
        agency.creatorId,
        { $inc: { beans: amount } },
        { session }
      );

      await CoinHistory.create([{
        userId: agency.creatorId,
        amount,
        type: 'agency_commission',
        wallet: 'beans',
        description: `Agency commission settlement (${type})`,
        transactionId: settlement[0]._id.toString(),
      }], { session });

      await AgencyCommission.create([{
        agencyId: agency._id,
        amount,
        commissionRate: rate,
        hostEarningsAmount: hostEarnings,
        type: 'settlement',
        status: 'settled',
        cycleStart: periodStart,
        cycleEnd: periodEnd,
        settlementId: settlement[0]._id,
        description: `Weekly commission settlement of ${amount} beans`,
      }], { session });

      await AgencyCommission.updateMany(
        { agencyId: agency._id, status: 'pending', type: 'accrual' },
        { status: 'settled', cycleEnd: periodEnd },
        { session }
      );

      const weekday = await this.getSettlementWeekday();
      const nextCycleStart = this.getCycleStart();
      agency.pendingCommission = 0;
      agency.thisWeekHostEarnings = 0;
      agency.thisWeekCommission = 0;
      agency.frozenWeekHostEarnings = 0;
      agency.lastCompletedCycleStart = undefined;
      agency.currentCycleStart = nextCycleStart;
      agency.lastSettlementDate = new Date();
      agency.nextSettlementDate = this.getNextSettlementDate(new Date(), weekday);
      await agency.save({ session });

      await session.commitTransaction();

      AppLogger.info(`Agency ${agencyId} settled ${amount} beans (${type})`);

      return {
        settled: true,
        amount,
        settlement: settlement[0],
        message: `${amount} beans transferred to agency owner balance`,
      };
    } catch (error: any) {
      await session.abortTransaction();
      if (error?.code === 11000) {
        return { settled: false, amount: 0, message: 'This week has already been settled' };
      }
      throw error;
    } finally {
      session.endSession();
    }
  }

  public async runAutoSettlement() {
    const enabled = await this.appSettingService.getSettingValue('agency_auto_settlement_enabled');
    if (!enabled) return { processed: 0, message: 'Auto settlement disabled' };

    const weekday = await this.getSettlementWeekday();
    const todayIst = getIstDayOfWeek();
    if (todayIst !== weekday) {
      return { processed: 0, message: `Settlement runs on weekday ${weekday} (IST) only` };
    }

    const today = startOfIstDay();
    const agencies = await Agency.find({
      status: 'approved',
      isFrozen: false,
      isCommissionHeld: false,
      pendingCommission: { $gt: 0 },
    });

    let processed = 0;
    for (const agency of agencies) {
      if (agency.nextSettlementDate && isBefore(today, startOfIstDay(agency.nextSettlementDate))) {
        continue;
      }
      try {
        await this.ensureAgencyCycle(agency);
        const result = await this.settleAgency(agency._id.toString(), 'auto');
        if (result.settled) processed += 1;
      } catch (err) {
        AppLogger.error(`Auto settlement failed for agency ${agency._id}`, err);
      }
    }

    return { processed, message: `Settled ${processed} agencies` };
  }

  public async getCommissionLogs(
    agencyId: string,
    page = 1,
    limit = 20,
    filters: { type?: string; status?: string } = {}
  ) {
    const query: Record<string, unknown> = { agencyId };
    if (filters.type) query.type = filters.type;
    if (filters.status) query.status = filters.status;

    const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
      AgencyCommission.find(query)
        .populate('hostUserId', 'name userId profileImage')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      AgencyCommission.countDocuments(query),
    ]);

    return {
      data: logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  public async getSettlementHistory(agencyId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [settlements, total] = await Promise.all([
      AgencySettlement.find({ agencyId })
        .populate('ownerUserId', 'name userId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      AgencySettlement.countDocuments({ agencyId }),
    ]);

    return {
      data: settlements,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  public async getCompletedPeriodMetrics(agencyId: mongoose.Types.ObjectId) {
    const { start, end } = lastCompletedAgencyWeek();
    const seven = last7IstDays();

    const [weekAgg, earningHosts, settledAgg] = await Promise.all([
      HostVerifiedEarning.aggregate([
        {
          $match: {
            agencyId,
            isValid: true,
            createdAt: { $gte: start, $lte: end },
          },
        },
        { $group: { _id: null, total: { $sum: '$beansAmount' } } },
      ]),
      HostVerifiedEarning.distinct('hostUserId', {
        agencyId,
        isValid: true,
        beansAmount: { $gt: 0 },
        createdAt: { $gte: start, $lte: end },
      }),
      AgencyCommission.aggregate([
        {
          $match: {
            agencyId,
            type: 'settlement',
            status: 'settled',
            createdAt: { $gte: seven.start, $lte: seven.end },
          },
        },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);

    const last7DaysEarnings = weekAgg[0]?.total || 0;
    const last7DaysCommission = settledAgg[0]?.total || 0;
    const agency = await Agency.findById(agencyId); const commissionRate = await this.resolveCommissionRate(last7DaysEarnings, agency);
    const myCommission = Number(((last7DaysEarnings * commissionRate) / 100).toFixed(2));
    const slabProgress = await this.getSlabProgress(last7DaysEarnings, agency);

    return {
      periodStart: start,
      periodEnd: end,
      last7DaysEarnings,
      last7DaysCommission,
      commissionRate,
      myCommission,
      earningHostNo: earningHosts.length,
      slabProgress,
      inviteAgencyEarning: 0,
      inviteAgencyWithEarning: 0,
      inviteCommission: 0,
    };
  }
}
