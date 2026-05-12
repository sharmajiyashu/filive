import { Service } from 'typedi';
import CoinPackage from '../../models/CoinPackage';
import CoinHistory from '../../models/CoinHistory';
import User from '../../models/User';
import Country from '../../models/Country';
import { calculateLocalPrice } from '../../utils/pricing';
import mongoose from 'mongoose';

@Service()
export class CoinService {
  async getPackages(countryId?: string) {
    const packages = await CoinPackage.find({ isActive: true }).sort({ coins: 1 });

    if (!countryId) {
      return packages.map(pkg => ({
        ...pkg.toObject(),
        localPrice: pkg.price,
        currencyCode: 'USD',
        currencySymbol: '$'
      }));
    }

    const country = await Country.findById(countryId);
    if (!country) {
      return packages.map(pkg => ({
        ...pkg.toObject(),
        localPrice: pkg.price,
        currencyCode: 'USD',
        currencySymbol: '$'
      }));
    }

    return packages.map(pkg => ({
      ...pkg.toObject(),
      localPrice: calculateLocalPrice(pkg.price, country.exchangeRate),
      currencyCode: country.currencyCode,
      currencySymbol: country.currencySymbol
    }));
  }

  async getWallet(userId: string) {
    const user = await User.findById(userId).select('coins');
    if (!user) throw new Error('User not found');
    return { coins: user.coins || 0 };
  }

  async getHistory(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [history, total] = await Promise.all([
      CoinHistory.find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      CoinHistory.countDocuments({ userId })
    ]);

    return {
      history,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async recharge(userId: string, packageId: string, transactionId: string) {
    const pkg = await CoinPackage.findById(packageId);
    if (!pkg) throw new Error('Package not found');

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      await User.findByIdAndUpdate(userId, { $inc: { coins: pkg.coins } }, { session });

      await CoinHistory.create([{
        userId,
        amount: pkg.coins,
        type: 'recharge',
        description: `Recharged with ${pkg.name}`,
        transactionId
      }], { session });

      await session.commitTransaction();
      return { success: true, coins: pkg.coins };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }
}

export default new CoinService();
