import CommissionSlab from '../models/CommissionSlab';
import AppSetting from '../models/AppSetting';
import AppLogger from '../api/loaders/logger';

const defaultSlabs = [
  { minEarnings: 0, maxEarnings: 500000, percentage: 5, sortOrder: 1 },
  { minEarnings: 500001, maxEarnings: 1000000, percentage: 10, sortOrder: 2 },
  { minEarnings: 1000001, maxEarnings: 2000000, percentage: 15, sortOrder: 3 },
  { minEarnings: 2000001, maxEarnings: null, percentage: 20, sortOrder: 4 },
];

export async function seedCommissionSlabs() {
  try {
    const count = await CommissionSlab.countDocuments();
    if (count === 0) {
      await CommissionSlab.insertMany(defaultSlabs);
      AppLogger.info('✅ Default commission slabs seeded');
    }

    const commissionSettings = [
      { key: 'agency_global_commission_rate', value: 10, description: 'Global flat commission rate (%) when slabs disabled' },
      { key: 'agency_use_commission_slabs', value: true, description: 'Use tiered commission slabs based on host earnings' },
      { key: 'agency_auto_settlement_enabled', value: true, description: 'Enable automatic weekly commission settlement' },
      { key: 'agency_settlement_day', value: 1, description: 'Settlement day (0=Sunday, 1=Monday, ...)' },
    ];

    for (const setting of commissionSettings) {
      await AppSetting.findOneAndUpdate({ key: setting.key }, setting, { upsert: true, new: true });
    }

    AppLogger.info('✅ Agency commission settings seeded');
  } catch (error) {
    AppLogger.error('❌ Error seeding commission slabs:', error);
  }
}
