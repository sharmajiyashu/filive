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
  isFrozen: boolean;
  isCommissionHeld: boolean;
  slabProgress?: {
    currentCommissionRate: number;
    weeklyEligibleBeans: number;
    nextSlabMinEarnings: number | null;
    nextSlabRate: number | null;
    remainingBeans: number;
  };
}

@Service()
export class AgencyCommissionService {
  constructor(@Inject() private appSettingService: AppSettingService) {}

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
    }

    return { earning, commissionAccrued: commissionDelta, rate, totalPendingCommission: commission };
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
    if (!agency || agency.creatorId.toString() !== ownerUserId) {
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
    const nextSlab = slabs.find((slab) => weekEarnings < slab.minEarnings);
    const remainingBeans = nextSlab ? Math.max(0, nextSlab.minEarnings - weekEarnings) : 0;

    return {
      currentCommissionRate,
      weeklyEligibleBeans: weekEarnings,
      nextSlabMinEarnings: nextSlab?.minEarnings ?? null,
      nextSlabRate: nextSlab?.percentage ?? null,
      remainingBeans,
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

    const amount = agency.pendingCommission;
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
    const commissionRate = await this.resolveCommissionRate(last7DaysEarnings);
    const myCommission = Number(((last7DaysEarnings * commissionRate) / 100).toFixed(2));
    const slabProgress = await this.getSlabProgress(last7DaysEarnings);

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
