import PaymentMethod from '../models/PaymentMethod';
import AppLogger from '../api/loaders/logger';

const DEFAULT_METHODS = [
  {
    gateway: 'razorpay' as const,
    displayName: 'Razorpay',
    countries: ['IN'],
    targetAudience: 'all' as const,
    isActive: true,
  },
  {
    gateway: 'pandapay' as const,
    displayName: 'PandaPay',
    countries: ['IN'],
    targetAudience: 'all' as const,
    isActive: true,
  },
];

export async function seedPaymentMethods() {
  try {
    for (const method of DEFAULT_METHODS) {
      await PaymentMethod.findOneAndUpdate(
        { gateway: method.gateway },
        { $setOnInsert: method },
        { upsert: true, new: true }
      );
    }
    AppLogger.info('✅ Payment methods seeded successfully');
  } catch (error) {
    AppLogger.error('❌ PaymentMethod seeder failed', error);
    throw error;
  }
}
