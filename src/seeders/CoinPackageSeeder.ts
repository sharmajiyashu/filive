import CoinPackage from '../models/CoinPackage';
import AppLogger from '../api/loaders/logger';

export async function seedCoinPackages() {
  try {
    const packages = [
      { name: 'Bronze Pack', coins: 100, price: 99, description: 'Starter pack' },
      { name: 'Silver Pack', coins: 500, price: 449, description: 'Great value' },
      { name: 'Gold Pack', coins: 1200, price: 999, description: 'Popular choice' },
      { name: 'Platinum Pack', coins: 3000, price: 2499, description: 'Best value' },
      { name: 'Diamond Pack', coins: 7000, price: 4999, description: 'Mega pack' },
    ];

    for (const pkg of packages) {
      await CoinPackage.findOneAndUpdate(
        { name: pkg.name },
        pkg,
        { upsert: true, new: true }
      );
    }
    AppLogger.info('✅ Coin packages seeded');
  } catch (error) {
    AppLogger.error('❌ Error seeding coin packages:', error);
  }
}
