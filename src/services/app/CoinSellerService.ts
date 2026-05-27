import { Service } from 'typedi';
import mongoose from 'mongoose';
import User from '../../models/User';
import CoinHistory from '../../models/CoinHistory';

@Service()
export class CoinSellerService {
  constructor() {}

  async transferCoins(senderId: string, targetUserId: number, amount: number) {
    if (!amount || amount <= 0) {
      throw new Error('Transfer amount must be greater than zero');
    }

    const sender = await User.findById(senderId);
    if (!sender) throw new Error('Sender user not found');
    if ((sender.coins || 0) < amount) {
      throw new Error('Insufficient coins balance');
    }

    const target = await User.findOne({ userId: targetUserId });
    if (!target) {
      throw new Error('Recipient user with specified ID not found');
    }

    if (target._id.toString() === senderId) {
      throw new Error('You cannot transfer coins to yourself');
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Deduct from sender
      await User.findByIdAndUpdate(senderId, { $inc: { coins: -amount } }, { session });

      // Add to receiver
      await User.findByIdAndUpdate(target._id, { $inc: { coins: amount } }, { session });

      // Add history record for sender
      await CoinHistory.create([{
        userId: sender._id,
        relatedUserId: target._id,
        amount: -amount,
        type: 'transfer',
        description: `Transferred to ${target.name || 'User'} (ID: ${target.userId})`
      }], { session });

      // Add history record for receiver
      await CoinHistory.create([{
        userId: target._id,
        relatedUserId: sender._id,
        amount: amount,
        type: 'transfer',
        description: `Received from ${sender.name || 'User'} (ID: ${sender.userId})`
      }], { session });

      await session.commitTransaction();
      return {
        success: true,
        message: 'Coins transferred successfully',
        transferredAmount: amount,
        recipient: {
          id: target._id,
          userId: target.userId,
          name: target.name,
          email: target.email
        }
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async getSellerSalesHistory(sellerId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const sellerObjectId = new mongoose.Types.ObjectId(sellerId);

    // Sales are negative transfers out of the seller's account
    const query = {
      userId: sellerObjectId,
      type: 'transfer',
      amount: { $lt: 0 }
    };

    // Calculate total coins sold
    const salesAggregation = await CoinHistory.aggregate([
      { $match: { userId: sellerObjectId, type: 'transfer', amount: { $lt: 0 } } },
      { $group: { _id: null, totalCoinsSold: { $sum: { $abs: '$amount' } } } }
    ]);
    const totalCoinsSold = salesAggregation[0]?.totalCoinsSold || 0;

    const [history, total] = await Promise.all([
      CoinHistory.find(query)
        .sort({ createdAt: -1 })
        .populate({
          path: 'relatedUserId',
          select: 'userId name email profileImage bio isPremium country location',
          populate: { path: 'profileImage' }
        })
        .skip(skip)
        .limit(limit),
      CoinHistory.countDocuments(query)
    ]);

    const soldUsersList = history.map(h => {
      const relatedUser = h.relatedUserId as any;
      return {
        transactionId: h._id,
        coinsSold: Math.abs(h.amount),
        soldAt: h.createdAt,
        user: relatedUser ? {
          id: relatedUser._id,
          userId: relatedUser.userId,
          name: relatedUser.name,
          email: relatedUser.email,
          profileImage: relatedUser.profileImage,
          isPremium: relatedUser.isPremium,
          location: relatedUser.location,
          country: relatedUser.country
        } : null
      };
    });

    return {
      totalCoinsSold,
      soldUsersList,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async getSellerDashboard(sellerId: string) {
    const sellerObjectId = new mongoose.Types.ObjectId(sellerId);
    
    const seller = await User.findById(sellerId).select('userId name coins');
    if (!seller) throw new Error('Seller not found');

    // 1. Calculate total coins sold
    const salesAggregation = await CoinHistory.aggregate([
      { $match: { userId: sellerObjectId, type: 'transfer', amount: { $lt: 0 } } },
      { $group: { _id: null, totalCoinsSold: { $sum: { $abs: '$amount' } } } }
    ]);
    const totalCoinsSold = salesAggregation[0]?.totalCoinsSold || 0;

    // 2. Calculate customer numbers (unique buyers)
    const uniqueCustomers = await CoinHistory.distinct('relatedUserId', {
      userId: sellerObjectId,
      type: 'transfer',
      amount: { $lt: 0 }
    });
    const customerNumbers = uniqueCustomers.length;

    // 3. Calculate coin seller rank
    const rankingResult = await CoinHistory.aggregate([
      { $match: { type: 'transfer', amount: { $lt: 0 } } },
      { $group: { _id: '$userId', totalSold: { $sum: { $abs: '$amount' } } } },
      { $sort: { totalSold: -1 } }
    ]);
    const rankIndex = rankingResult.findIndex(r => r._id.toString() === sellerId);
    const coinSellerRank = rankIndex !== -1 ? rankIndex + 1 : rankingResult.length + 1;

    return {
      userId: seller.userId,
      name: seller.name,
      availableBalance: seller.coins || 0,
      totalCoinsSold,
      customerNumbers,
      coinSellerRank
    };
  }
}
