import { Service } from 'typedi';
import CoinPackage from '../../models/CoinPackage';
import CoinHistory from '../../models/CoinHistory';
import User from '../../models/User';
import mongoose from 'mongoose';

@Service()
export class CoinService {
  async getPackages() {
    return await CoinPackage.find({ isActive: true }).sort({ coins: 1 });
  }

  async getWallet(userId: string) {
    const user = await User.findById(userId).select('coins');
    if (!user) throw new Error('User not found');
    return { coins: user.coins || 0 };
  }

  async getHistory(userId: string) {
    return await CoinHistory.find({ userId }).sort({ createdAt: -1 });
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
