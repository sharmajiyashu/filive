import { Service, Inject } from 'typedi';
import CommissionSlab from '../../models/CommissionSlab';
import Agency from '../../models/Agency';
import { AppSettingService } from '../common/AppSettingService';
import { AgencyCommissionService } from '../app/AgencyCommissionService';

@Service()
export class AdminAgencyCommissionService {
  constructor(
    @Inject() private appSettingService: AppSettingService,
    @Inject() private agencyCommissionService: AgencyCommissionService,
  ) {}

  public async getSlabs() {
    return CommissionSlab.find().sort({ sortOrder: 1, minEarnings: 1 });
  }

  public async createSlab(data: {
    minEarnings: number;
    maxEarnings?: number | null;
    percentage: number;
    isActive?: boolean;
    sortOrder?: number;
  }) {
    if (data.percentage < 0 || data.percentage > 100) {
      throw new Error('Percentage must be between 0 and 100');
    }
    if (data.maxEarnings != null && data.maxEarnings < data.minEarnings) {
      throw new Error('maxEarnings must be greater than or equal to minEarnings');
    }
    return CommissionSlab.create(data);
  }

  public async updateSlab(
    slabId: string,
    data: Partial<{
      minEarnings: number;
      maxEarnings: number | null;
      percentage: number;
      isActive: boolean;
      sortOrder: number;
    }>
  ) {
    const slab = await CommissionSlab.findById(slabId);
    if (!slab) throw new Error('Commission slab not found');

    if (data.percentage != null && (data.percentage < 0 || data.percentage > 100)) {
      throw new Error('Percentage must be between 0 and 100');
    }

    Object.assign(slab, data);
    await slab.save();
    return slab;
  }

  public async deleteSlab(slabId: string) {
    const slab = await CommissionSlab.findByIdAndDelete(slabId);
    if (!slab) throw new Error('Commission slab not found');
    return slab;
  }

  public async getCommissionSettings() {
    const settings = await this.appSettingService.getSettings();
    return {
      globalCommissionRate: settings.agency_global_commission_rate ?? 10,
      useCommissionSlabs: settings.agency_use_commission_slabs !== false,
      autoSettlementEnabled: settings.agency_auto_settlement_enabled ?? true,
      settlementDay: settings.agency_settlement_day ?? 1,
    };
  }

  public async updateCommissionSettings(data: {
    globalCommissionRate?: number;
    useCommissionSlabs?: boolean;
    autoSettlementEnabled?: boolean;
    settlementDay?: number;
  }) {
    const updates: Record<string, unknown> = {};
    if (data.globalCommissionRate != null) {
      updates.agency_global_commission_rate = data.globalCommissionRate;
    }
    if (data.useCommissionSlabs != null) {
      updates.agency_use_commission_slabs = data.useCommissionSlabs;
    }
    if (data.autoSettlementEnabled != null) {
      updates.agency_auto_settlement_enabled = data.autoSettlementEnabled;
    }
    if (data.settlementDay != null) {
      updates.agency_settlement_day = data.settlementDay;
    }
    await this.appSettingService.updateSettings(updates);
    return this.getCommissionSettings();
  }

  public async setAgencyCommissionRate(
    agencyId: string,
    commissionRate: number,
    useAgencyCommissionRate = true
  ) {
    const agency = await Agency.findById(agencyId);
    if (!agency) throw new Error('Agency not found');
    if (commissionRate < 0 || commissionRate > 100) {
      throw new Error('Commission rate must be between 0 and 100');
    }

    agency.commissionRate = commissionRate;
    agency.useAgencyCommissionRate = useAgencyCommissionRate;
    await agency.save();

    return agency;
  }

  public async holdCommission(agencyId: string, hold: boolean) {
    const agency = await Agency.findById(agencyId);
    if (!agency) throw new Error('Agency not found');
    agency.isCommissionHeld = hold;
    await agency.save();
    return agency;
  }

  public async freezeAgency(agencyId: string, freeze: boolean) {
    const agency = await Agency.findById(agencyId);
    if (!agency) throw new Error('Agency not found');
    agency.isFrozen = freeze;
    await agency.save();
    return agency;
  }

  public async runManualSettlement(agencyId?: string) {
    if (agencyId) {
      return this.agencyCommissionService.settleAgency(agencyId, 'manual', 'Manual settlement by admin');
    }

    const agencies = await Agency.find({
      status: 'approved',
      isFrozen: false,
      isCommissionHeld: false,
      pendingCommission: { $gt: 0 },
    });

    const results = [];
    for (const agency of agencies) {
      try {
        const result = await this.agencyCommissionService.settleAgency(
          agency._id.toString(),
          'manual',
          'Bulk manual settlement by admin'
        );
        results.push({ agencyId: agency._id, ...result });
      } catch (err: any) {
        results.push({ agencyId: agency._id, settled: false, message: err.message });
      }
    }

    return { results, settledCount: results.filter((r) => r.settled).length };
  }

  public getCommissionLogs(agencyId: string, page?: number, limit?: number, filters?: { type?: string; status?: string }) {
    return this.agencyCommissionService.getCommissionLogs(agencyId, page, limit, filters);
  }

  public getSettlementHistory(agencyId: string, page?: number, limit?: number) {
    return this.agencyCommissionService.getSettlementHistory(agencyId, page, limit);
  }
}
