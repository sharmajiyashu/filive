import VipPlan from '../models/VipPlan';
import AppLogger from '../api/loaders/logger';

export async function seedVipPlans(): Promise<void> {
  try {
    AppLogger.info('👑 Seeding VIP Plans...');

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

    for (const plan of defaultPlans) {
      const existing = await VipPlan.findOne({ durationMonths: plan.durationMonths });
      if (!existing) {
        await VipPlan.create(plan);
        AppLogger.info(`➕ Created VIP plan: ${plan.name} (${plan.coinPrice} Coins)`);
      } else {
        await VipPlan.updateOne(
          { _id: existing._id },
          {
            $set: {
              name: plan.name,
              durationDays: plan.durationDays,
              coinPrice: existing.coinPrice || plan.coinPrice,
              discountPercent: existing.discountPercent !== undefined ? existing.discountPercent : plan.discountPercent,
              benefits: plan.benefits,
              isActive: existing.isActive !== undefined ? existing.isActive : true,
              order: plan.order,
            },
          }
        );
        AppLogger.info(`ℹ️ VIP plan already exists and synchronized: ${plan.name}`);
      }
    }

    AppLogger.info('✅ VIP Plans seeded successfully!');
  } catch (error) {
    AppLogger.error('❌ Error seeding VIP plans:', error);
    throw error;
  }
}
