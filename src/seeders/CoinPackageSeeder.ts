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

    const websitePackages = [
      { name: 'Starter Pack', coins: 100, bonus: 0, price: 99, targetAudience: 'website', isRecommended: false, isFeatured: false, description: 'Starter package for website recharge' },
      { name: 'Popular Pack', coins: 500, bonus: 50, price: 499, targetAudience: 'website', isRecommended: false, isFeatured: true, description: 'Popular coin bundle with bonus' },
      { name: 'Value Pack', coins: 1000, bonus: 150, price: 999, targetAudience: 'website', isRecommended: true, isFeatured: true, description: 'Most popular value recharge plan' },
      { name: 'Pro Pack', coins: 2500, bonus: 400, price: 2499, targetAudience: 'website', isRecommended: false, isFeatured: false, description: 'Pro streamer & live enthusiast pack' },
      { name: 'Elite Pack', coins: 5000, bonus: 1000, price: 4999, targetAudience: 'website', isRecommended: false, isFeatured: true, description: 'Elite recharge pack with 1000 bonus coins' },
      { name: 'Master Pack', coins: 10000, bonus: 2500, price: 9999, targetAudience: 'website', isRecommended: false, isFeatured: false, description: 'Master pack for top gifters' },
      { name: 'Champion Pack', coins: 25000, bonus: 7000, price: 24999, targetAudience: 'website', isRecommended: false, isFeatured: true, description: 'Champion bundle with massive 7000 bonus' },
      { name: 'Legend Pack', coins: 50000, bonus: 15000, price: 49999, targetAudience: 'website', isRecommended: false, isFeatured: true, description: 'Legendary pack for VIP community leaders' },
    ];

    for (const pkg of websitePackages) {
      await CoinPackage.findOneAndUpdate(
        { name: pkg.name, targetAudience: 'website' },
        pkg,
        { upsert: true, new: true }
      );
    }

    AppLogger.info('✅ Coin packages and Website recharge plans seeded');
  } catch (error) {
    AppLogger.error('❌ Error seeding coin packages:', error);
  }
}
