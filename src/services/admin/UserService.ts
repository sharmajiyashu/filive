import { Service, Container } from 'typedi';
import mongoose from 'mongoose';
import User from '../../models/User';
import AgencyHost from '../../models/AgencyHost';
import CoinHistory from '../../models/CoinHistory';
import { LevelService } from '../app/LevelService';
import { getUserCountryAndLevels } from '../../utils/userLookup';

@Service()
export class UserService {
  public async getUsers(pagination: { page: number; limit: number }, filters: any) {
    const { page, limit } = pagination;
    const { search, city, state, role } = filters;

    const query: any = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { mobile: { $regex: search, $options: 'i' } }
      ];

      const searchNumber = Number(search);
      if (!isNaN(searchNumber)) {
        query.$or.push({ userId: searchNumber });
      }
    }
    if (city) query['location.city'] = city;
    if (state) query['location.state'] = state;
    if (role) query.userRole = role;

    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .populate('profileImage')
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    return {
      users,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  public async toggleCoinseller(userId: string) {
    const user = await User.findById(userId);
    if (!user) throw new Error('USER_NOT_FOUND');
    user.isCoinseller = !user.isCoinseller;
    await user.save();
    return user;
  }

  public async setCoinsellerAndRemoveFromAgencies(userId: string, isCoinseller: boolean = true) {
    const user = await User.findById(userId);
    if (!user) throw new Error('USER_NOT_FOUND');

    user.isCoinseller = isCoinseller;
    await user.save();

    const removedHosts = await AgencyHost.deleteMany({ userId: user._id });

    return {
      user,
      agencyHostsRemoved: removedHosts.deletedCount ?? 0,
    };
  }

  public async adjustCoinsellerCoins(userId: string, amount: number, description?: string) {
    const user = await User.findById(userId);
    if (!user) throw new Error('USER_NOT_FOUND');
    
    const currentVal = user.coinSellerCoins || 0;
    const newVal = currentVal + amount;
    
    if (newVal < 0) {
      throw new Error(`Insufficient coinseller coins. Resulting balance cannot be less than zero.`);
    }

    user.coinSellerCoins = newVal;
    await user.save();

    // Log transaction history
    await CoinHistory.create({
      userId: user._id,
      amount: amount,
      type: 'other',
      description: description || (amount >= 0 ? 'Added by Admin' : 'Deducted by Admin'),
    });

    return user;
  }

  public async updateVideoVerificationStatus(userId: string, status: 'approved' | 'rejected') {
    const user = await User.findById(userId);
    if (!user) throw new Error('USER_NOT_FOUND');
    
    user.videoVerificationStatus = status;
    await user.save();
    return user;
  }

  public async getCoinTradersList(params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: 'active' | 'inactive' | 'all';
    startDate?: string;
    endDate?: string;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.max(1, Math.min(100, params.limit || 10));
    const skip = (page - 1) * limit;

    const query: any = { isCoinseller: true };

    if (params.status === 'active') {
      query.isBlocked = false;
    } else if (params.status === 'inactive') {
      query.isBlocked = true;
    }

    if (params.search) {
      const searchRegex = new RegExp(params.search, 'i');
      const numericSearch = Number(params.search);
      query.$or = [
        { name: searchRegex },
        { email: searchRegex },
        { mobile: searchRegex },
        { whatsapp: searchRegex },
        ...(!isNaN(numericSearch) ? [{ userId: numericSearch }] : []),
      ];
    }

    if (params.startDate || params.endDate) {
      query.createdAt = {};
      if (params.startDate) query.createdAt.$gte = new Date(params.startDate);
      if (params.endDate) query.createdAt.$lte = new Date(params.endDate);
    }

    const [totalTraders, activeTraders, inactiveTraders, totalCoinsAgg, totalSpentAgg] = await Promise.all([
      User.countDocuments({ isCoinseller: true }),
      User.countDocuments({ isCoinseller: true, isBlocked: false }),
      User.countDocuments({ isCoinseller: true, isBlocked: true }),
      User.aggregate([
        { $match: { isCoinseller: true } },
        { $group: { _id: null, total: { $sum: '$coinSellerCoins' } } }
      ]),
      CoinHistory.aggregate([
        { $match: { type: 'transfer', amount: { $lt: 0 } } },
        { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } }
      ]),
    ]);

    const totalCoins = totalCoinsAgg[0]?.total || 0;
    const totalSpentCoins = totalSpentAgg[0]?.total || 0;

    const filteredTotal = await User.countDocuments(query);
    const traders = await User.find(query)
      .populate('profileImage')
      .populate('countryId')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const tradersWithStats = await Promise.all(
      traders.map(async (trader) => {
        const spentAgg = await CoinHistory.aggregate([
          { $match: { userId: trader._id, type: 'transfer', amount: { $lt: 0 } } },
          { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } }
        ]);
        const spentCoins = spentAgg[0]?.total || 0;

        return {
          ...trader,
          spentCoins,
          coinBalance: trader.coinSellerCoins || trader.coins || 0,
        };
      })
    );

    return {
      traders: tradersWithStats,
      summary: {
        totalTraders,
        activeTraders,
        inactiveTraders,
        totalCoins,
        totalSpentCoins,
      },
      pagination: {
        total: filteredTotal,
        page,
        limit,
        totalPages: Math.ceil(filteredTotal / limit),
      },
    };
  }

  public async getCoinTraderDetails(userId: string, page = 1, limit = 20) {
    let query: any = {};
    if (mongoose.Types.ObjectId.isValid(userId)) {
      query = { _id: userId };
    } else {
      const numericId = Number(userId);
      if (!isNaN(numericId)) {
        query = { userId: numericId };
      } else {
        query = { _id: userId };
      }
    }

    const user = await User.findOne(query)
      .populate('profileImage')
      .populate('countryId');

    if (!user) {
      throw new Error('Coin Trader user not found');
    }

    const userObjectId = user._id;

    // Aggregate stats from CoinHistory
    const [spentAgg, receivedAgg, giftsAgg, withdrawAgg, rechargeAgg] = await Promise.all([
      CoinHistory.aggregate([
        { $match: { userId: userObjectId, type: 'transfer', amount: { $lt: 0 } } },
        { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } }
      ]),
      CoinHistory.aggregate([
        { $match: { userId: userObjectId, type: 'transfer', amount: { $gt: 0 } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      CoinHistory.aggregate([
        { $match: { userId: userObjectId, type: 'gift_received' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      CoinHistory.aggregate([
        { $match: { userId: userObjectId, type: 'cash_out' } },
        { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } }
      ]),
      CoinHistory.aggregate([
        { $match: { userId: userObjectId, type: 'recharge' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
    ]);

    const spentCoins = spentAgg[0]?.total || 0;
    const receivedCoins = receivedAgg[0]?.total || 0;
    const receivedGifts = giftsAgg[0]?.total || 0;
    const withdrawnCoins = withdrawAgg[0]?.total || 0;
    const topUpCoins = rechargeAgg[0]?.total || user.coins || 0;

    // Get Country and Levels
    const levelService = Container.get(LevelService);
    const { country, level, levelInfo } = await getUserCountryAndLevels(user, levelService);

    // Paginated Coin History for this user
    const historySkip = (page - 1) * limit;
    const historyTotal = await CoinHistory.countDocuments({ userId: userObjectId });
    const transactions = await CoinHistory.find({ userId: userObjectId })
      .populate({ path: 'relatedUserId', select: 'name email userId profileImage', populate: { path: 'profileImage' } })
      .sort({ createdAt: -1 })
      .skip(historySkip)
      .limit(limit);

    const incomeAgg = await CoinHistory.aggregate([
      { $match: { userId: userObjectId, amount: { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const outgoingAgg = await CoinHistory.aggregate([
      { $match: { userId: userObjectId, amount: { $lt: 0 } } },
      { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } }
    ]);

    const totalIncome = incomeAgg[0]?.total || 0;
    const totalOutgoing = outgoingAgg[0]?.total || 0;

    return {
      user: {
        _id: user._id,
        userId: user.userId,
        name: user.name || 'Trader',
        email: user.email || '',
        mobile: user.mobile || '',
        whatsapp: user.whatsapp || user.mobile || '',
        gender: user.gender || 'Male',
        dob: user.dob,
        age: user.dob ? new Date().getFullYear() - new Date(user.dob).getFullYear() : 18,
        profileImage: user.profileImage,
        isBlocked: user.isBlocked,
        isVerified: user.isVerified,
        isCoinseller: user.isCoinseller,
        createdAt: user.createdAt,
        country: user.country || 'India',
        countryObject: country,
        audioCallPrice: user.audioCallChargePerMinute || user.voiceCallPrice || 25,
        videoCallPrice: user.videoCallChargePerMinute || user.videoCallPrice || 50,
        loginType: user.email ? 'Email' : 'Mobile',
        identityDeviceId: user._id.toString().toUpperCase(),
      },
      stats: {
        coins: user.coins || 0,
        coinSellerCoins: user.coinSellerCoins || 0,
        topUpCoins,
        spentCoins,
        receivedCoins,
        receivedGifts,
        withdrawnCoins,
      },
      level: {
        name: levelInfo?.levelName || 'Sapphire Visionary',
        levelNumber: level || 7,
        currentCoins: user.wealthCoins || user.coins || 0,
        nextThreshold: 5599,
        progressText: `${user.wealthCoins || user.coins || 0} / 5599`,
        permissions: ['Live Streaming', 'Free Call', 'Redeem Cashout', 'Upload Social Post', 'Upload Video'],
      },
      historySummary: {
        totalTransactions: historyTotal,
        totalIncome,
        totalOutgoing,
        transactions,
        pagination: {
          total: historyTotal,
          page,
          limit,
          totalPages: Math.ceil(historyTotal / limit),
        },
      },
    };
  }
}

