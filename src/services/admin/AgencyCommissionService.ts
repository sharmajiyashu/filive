import { Service, Inject } from 'typedi';
import mongoose from 'mongoose';
import Agency from '../../models/Agency';
import AgencyHost from '../../models/AgencyHost';
import CommissionSlab, { ICommissionSlab } from '../../models/CommissionSlab';
import AgencySettlementBatch, { IAgencySettlementBatch } from '../../models/AgencySettlementBatch';
import AgencyCommissionAdjustment from '../../models/AgencyCommissionAdjustment';
import AgencyCommissionAuditLog from '../../models/AgencyCommissionAuditLog';
import CoinHistory from '../../models/CoinHistory';
import User from '../../models/User';
import { AppSettingService } from '../common/AppSettingService';
import { AgencyCommissionService } from '../app/AgencyCommissionService';
import { startOfIstWeek, endOfIstWeek, nextIstWeekday } from '../../utils/istTime';

@Service()
export class AdminAgencyCommissionService {
  constructor(
    @Inject() private appSettingService: AppSettingService,
    @Inject() private agencyCommissionService: AgencyCommissionService
  ) {}

  // =========================================================================
  // 1. COMMISSION DASHBOARD OVERVIEW
  // =========================================================================
  public async getDashboardOverview() {
    const cycleStart = this.agencyCommissionService.getCycleStart();
    const cycleEnd = this.agencyCommissionService.getCycleEnd();

    // Get all approved agencies
    const agencies = await Agency.find({ status: 'approved' })
      .select('_id name creatorId thisWeekHostEarnings pendingCommission isFrozen isCommissionHeld lastSettlementDate nextSettlementDate')
      .lean();

    let totalEligibleBeans = 0;
    let totalEstimatedCommission = 0;
    let pendingSettlementAmount = 0;
    let eligibleAgenciesCount = 0;

    for (const agency of agencies) {
      // Calculate current week earnings accurately
      const weeklyEarning = await this.agencyCommissionService.calculateAgencyWeeklyEarnings(
        agency._id.toString(),
        cycleStart,
        cycleEnd
      );

      totalEligibleBeans += weeklyEarning.totalEligibleBeans;

      const rate = await this.agencyCommissionService.resolveCommissionRate(
        weeklyEarning.totalEligibleBeans,
        agency as any
      );

      const estCommission = rate > 0 ? (weeklyEarning.totalEligibleBeans * rate) / 100 : 0;
      totalEstimatedCommission += estCommission;

      if (weeklyEarning.totalEligibleBeans > 0 && rate > 0) {
        eligibleAgenciesCount++;
      }

      pendingSettlementAmount += agency.pendingCommission || estCommission;
    }

    // Total paid commission from completed batches / settlements
    const paidAgg = await AgencySettlementBatch.aggregate([
      { $match: { status: 'settled' } },
      { $group: { _id: null, totalPaid: { $sum: '$totalCommission' } } },
    ]);
    const paidCommission = paidAgg[0]?.totalPaid || 0;

    // Failed settlements count
    const failedBatches = await AgencySettlementBatch.countDocuments({
      status: { $in: ['failed', 'partially_settled'] },
    });

    const settings = await this.getPeriodAndSettlementSettings();
    const nextSettlementDate = this.agencyCommissionService.getNextSettlementDate(
      new Date(),
      settings.settlementDay
    );

    return {
      cycleStart,
      cycleEnd,
      totalEligibleBeans,
      totalEstimatedCommission: Math.round(totalEstimatedCommission * 100) / 100,
      pendingSettlementAmount: Math.round(pendingSettlementAmount * 100) / 100,
      paidCommission: Math.round(paidCommission * 100) / 100,
      eligibleAgenciesCount,
      failedSettlementsCount: failedBatches,
      nextSettlementDate,
      nextSettlementTime: settings.settlementTime,
      timezone: settings.timezone,
      settlementMode: settings.settlementMode,
      commissionUnit: settings.commissionUnit,
    };
  }

  // =========================================================================
  // 2. COMMISSION SLAB SETTINGS
  // =========================================================================
  public async getSlabs() {
    return CommissionSlab.find().sort({ sortOrder: 1, minEarnings: 1 }).lean();
  }

  public async createSlab(
    data: {
      name: string;
      minEarnings: number;
      maxEarnings?: number | null;
      percentage: number;
      effectiveFrom?: Date;
      isUnlimited?: boolean;
      isActive?: boolean;
      sortOrder?: number;
    },
    adminUser?: { _id?: any; name?: string }
  ) {
    if (data.percentage < 0 || data.percentage > 100) {
      throw new Error('Percentage must be between 0 and 100');
    }
    if (data.minEarnings < 0) {
      throw new Error('Minimum eligible beans cannot be negative');
    }
    if (!data.isUnlimited && data.maxEarnings != null && data.maxEarnings < data.minEarnings) {
      throw new Error('Maximum eligible beans must be greater than or equal to minimum beans');
    }

    // Check for gaps / overlaps with existing active slabs
    const existingSlabs = await CommissionSlab.find({ isActive: true }).sort({ minEarnings: 1 }).lean();
    for (const slab of existingSlabs) {
      const slabMax = slab.isUnlimited || slab.maxEarnings == null ? Infinity : slab.maxEarnings;
      const newMax = data.isUnlimited || data.maxEarnings == null ? Infinity : data.maxEarnings;

      const overlap = data.minEarnings <= slabMax && newMax >= slab.minEarnings;
      if (overlap) {
        throw new Error(
          `Slab overlaps with existing slab '${slab.name}' (${slab.minEarnings.toLocaleString()} - ${
            slab.isUnlimited ? 'Unlimited' : slab.maxEarnings?.toLocaleString()
          })`
        );
      }
    }

    const slab = await CommissionSlab.create({
      name: data.name || 'Level 1',
      minEarnings: data.minEarnings,
      maxEarnings: data.isUnlimited ? null : data.maxEarnings,
      percentage: data.percentage,
      effectiveFrom: data.effectiveFrom || new Date(),
      isUnlimited: Boolean(data.isUnlimited),
      isActive: data.isActive !== false,
      sortOrder: data.sortOrder || existingSlabs.length + 1,
    });

    await AgencyCommissionAuditLog.create({
      action: 'slab_created',
      adminId: adminUser?._id,
      adminName: adminUser?.name || 'Admin',
      targetId: slab._id.toString(),
      newValue: slab.toObject(),
      reason: `Created commission slab '${slab.name}'`,
    });

    return slab;
  }

  public async updateSlab(
    slabId: string,
    data: Partial<{
      name: string;
      minEarnings: number;
      maxEarnings: number | null;
      percentage: number;
      effectiveFrom: Date;
      isUnlimited: boolean;
      isActive: boolean;
      sortOrder: number;
    }>,
    adminUser?: { _id?: any; name?: string }
  ) {
    const slab = await CommissionSlab.findById(slabId);
    if (!slab) throw new Error('Commission slab not found');

    const oldVal = slab.toObject();

    if (data.percentage != null && (data.percentage < 0 || data.percentage > 100)) {
      throw new Error('Percentage must be between 0 and 100');
    }
    if (data.minEarnings != null && data.minEarnings < 0) {
      throw new Error('Minimum earnings cannot be negative');
    }
    if (
      !data.isUnlimited &&
      data.maxEarnings != null &&
      data.minEarnings != null &&
      data.maxEarnings < data.minEarnings
    ) {
      throw new Error('Maximum earnings must be greater than or equal to minimum earnings');
    }

    Object.assign(slab, data);
    if (data.isUnlimited) {
      slab.maxEarnings = null;
    }
    await slab.save();

    await AgencyCommissionAuditLog.create({
      action: 'slab_updated',
      adminId: adminUser?._id,
      adminName: adminUser?.name || 'Admin',
      targetId: slab._id.toString(),
      oldValue: oldVal,
      newValue: slab.toObject(),
      reason: `Updated commission slab '${slab.name}'`,
    });

    return slab;
  }

  public async deleteSlab(slabId: string, adminUser?: { _id?: any; name?: string }) {
    const slab = await CommissionSlab.findById(slabId);
    if (!slab) throw new Error('Commission slab not found');

    const oldVal = slab.toObject();
    await CommissionSlab.findByIdAndDelete(slabId);

    await AgencyCommissionAuditLog.create({
      action: 'slab_deleted',
      adminId: adminUser?._id,
      adminName: adminUser?.name || 'Admin',
      targetId: slabId,
      oldValue: oldVal,
      reason: `Deleted commission slab '${slab.name}'`,
    });

    return slab;
  }

  // =========================================================================
  // 3. PERIOD & SETTLEMENT SETTINGS
  // =========================================================================
  public async getPeriodAndSettlementSettings() {
    const s = await this.appSettingService.getSettings();
    return {
      weekStartDay: s.agency_week_start_day ?? 1, // 1 = Monday
      weekStartTime: s.agency_week_start_time ?? '00:00',
      weekEndDay: s.agency_week_end_day ?? 0, // 0 = Sunday
      weekEndTime: s.agency_week_end_time ?? '23:59:59',
      timezone: s.agency_timezone ?? 'Asia/Kolkata',
      settlementDay: s.agency_settlement_day ?? 3, // 3 = Wednesday
      settlementTime: s.agency_settlement_time ?? '12:00',
      settlementMode: s.agency_settlement_mode ?? 'manual_approval', // auto | manual_approval
      commissionUnit: s.agency_commission_unit ?? 'beans',
      useCommissionSlabs: s.agency_use_commission_slabs !== false,
      globalCommissionRate: s.agency_global_commission_rate ?? 10,
    };
  }

  public async updatePeriodAndSettlementSettings(
    data: {
      weekStartDay?: number;
      weekStartTime?: string;
      timezone?: string;
      settlementDay?: number;
      settlementTime?: string;
      settlementMode?: 'auto' | 'manual_approval';
      commissionUnit?: string;
      useCommissionSlabs?: boolean;
      globalCommissionRate?: number;
    },
    adminUser?: { _id?: any; name?: string }
  ) {
    const oldSettings = await this.getPeriodAndSettlementSettings();

    const updates: Record<string, unknown> = {};
    if (data.weekStartDay != null) updates.agency_week_start_day = Number(data.weekStartDay);
    if (data.weekStartTime != null) updates.agency_week_start_time = data.weekStartTime;
    if (data.timezone != null) updates.agency_timezone = data.timezone;
    if (data.settlementDay != null) updates.agency_settlement_day = Number(data.settlementDay);
    if (data.settlementTime != null) updates.agency_settlement_time = data.settlementTime;
    if (data.settlementMode != null) updates.agency_settlement_mode = data.settlementMode;
    if (data.commissionUnit != null) updates.agency_commission_unit = data.commissionUnit;
    if (data.useCommissionSlabs != null) updates.agency_use_commission_slabs = Boolean(data.useCommissionSlabs);
    if (data.globalCommissionRate != null) updates.agency_global_commission_rate = Number(data.globalCommissionRate);

    await this.appSettingService.updateSettings(updates);

    await AgencyCommissionAuditLog.create({
      action: 'settings_updated',
      adminId: adminUser?._id,
      adminName: adminUser?.name || 'Admin',
      oldValue: oldSettings,
      newValue: updates,
      reason: 'Updated weekly period and settlement configuration',
    });

    return this.getPeriodAndSettlementSettings();
  }

  // =========================================================================
  // 4. AGENCY COMMISSION LIST (CURRENT PERIOD STATUS)
  // =========================================================================
  public async getAgencyCommissionList(params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.max(1, Math.min(100, params.limit || 20));
    const skip = (page - 1) * limit;

    const cycleStart = this.agencyCommissionService.getCycleStart();
    const cycleEnd = this.agencyCommissionService.getCycleEnd();

    const query: any = { status: 'approved' };
    if (params.search && params.search.trim()) {
      const regex = new RegExp(params.search.trim(), 'i');
      query.$or = [{ name: regex }, { agencyCode: regex }, { mobile: regex }, { email: regex }];
    }

    const total = await Agency.countDocuments(query);
    const agencies = await Agency.find(query)
      .populate('creatorId', 'userId name mobile profileImage')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const list = await Promise.all(
      agencies.map(async (agency: any) => {
        // Calculate weekly earnings including Agency Owner Self ID
        const weeklyEarning = await this.agencyCommissionService.calculateAgencyWeeklyEarnings(
          agency._id.toString(),
          cycleStart,
          cycleEnd
        );

        const rate = await this.agencyCommissionService.resolveCommissionRate(
          weeklyEarning.totalEligibleBeans,
          agency
        );

        const estimatedCommission =
          rate > 0 ? Math.round(((weeklyEarning.totalEligibleBeans * rate) / 100) * 100) / 100 : 0;

        // Pending manual adjustments for this week
        const adjustments = await AgencyCommissionAdjustment.find({
          agencyId: agency._id,
          status: 'pending',
        }).lean();
        const totalAdjustments = adjustments.reduce((sum, a) => sum + a.amount, 0);

        const finalEstimated = Math.max(0, estimatedCommission + totalAdjustments);

        // Previous week last paid settlement
        const lastSettlement = await AgencySettlementBatch.findOne(
          { 'items.agencyId': agency._id, status: 'settled' },
          { 'items.$': 1, settledAt: 1 }
        ).lean();

        const lastPaidAmount = lastSettlement?.items?.[0]?.finalCommission || 0;
        const lastPaidDate = lastSettlement?.settledAt || null;

        let statusText = 'Eligible';
        if (agency.isFrozen) statusText = 'Frozen';
        else if (agency.isCommissionHeld) statusText = 'Held';
        else if (rate === 0) statusText = 'Below Minimum';

        return {
          _id: agency._id,
          agencyCode: agency.agencyCode || `AG${agency._id.toString().slice(-4).toUpperCase()}`,
          name: agency.name,
          owner: agency.creatorId,
          hostCount: weeklyEarning.hostCount,
          eligibleBeans: weeklyEarning.totalEligibleBeans,
          currentSlab: weeklyEarning.currentSlabName || `${rate}%`,
          commissionRate: rate,
          estimatedCommission,
          adjustmentAmount: totalAdjustments,
          finalEstimatedCommission: finalEstimated,
          lastPaidAmount,
          lastPaidDate,
          status: statusText,
          isFrozen: agency.isFrozen,
          isCommissionHeld: agency.isCommissionHeld,
        };
      })
    );

    return {
      agencies: list,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // =========================================================================
  // 5. AGENCY DETAIL / DRILL-DOWN BREAKDOWN
  // =========================================================================
  public async getAgencyDetail(agencyId: string, customStart?: Date, customEnd?: Date) {
    const agency = await Agency.findById(agencyId)
      .populate('creatorId', 'userId name mobile profileImage email')
      .populate('countryId', 'name code flag')
      .lean();

    if (!agency) throw new Error('Agency not found');

    const cycleStart = customStart || this.agencyCommissionService.getCycleStart();
    const cycleEnd = customEnd || this.agencyCommissionService.getCycleEnd();

    // Fetch host-by-host breakdown (including Owner Self ID)
    const breakdown = await this.agencyCommissionService.getAgencyHostEarningBreakdown(
      agencyId,
      cycleStart,
      cycleEnd
    );

    const rate = await this.agencyCommissionService.resolveCommissionRate(breakdown.totalEligibleBeans, agency as any);
    const calculatedCommission =
      rate > 0 ? Math.round(((breakdown.totalEligibleBeans * rate) / 100) * 100) / 100 : 0;

    // Adjustments
    const adjustments = await AgencyCommissionAdjustment.find({
      agencyId: agency._id,
      status: { $in: ['pending', 'applied'] },
    }).sort({ createdAt: -1 }).lean();

    const netAdjustment = adjustments.reduce((sum, a) => (a.status === 'pending' ? sum + a.amount : sum), 0);
    const finalPayable = Math.max(0, calculatedCommission + netAdjustment);

    // Settlement history for this agency
    const settlements = await AgencySettlementBatch.find(
      { 'items.agencyId': agency._id },
      { batchId: 1, cycleStart: 1, cycleEnd: 1, status: 1, settledAt: 1, 'items.$': 1 }
    )
      .sort({ cycleStart: -1 })
      .limit(10)
      .lean();

    return {
      agency,
      cycleStart,
      cycleEnd,
      totalEligibleBeans: breakdown.totalEligibleBeans,
      applicableRate: rate,
      slabName: breakdown.currentSlabName,
      warning: breakdown.warning,
      calculatedCommission,
      netAdjustment,
      finalPayable,
      hostBreakdown: breakdown.hosts,
      adjustments,
      settlementHistory: settlements.map((s) => ({
        batchId: s.batchId,
        cycleStart: s.cycleStart,
        cycleEnd: s.cycleEnd,
        status: s.status,
        settledAt: s.settledAt,
        settlementItem: s.items?.[0] || null,
      })),
    };
  }

  // =========================================================================
  // 6. SETTLEMENT / PAYOUT BATCH MANAGEMENT
  // =========================================================================
  public async generateSettlementPreview(cycleStart?: Date, cycleEnd?: Date) {
    const start = cycleStart || this.agencyCommissionService.getCycleStart();
    const end = cycleEnd || this.agencyCommissionService.getCycleEnd();

    const agencies = await Agency.find({
      status: 'approved',
      isFrozen: false,
      isCommissionHeld: false,
    })
      .populate('creatorId', 'userId name mobile')
      .lean();

    const items: any[] = [];
    let totalEligibleBeans = 0;
    let totalCommission = 0;

    for (const agency of agencies) {
      const earning = await this.agencyCommissionService.calculateAgencyWeeklyEarnings(
        agency._id.toString(),
        start,
        end
      );

      if (earning.totalEligibleBeans <= 0) continue;

      const rate = await this.agencyCommissionService.resolveCommissionRate(
        earning.totalEligibleBeans,
        agency as any
      );

      if (rate <= 0) continue;

      const calculatedCommission = Math.round(((earning.totalEligibleBeans * rate) / 100) * 100) / 100;

      // Pending adjustments
      const adjustments = await AgencyCommissionAdjustment.find({
        agencyId: agency._id,
        status: 'pending',
      }).lean();
      const adjustmentAmount = adjustments.reduce((sum, a) => sum + a.amount, 0);
      const adjustmentReason = adjustments.map((a) => a.reason).join('; ');

      const finalCommission = Math.max(0, calculatedCommission + adjustmentAmount);

      totalEligibleBeans += earning.totalEligibleBeans;
      totalCommission += finalCommission;

      items.push({
        agencyId: agency._id,
        agencyName: agency.name,
        agencyCode: agency.agencyCode || `AG${agency._id.toString().slice(-4).toUpperCase()}`,
        ownerUserId: (agency.creatorId as any)?._id || agency.creatorId,
        ownerNumericId: (agency.creatorId as any)?.userId,
        hostCount: earning.hostCount,
        eligibleBeans: earning.totalEligibleBeans,
        slabName: earning.currentSlabName,
        commissionRate: rate,
        calculatedCommission,
        adjustmentAmount,
        adjustmentReason,
        finalCommission,
        status: 'pending',
        retryCount: 0,
      });
    }

    const settings = await this.getPeriodAndSettlementSettings();
    const weekNumber = Math.ceil(
      (start.getTime() - new Date(start.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000)
    );
    const batchId = `BATCH-${start.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}`;

    return {
      batchId,
      cycleStart: start,
      cycleEnd: end,
      settlementDay: settings.settlementDay,
      settlementTime: settings.settlementTime,
      totalAgencies: items.length,
      totalEligibleBeans,
      totalCommission: Math.round(totalCommission * 100) / 100,
      commissionUnit: settings.commissionUnit,
      status: 'preview',
      items,
    };
  }

  public async saveOrUpdateBatch(
    batchData: any,
    adminUser?: { _id?: any; name?: string }
  ) {
    const existing = await AgencySettlementBatch.findOne({ batchId: batchData.batchId });
    if (existing && existing.status === 'settled') {
      throw new Error(`Batch ${batchData.batchId} has already been settled and cannot be modified.`);
    }

    const doc = await AgencySettlementBatch.findOneAndUpdate(
      { batchId: batchData.batchId },
      {
        ...batchData,
        status: batchData.status || 'preview',
      },
      { upsert: true, new: true }
    );

    await AgencyCommissionAuditLog.create({
      action: 'batch_generated',
      adminId: adminUser?._id,
      adminName: adminUser?.name || 'Admin',
      targetId: doc.batchId,
      newValue: { totalAgencies: doc.totalAgencies, totalCommission: doc.totalCommission },
      reason: `Generated or updated settlement batch ${doc.batchId}`,
    });

    return doc;
  }

  public async approveBatch(batchId: string, adminUser?: { _id?: any; name?: string }) {
    const batch = await AgencySettlementBatch.findOne({ batchId });
    if (!batch) throw new Error(`Batch ${batchId} not found`);
    if (batch.status === 'settled') throw new Error(`Batch ${batchId} is already settled`);

    batch.status = 'approved';
    batch.approvedBy = adminUser?._id;
    batch.approvedByName = adminUser?.name || 'Admin';
    batch.approvedAt = new Date();

    for (const item of batch.items) {
      if (item.status === 'pending') {
        item.status = 'approved';
      }
    }

    await batch.save();

    await AgencyCommissionAuditLog.create({
      action: 'batch_approved',
      adminId: adminUser?._id,
      adminName: adminUser?.name || 'Admin',
      targetId: batchId,
      reason: `Approved settlement batch ${batchId} for payout`,
    });

    return batch;
  }

  public async executeSettlement(batchId: string, adminUser?: { _id?: any; name?: string }) {
    const batch = await AgencySettlementBatch.findOne({ batchId });
    if (!batch) throw new Error(`Batch ${batchId} not found`);
    if (batch.status === 'settled') throw new Error(`Batch ${batchId} has already been settled`);

    const session = await mongoose.startSession();
    session.startTransaction();

    let successCount = 0;
    let failCount = 0;

    try {
      for (const item of batch.items) {
        if (item.status === 'settled') continue; // Idempotent: never double credit

        try {
          const agency = await Agency.findById(item.agencyId).session(session);
          if (!agency) throw new Error('Agency not found');
          if (agency.isFrozen) throw new Error('Agency is frozen');
          if (agency.isCommissionHeld) throw new Error('Agency commission is on hold');

          const creditAmount = Math.round(item.finalCommission);
          const txId = `COMM-${batch.batchId}-${agency._id.toString().slice(-6)}-${Date.now()}`;

          if (creditAmount > 0) {
            // Credit to agency owner's personal bean wallet
            await User.findByIdAndUpdate(
              agency.creatorId,
              { $inc: { beans: creditAmount } },
              { session }
            );

            // Record atomic CoinHistory ledger
            await CoinHistory.create(
              [
                {
                  userId: agency.creatorId,
                  amount: creditAmount,
                  type: 'agency_commission',
                  wallet: 'beans',
                  transactionId: txId,
                  description: `Weekly Agency Commission (${item.commissionRate}%) for '${agency.name}' (${batch.batchId})`,
                },
              ],
              { session }
            );
          }

          // Mark applied adjustments as applied
          await AgencyCommissionAdjustment.updateMany(
            { agencyId: agency._id, status: 'pending' },
            { $set: { status: 'applied', batchId: batch.batchId } },
            { session }
          );

          // Update agency tracking
          agency.lastSettlementDate = new Date();
          agency.pendingCommission = 0;
          await agency.save({ session });

          item.status = 'settled';
          item.walletTransactionId = txId;
          item.settledAt = new Date();
          item.failureReason = undefined;
          successCount++;
        } catch (itemErr: any) {
          item.status = 'failed';
          item.failureReason = itemErr.message;
          item.retryCount = (item.retryCount || 0) + 1;
          failCount++;
        }
      }

      batch.status = failCount === 0 ? 'settled' : 'partially_settled';
      batch.settledAt = new Date();
      await batch.save({ session });

      await session.commitTransaction();

      await AgencyCommissionAuditLog.create({
        action: 'batch_settled',
        adminId: adminUser?._id,
        adminName: adminUser?.name || 'Admin',
        targetId: batchId,
        reason: `Settled batch ${batchId}: ${successCount} successful, ${failCount} failed`,
      });

      return {
        batchId,
        status: batch.status,
        successCount,
        failCount,
      };
    } catch (err: any) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }

  public async retrySettlementItem(
    batchId: string,
    agencyId: string,
    adminUser?: { _id?: any; name?: string }
  ) {
    const batch = await AgencySettlementBatch.findOne({ batchId });
    if (!batch) throw new Error('Batch not found');

    const item = batch.items.find((i) => i.agencyId.toString() === agencyId);
    if (!item) throw new Error('Agency item not found in batch');
    if (item.status === 'settled') throw new Error('Item is already settled');

    const agency = await Agency.findById(agencyId);
    if (!agency) throw new Error('Agency not found');

    const creditAmount = Math.round(item.finalCommission);
    const txId = `COMM-RETRY-${batch.batchId}-${agency._id.toString().slice(-6)}-${Date.now()}`;

    if (creditAmount > 0) {
      await User.findByIdAndUpdate(agency.creatorId, { $inc: { beans: creditAmount } });
      await CoinHistory.create({
        userId: agency.creatorId,
        amount: creditAmount,
        type: 'agency_commission',
        wallet: 'beans',
        transactionId: txId,
        description: `Retry Commission Payout for '${agency.name}' (${batch.batchId})`,
      });
    }

    item.status = 'settled';
    item.walletTransactionId = txId;
    item.settledAt = new Date();
    item.failureReason = undefined;

    const allSettled = batch.items.every((i) => i.status === 'settled');
    if (allSettled) batch.status = 'settled';

    await batch.save();

    await AgencyCommissionAuditLog.create({
      action: 'retry_settlement',
      adminId: adminUser?._id,
      adminName: adminUser?.name || 'Admin',
      targetId: `${batchId}_${agencyId}`,
      reason: `Successfully retried settlement for agency '${agency.name}'`,
    });

    return { success: true, message: `Successfully settled agency '${agency.name}'` };
  }

  // =========================================================================
  // 7. MANUAL ADJUSTMENTS (SECTION L)
  // =========================================================================
  public async addManualAdjustment(
    data: {
      agencyId: string;
      amount: number;
      reason: string;
      reference?: string;
    },
    adminUser?: { _id?: any; name?: string }
  ) {
    if (!data.amount || data.amount === 0) throw new Error('Adjustment amount cannot be zero');
    if (!data.reason || !data.reason.trim()) throw new Error('A mandatory reason is required for manual adjustments');

    const agency = await Agency.findById(data.agencyId);
    if (!agency) throw new Error('Agency not found');

    const adj = await AgencyCommissionAdjustment.create({
      agencyId: agency._id,
      amount: data.amount,
      reason: data.reason.trim(),
      reference: data.reference,
      adminId: adminUser?._id,
      adminName: adminUser?.name || 'Admin',
      status: 'pending',
    });

    await AgencyCommissionAuditLog.create({
      action: 'manual_adjustment',
      adminId: adminUser?._id,
      adminName: adminUser?.name || 'Admin',
      targetId: agency._id.toString(),
      newValue: { amount: data.amount, reason: data.reason },
      reason: `Added manual adjustment of ${data.amount} beans for agency '${agency.name}': ${data.reason}`,
    });

    return adj;
  }

  // =========================================================================
  // 8. AUDIT LOGS
  // =========================================================================
  public async getAuditLogs(page: number = 1, limit: number = 20) {
    const p = Math.max(1, page);
    const l = Math.max(1, Math.min(100, limit));
    const skip = (p - 1) * l;

    const [logs, total] = await Promise.all([
      AgencyCommissionAuditLog.find().sort({ createdAt: -1 }).skip(skip).limit(l).lean(),
      AgencyCommissionAuditLog.countDocuments(),
    ]);

    return {
      logs,
      pagination: {
        total,
        page: p,
        limit: l,
        totalPages: Math.ceil(total / l),
      },
    };
  }

  public getCommissionLogs(agencyId: string, page?: number, limit?: number, filters?: { type?: string; status?: string }) {
    return this.agencyCommissionService.getCommissionLogs(agencyId, page, limit, filters);
  }

  public getSettlementHistory(agencyId: string, page?: number, limit?: number) {
    return this.agencyCommissionService.getSettlementHistory(agencyId, page, limit);
  }
}
