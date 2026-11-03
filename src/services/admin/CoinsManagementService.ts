import { Service, Inject } from 'typedi';
import mongoose from 'mongoose';
import User from '../../models/User';
import CoinHistory from '../../models/CoinHistory';
import { LevelService } from '../app/LevelService';
import { UserService } from './UserService';
import { ageFromDob, getUserCountryAndLevels } from '../../utils/userLookup';

export interface ICoinsHistoryQuery {
  page?: number;
  limit?: number;
  search?: string;
  userId?: string;
  type?: string;
  startDate?: string;
  endDate?: string;
}

export interface ICoinsUsersQuery {
  page?: number;
  limit?: number;
  search?: string;
  minCoins?: number;
  sortBy?: 'coins' | 'wealthCoins' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

@Service()
export class CoinsManagementService {
  constructor(
    @Inject() private levelService: LevelService,
    @Inject() private userService: UserService
  ) {}

  /**
   * Overall platform coins metrics and circulation stats
   */
  public async getCoinsOverviewStats() {
    const [
      circulationAgg,
      wealthAgg,
      usersWithCoinsCount,
      totalTxCount,
      creditedAgg,
      debitedAgg,
      rechargeAgg,
      giftSpentAgg,
      callSpentAgg,
      exchangeAgg,
    ] = await Promise.all([
      // Total Coins currently held by all users
      User.aggregate([
        { $match: { coins: { $gt: 0 } } },
        { $group: { _id: null, total: { $sum: '$coins' } } },
      ]),
      // Total Wealth Coins held by all users
      User.aggregate([
        { $match: { wealthCoins: { $gt: 0 } } },
        { $group: { _id: null, total: { $sum: '$wealthCoins' } } },
      ]),
      // Total users holding coins
      User.countDocuments({ coins: { $gt: 0 } }),
      // Total coins transactions
      CoinHistory.countDocuments({ wallet: { $ne: 'beans' } }),
      // Total coins credited (positive amounts)
      CoinHistory.aggregate([
        { $match: { wallet: { $ne: 'beans' }, amount: { $gt: 0 } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      // Total coins debited (negative amounts)
      CoinHistory.aggregate([
        { $match: { wallet: { $ne: 'beans' }, amount: { $lt: 0 } } },
        { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } },
      ]),
      // Total coins purchased / recharged
      CoinHistory.aggregate([
        { $match: { wallet: { $ne: 'beans' }, type: { $in: ['recharge', 'coin_purchase', 'purchase', 'custom_recharge'] } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      // Total coins spent on gifts
      CoinHistory.aggregate([
        { $match: { wallet: { $ne: 'beans' }, type: 'send_gift' } },
        { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } },
      ]),
      // Total coins spent on calls
      CoinHistory.aggregate([
        { $match: { wallet: { $ne: 'beans' }, type: { $in: ['call_outgoing', 'call_spent', 'call_deduction'] } } },
        { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } },
      ]),
      // Total coins credited via beans to coins exchange
      CoinHistory.aggregate([
        { $match: { wallet: { $ne: 'beans' }, type: { $in: ['beans_to_coins', 'exchange'] } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);

    return {
      totalCoinsInCirculation: circulationAgg[0]?.total || 0,
      totalWealthCoins: wealthAgg[0]?.total || 0,
      totalUsersWithCoins: usersWithCoinsCount || 0,
      totalTransactions: totalTxCount || 0,
      totalCoinsCredited: creditedAgg[0]?.total || 0,
      totalCoinsDebited: debitedAgg[0]?.total || 0,
      totalCoinsPurchased: rechargeAgg[0]?.total || 0,
      totalCoinsSpentOnGifts: giftSpentAgg[0]?.total || 0,
      totalCoinsSpentOnCalls: callSpentAgg[0]?.total || 0,
      totalCoinsFromExchange: exchangeAgg[0]?.total || 0,
    };
  }

  /**
   * Paginated Coins Transaction History for Admin Panel with multi-filter & search
   */
  public async getCoinsHistory(params: ICoinsHistoryQuery) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(params.limit) || 20));
    const skip = (page - 1) * limit;

    const query: Record<string, any> = { wallet: { $ne: 'beans' } };

    // Filter by specific user
    if (params.userId) {
      if (mongoose.Types.ObjectId.isValid(params.userId)) {
        query.userId = new mongoose.Types.ObjectId(params.userId);
      } else {
        const numId = Number(params.userId);
        if (!isNaN(numId)) {
          const userDoc = await User.findOne({ userId: numId }).select('_id');
          if (userDoc) {
            query.userId = userDoc._id;
          } else {
            return {
              history: [],
              summary: { totalTransactions: 0, totalAdded: 0, totalDeducted: 0 },
              pagination: { total: 0, page, limit, totalPages: 0 },
            };
          }
        }
      }
    }

    // Filter by transaction type
    if (params.type && params.type !== 'all') {
      const t = params.type.toLowerCase();
      if (t === 'admin_credit') {
        query.paymentGateway = 'Admin';
        query.amount = { $gt: 0 };
      } else if (t === 'admin_debit') {
        query.paymentGateway = 'Admin';
        query.amount = { $lt: 0 };
      } else if (t === 'recharge' || t === 'coin_purchase') {
        query.type = { $in: ['recharge', 'coin_purchase', 'purchase', 'custom_recharge'] };
      } else if (t === 'send_gift' || t === 'gift_sent') {
        query.type = 'send_gift';
      } else if (t === 'call_spent' || t === 'call_outgoing') {
        query.type = { $in: ['call_outgoing', 'call_spent', 'call_deduction'] };
      } else if (t === 'exchange' || t === 'beans_to_coins') {
        query.type = { $in: ['beans_to_coins', 'exchange'] };
      } else {
        query.type = t;
      }
    }

    // Filter by Date Range
    if (params.startDate || params.endDate) {
      query.createdAt = {};
      if (params.startDate) query.createdAt.$gte = new Date(params.startDate);
      if (params.endDate) query.createdAt.$lte = new Date(params.endDate);
    }

    // Search by User Name, Mobile, Email, or Numeric ID
    if (params.search) {
      const searchRegex = new RegExp(params.search.trim(), 'i');
      const numericSearch = Number(params.search.trim());
      const userMatchConditions: any[] = [
        { name: searchRegex },
        { email: searchRegex },
        { mobile: searchRegex },
      ];
      if (!isNaN(numericSearch)) {
        userMatchConditions.push({ userId: numericSearch });
      }

      const matchingUsers = await User.find({ $or: userMatchConditions }).select('_id');
      const userIds = matchingUsers.map((u) => u._id);

      if (userIds.length > 0) {
        query.userId = { $in: userIds };
      } else {
        return {
          history: [],
          summary: { totalTransactions: 0, totalAdded: 0, totalDeducted: 0 },
          pagination: { total: 0, page, limit, totalPages: 0 },
        };
      }
    }

    const [total, history, summaryAgg] = await Promise.all([
      CoinHistory.countDocuments(query),
      CoinHistory.find(query)
        .populate({
          path: 'userId',
          select: 'name email mobile userId coins wealthCoins profileImage',
          populate: { path: 'profileImage' },
        })
        .populate({
          path: 'relatedUserId',
          select: 'name email mobile userId profileImage',
          populate: { path: 'profileImage' },
        })
        .populate({
          path: 'giftId',
          populate: { path: 'media', select: 'url' },
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      CoinHistory.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            totalAdded: { $sum: { $cond: [{ $gt: ['$amount', 0] }, '$amount', 0] } },
            totalDeducted: { $sum: { $cond: [{ $lt: ['$amount', 0] }, { $abs: '$amount' }, 0] } },
          },
        },
      ]),
    ]);

    return {
      history: history.map((item: any) => ({
        ...item,
        wallet: item.wallet || 'coins',
      })),
      summary: {
        totalTransactions: total,
        totalAdded: summaryAgg[0]?.totalAdded || 0,
        totalDeducted: summaryAgg[0]?.totalDeducted || 0,
      },
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Paginated list of users with Coins balances, wealth level, and total recharge stats
   */
  public async getCoinsUsers(params: ICoinsUsersQuery) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(params.limit) || 10));
    const skip = (page - 1) * limit;

    const query: Record<string, any> = { userRole: 'user' };

    if (params.minCoins !== undefined && !isNaN(Number(params.minCoins))) {
      query.coins = { $gte: Number(params.minCoins) };
    }

    if (params.search && params.search.trim() !== '') {
      const searchRegex = new RegExp(params.search.trim(), 'i');
      const numericSearch = Number(params.search.trim());
      const orConditions: any[] = [
        { name: searchRegex },
        { email: searchRegex },
        { mobile: searchRegex },
      ];
      if (!isNaN(numericSearch)) {
        orConditions.push({ userId: numericSearch });
      }
      query.$or = orConditions;
    }

    const sortField = params.sortBy === 'wealthCoins' ? 'wealthCoins' : params.sortBy === 'createdAt' ? 'createdAt' : 'coins';
    const sortDirection = params.sortOrder === 'asc' ? 1 : -1;
    const sort: Record<string, any> = { [sortField]: sortDirection };

    const [total, users] = await Promise.all([
      User.countDocuments(query),
      User.find(query)
        .populate('profileImage')
        .populate('country')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .select('userId name email mobile gender profileImage isBlocked coins wealthCoins beans level country countryCode createdAt'),
    ]);

    const formattedUsers = users.map((u: any) => {
      let countryName: string | null = null;
      let countryCode: string | null = null;
      if (u.country && typeof u.country === 'object') {
        countryName = u.country.name || null;
        countryCode = u.country.code || null;
      } else if (typeof u.country === 'string') {
        countryName = u.country;
      }
      if (!countryCode && u.countryCode) {
        countryCode = u.countryCode;
      }

      return {
        _id: u._id,
        userId: u.userId,
        name: u.name || 'User',
        email: u.email || '',
        mobile: u.mobile || '',
        gender: u.gender || 'Other',
        profileImage: u.profileImage,
        isBlocked: !!u.isBlocked,
        coins: u.coins || 0,
        wealthCoins: u.wealthCoins || 0,
        beans: u.beans || 0,
        level: u.level || 1,
        country: countryName,
        countryCode,
        createdAt: u.createdAt,
      };
    });

    return {
      users: formattedUsers,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Detailed Coins Profile for a specific user
   */
  public async getUserCoinsDetails(userIdParam: string, page = 1, limit = 20) {
    let query: any = {};
    if (mongoose.Types.ObjectId.isValid(userIdParam)) {
      query = { _id: userIdParam };
    } else {
      const numId = Number(userIdParam);
      if (!isNaN(numId)) {
        query = { userId: numId };
      } else {
        query = { email: userIdParam };
      }
    }

    const user = await User.findOne(query)
      .populate('profileImage')
      .populate('country');

    if (!user) {
      throw new Error('User not found');
    }

    const userObjectId = user._id;

    // Aggregate User's Coins statistics
    const [
      rechargeAgg,
      giftSpentAgg,
      callSpentAgg,
      exchangeAgg,
      adminAddedAgg,
      adminDeductedAgg,
      totalCreditedAgg,
      totalDebitedAgg,
    ] = await Promise.all([
      CoinHistory.aggregate([
        { $match: { userId: userObjectId, wallet: { $ne: 'beans' }, type: { $in: ['recharge', 'coin_purchase', 'purchase', 'custom_recharge'] } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      CoinHistory.aggregate([
        { $match: { userId: userObjectId, wallet: { $ne: 'beans' }, type: 'send_gift' } },
        { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } },
      ]),
      CoinHistory.aggregate([
        { $match: { userId: userObjectId, wallet: { $ne: 'beans' }, type: { $in: ['call_outgoing', 'call_spent', 'call_deduction'] } } },
        { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } },
      ]),
      CoinHistory.aggregate([
        { $match: { userId: userObjectId, wallet: { $ne: 'beans' }, type: { $in: ['beans_to_coins', 'exchange'] } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      CoinHistory.aggregate([
        { $match: { userId: userObjectId, wallet: { $ne: 'beans' }, paymentGateway: 'Admin', amount: { $gt: 0 } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      CoinHistory.aggregate([
        { $match: { userId: userObjectId, wallet: { $ne: 'beans' }, paymentGateway: 'Admin', amount: { $lt: 0 } } },
        { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } },
      ]),
      CoinHistory.aggregate([
        { $match: { userId: userObjectId, wallet: { $ne: 'beans' }, amount: { $gt: 0 } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      CoinHistory.aggregate([
        { $match: { userId: userObjectId, wallet: { $ne: 'beans' }, amount: { $lt: 0 } } },
        { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } },
      ]),
    ]);

    const { country, wealthLevel, richLevelInfo } = await getUserCountryAndLevels(user, this.levelService);

    // Paginated history
    const historySkip = (page - 1) * limit;
    const historyTotal = await CoinHistory.countDocuments({ userId: userObjectId, wallet: { $ne: 'beans' } });
    const transactions = await CoinHistory.find({ userId: userObjectId, wallet: { $ne: 'beans' } })
      .populate({
        path: 'relatedUserId',
        select: 'name email userId profileImage',
        populate: { path: 'profileImage' },
      })
      .populate({
        path: 'giftId',
        populate: { path: 'media', select: 'url' },
      })
      .sort({ createdAt: -1 })
      .skip(historySkip)
      .limit(limit);

    return {
      user: {
        _id: user._id,
        userId: user.userId,
        name: user.name || 'User',
        email: user.email || '',
        mobile: user.mobile || '',
        gender: user.gender || 'Other',
        dob: user.dob,
        age: ageFromDob(user.dob),
        profileImage: user.profileImage,
        isBlocked: user.isBlocked,
        isVerified: user.isVerified,
        country: country || null,
        countryCode: country?.code ?? null,
        createdAt: user.createdAt,
      },
      balances: {
        coins: user.coins || 0,
        wealthCoins: user.wealthCoins || 0,
        beans: user.beans || 0,
      },
      stats: {
        totalCredited: totalCreditedAgg[0]?.total || 0,
        totalDebited: totalDebitedAgg[0]?.total || 0,
        totalPurchased: rechargeAgg[0]?.total || 0,
        spentOnGifts: giftSpentAgg[0]?.total || 0,
        spentOnCalls: callSpentAgg[0]?.total || 0,
        fromExchange: exchangeAgg[0]?.total || 0,
        adminAddedCoins: adminAddedAgg[0]?.total || 0,
        adminDeductedCoins: adminDeductedAgg[0]?.total || 0,
      },
      level: {
        name: typeof richLevelInfo?.name === 'string' ? richLevelInfo.name : 'Bronze Explorer',
        levelNumber: typeof wealthLevel === 'number' ? wealthLevel : 1,
        wealthCoins: user.wealthCoins || 0,
      },
      historySummary: {
        totalTransactions: historyTotal,
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

  /**
   * Adjust Coins for user by Identifier (Numeric userId, ObjectId, email, or mobile)
   */
  public async adjustCoins(params: {
    identifier: string;
    amount: number;
    action: 'add' | 'deduct';
    description?: string;
  }) {
    const { identifier, amount, action, description } = params;
    if (!identifier || String(identifier).trim() === '') {
      throw new Error('User identifier is required');
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      throw new Error('Amount must be a positive number');
    }

    if (!['add', 'deduct'].includes(action)) {
      throw new Error("Action must be either 'add' or 'deduct'");
    }

    let query: any = {};
    const trimmedId = String(identifier).trim();
    if (mongoose.Types.ObjectId.isValid(trimmedId)) {
      query = { _id: trimmedId };
    } else {
      const numericId = Number(trimmedId);
      if (!isNaN(numericId)) {
        query = { userId: numericId };
      } else {
        query = { $or: [{ email: trimmedId }, { mobile: trimmedId }] };
      }
    }

    const user = await User.findOne(query);
    if (!user) {
      throw new Error('User not found with specified ID or details');
    }

    const signedAmount = action === 'add' ? numAmount : -numAmount;
    const updatedUser = await this.userService.adjustUserCoins(
      user._id.toString(),
      signedAmount,
      description
    );

    return {
      success: true,
      user: {
        _id: updatedUser._id,
        userId: updatedUser.userId,
        name: updatedUser.name,
        email: updatedUser.email,
        coins: updatedUser.coins,
      },
      action,
      amount: numAmount,
      signedAmount,
      message: `Successfully ${action === 'add' ? 'credited' : 'deducted'} ${numAmount} coins`,
    };
  }
}
