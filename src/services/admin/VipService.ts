import { Service } from 'typedi';
import VipPlan, { IVipPlan } from '../../models/VipPlan';

@Service()
export class AdminVipService {
  /**
   * Get all VIP plans with optional filter
   */
  public async getAllPlans(queryFilter: any = {}) {
    return VipPlan.find(queryFilter).sort({ order: 1, durationMonths: 1 });
  }

  /**
   * Get a single VIP plan by ID
   */
  public async getPlanById(planId: string): Promise<IVipPlan | null> {
    return VipPlan.findById(planId);
  }

  /**
   * Create a new VIP plan
   */
  public async createPlan(data: Partial<IVipPlan>): Promise<IVipPlan> {
    if (!data.name || !data.durationMonths || !data.coinPrice) {
      throw new Error('Name, duration (in months), and coin price are required');
    }

    const plan = new VipPlan({
      name: data.name,
      durationMonths: Number(data.durationMonths),
      durationDays: Number(data.durationDays || Number(data.durationMonths) * 30),
      coinPrice: Number(data.coinPrice),
      discountPercent: Number(data.discountPercent || 0),
      badgeIcon: data.badgeIcon,
      benefits: data.benefits && data.benefits.length > 0 ? data.benefits : [
        'See Profile Visitors',
        'Exclusive VIP Crown & Badge',
        'Special Entrance Effects in Live Rooms',
        'Higher Following & Friend Limits',
        'VIP Customer Support',
      ],
      isActive: data.isActive !== undefined ? data.isActive : true,
      order: Number(data.order || 0),
    });

    return plan.save();
  }

  /**
   * Update an existing VIP plan
   */
  public async updatePlan(planId: string, data: Partial<IVipPlan>): Promise<IVipPlan | null> {
    const plan = await VipPlan.findById(planId);
    if (!plan) {
      throw new Error('VIP Plan not found');
    }

    if (data.name !== undefined) plan.name = data.name;
    if (data.durationMonths !== undefined) {
      plan.durationMonths = Number(data.durationMonths);
      if (!data.durationDays) {
        plan.durationDays = Number(data.durationMonths) * 30;
      }
    }
    if (data.durationDays !== undefined) plan.durationDays = Number(data.durationDays);
    if (data.coinPrice !== undefined) plan.coinPrice = Number(data.coinPrice);
    if (data.discountPercent !== undefined) plan.discountPercent = Number(data.discountPercent);
    if (data.badgeIcon !== undefined) plan.badgeIcon = data.badgeIcon;
    if (data.benefits !== undefined) plan.benefits = data.benefits;
    if (data.isActive !== undefined) plan.isActive = data.isActive;
    if (data.order !== undefined) plan.order = Number(data.order);

    return plan.save();
  }

  /**
   * Delete a VIP plan
   */
  public async deletePlan(planId: string): Promise<boolean> {
    const result = await VipPlan.findByIdAndDelete(planId);
    return !!result;
  }

  /**
   * Toggle active status
   */
  public async toggleStatus(planId: string): Promise<IVipPlan | null> {
    const plan = await VipPlan.findById(planId);
    if (!plan) throw new Error('VIP Plan not found');
    plan.isActive = !plan.isActive;
    return plan.save();
  }
}
