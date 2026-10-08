import { Service } from 'typedi';
import mongoose from 'mongoose';
import VipPlan, { IVipPlan } from '../../models/VipPlan';
import User from '../../models/User';
import CoinHistory from '../../models/CoinHistory';

@Service()
export class VipService {
  /**
   * Initializes default VIP plans if none exist in the database
   */
  public async ensureDefaultPlans(): Promise<IVipPlan[]> {
    const count = await VipPlan.countDocuments();
    if (count === 0) {
      const defaultPlans = [
        {
          name: '1 Month VIP',
          durationMonths: 1,
          durationDays: 30,
          coinPrice: 1000,
          discountPercent: 0,
          order: 1,
          isActive: true,
          benefits: [
            'See Profile Visitors',
            'Exclusive VIP Crown & Badge',
            'Special Entrance Effects in Live Rooms',
            'Higher Following & Friend Limits',
            'VIP Customer Support',
          ],
        },
        {
          name: '3 Months VIP',
          durationMonths: 3,
          durationDays: 90,
          coinPrice: 2700,
          discountPercent: 10,
          order: 2,
          isActive: true,
          benefits: [
            'See Profile Visitors',
            'Exclusive VIP Crown & Badge',
            'Special Entrance Effects in Live Rooms',
            'Higher Following & Friend Limits',
            'VIP Customer Support',
          ],
        },
        {
          name: '12 Months VIP',
          durationMonths: 12,
          durationDays: 365,
          coinPrice: 9600,
          discountPercent: 20,
          order: 3,
          isActive: true,
          benefits: [
            'See Profile Visitors',
            'Exclusive VIP Crown & Badge',
            'Special Entrance Effects in Live Rooms',
            'Higher Following & Friend Limits',
            'VIP Customer Support',
          ],
        },
      ];

      await VipPlan.insertMany(defaultPlans);
    }

    return VipPlan.find({ isActive: true }).sort({ order: 1, durationMonths: 1 });
  }

  /**
   * Gets all active VIP plans for mobile app
   */
  public async getActivePlans(): Promise<IVipPlan[]> {
    await this.ensureDefaultPlans();
    return VipPlan.find({ isActive: true }).sort({ order: 1, durationMonths: 1 });
  }

  /**
   * Gets current user's VIP status & active plan
   */
  public async getUserVipStatus(userId: string) {
    const user = await User.findById(userId).populate('vipPlanId');
    if (!user) throw new Error('User not found');

    const now = new Date();
    let isVip = false;
    let daysRemaining = 0;

    if (user.vipExpiresAt) {
      const expiry = new Date(user.vipExpiresAt);
      if (expiry.getTime() > now.getTime()) {
        isVip = true;
        daysRemaining = Math.max(0, Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
      } else {
        // Expired
        if (user.isPremium || user.isVip) {
          await User.findByIdAndUpdate(userId, { isPremium: false, isVip: false });
          user.isPremium = false;
          user.isVip = false;
        }
      }
    } else if (user.isPremium || user.isVip) {
      isVip = true;
      daysRemaining = 365;
    }

    return {
      isVip,
      isPremium: isVip,
      vipExpiresAt: user.vipExpiresAt || null,
      daysRemaining,
      coins: user.coins || 0,
      activePlan: user.vipPlanId || null,
    };
  }

  /**
   * Purchase a VIP plan using user's coins
   */
  public async purchaseVipPlan(userId: string, planId: string) {
    if (!mongoose.Types.ObjectId.isValid(planId)) {
      throw new Error('Invalid VIP plan ID');
    }

    const plan = await VipPlan.findById(planId);
    if (!plan || !plan.isActive) {
      throw new Error('VIP plan not found or inactive');
    }

    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    const currentCoins = Number(user.coins || 0);
    if (currentCoins < plan.coinPrice) {
      const err: any = new Error('INSUFFICIENT_COINS');
      err.code = 'INSUFFICIENT_COINS';
      err.message = `Insufficient coins. Required: ${plan.coinPrice}, Available: ${currentCoins}`;
      throw err;
    }

    // Calculate new expiry date
    const now = new Date();
    let newExpiresAt = new Date();

    if (user.vipExpiresAt && new Date(user.vipExpiresAt).getTime() > now.getTime()) {
      // Extend existing VIP
      newExpiresAt = new Date(new Date(user.vipExpiresAt).getTime() + plan.durationDays * 24 * 60 * 60 * 1000);
    } else {
      // Start fresh
      newExpiresAt = new Date(now.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);
    }

    // Deduct coins & update VIP fields
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $inc: { coins: -plan.coinPrice },
        $set: {
          isPremium: true,
          isVip: true,
          vipExpiresAt: newExpiresAt,
          vipPlanId: plan._id,
        },
      },
      { new: true }
    );

    // Record Coin History transaction
    await CoinHistory.create({
      userId,
      amount: plan.coinPrice,
      type: 'debit',
      category: 'vip_purchase',
      description: `Purchased ${plan.name} for ${plan.coinPrice} coins`,
      referenceId: plan._id.toString(),
      referenceModel: 'VipPlan',
    });

    const daysRemaining = Math.max(0, Math.ceil((newExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

    return {
      success: true,
      message: `Successfully subscribed to ${plan.name}!`,
      plan,
      remainingCoins: updatedUser?.coins || 0,
      isVip: true,
      vipExpiresAt: newExpiresAt,
      daysRemaining,
    };
  }
}
