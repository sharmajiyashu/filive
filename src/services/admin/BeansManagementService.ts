import { Service, Inject, Container } from 'typedi';
import mongoose from 'mongoose';
import User from '../../models/User';
import CoinHistory from '../../models/CoinHistory';
import Country from '../../models/Country';
import AppLogger from '../../api/loaders/logger';
import { LevelService } from '../app/LevelService';
import { UserService } from './UserService';
import { ageFromDob, getUserCountryAndLevels } from '../../utils/userLookup';

export interface IBeansHistoryQuery {
  page?: number;
  limit?: number;
  search?: string;
  userId?: string;
  type?: string;
  startDate?: string;
  endDate?: string;
}

export interface IBeansUsersQuery {
  page?: number;
  limit?: number;
  search?: string;
  minBeans?: number;
  sortBy?: 'beans' | 'charmCoins' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

@Service()
export class BeansManagementService {
  constructor(
    @Inject() private levelService: LevelService,
    @Inject() private userService: UserService
  ) {}

  /**
   * Overall platform beans metrics and circulation stats
   */
  public async getBeansOverviewStats() {
    const [
      circulationAgg,
      charmAgg,
      usersWithBeansCount,
      totalTxCount,
      creditedAgg,
      debitedAgg,
      cashOutAgg,
      exchangedAgg,
      giftIncomeAgg,
      callIncomeAgg,
    ] = await Promise.all([
      // Total Beans currently held by all users
      User.aggregate([
        { $match: { beans: { $gt: 0 } } },
        { $group: { _id: null, total: { $sum: '$beans' } } },
      ]),
      // Total Charm Coins held by all users
      User.aggregate([
        { $match: { charmCoins: { $gt: 0 } } },
        { $group: { _id: null, total: { $sum: '$charmCoins' } } },
      ]),
      // Total users holding beans
      User.countDocuments({ beans: { $gt: 0 } }),
      // Total beans transactions
      CoinHistory.countDocuments({ wallet: 'beans' }),
      // Total beans credited (positive amounts)
      CoinHistory.aggregate([
        { $match: { wallet: 'beans', amount: { $gt: 0 } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      // Total beans debited (negative amounts)
      CoinHistory.aggregate([
        { $match: { wallet: 'beans', amount: { $lt: 0 } } },
        { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } },
      ]),
      // Total beans cashed out
      CoinHistory.aggregate([
        { $match: { wallet: 'beans', type: 'cash_out' } },
        { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } },
      ]),
      // Total beans converted to coins
      CoinHistory.aggregate([
        { $match: { wallet: 'beans', type: { $in: ['beans_to_coins', 'exchange'] } } },
        { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } },
      ]),
      // Total beans earned from live gifts
      CoinHistory.aggregate([
        { $match: { wallet: 'beans', type: 'gift_received' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      // Total beans earned from calls
      CoinHistory.aggregate([
        { $match: { wallet: 'beans', type: 'call_income' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);

    return {
      totalBeansInCirculation: circulationAgg[0]?.total || 0,
      totalCharmCoins: charmAgg[0]?.total || 0,
      totalUsersWithBeans: usersWithBeansCount || 0,
      totalTransactions: totalTxCount || 0,
      totalBeansCredited: creditedAgg[0]?.total || 0,
      totalBeansDebited: debitedAgg[0]?.total || 0,
      totalCashOutBeans: cashOutAgg[0]?.total || 0,
      totalExchangedBeans: exchangedAgg[0]?.total || 0,
      totalGiftIncomeBeans: giftIncomeAgg[0]?.total || 0,
      totalCallIncomeBeans: callIncomeAgg[0]?.total || 0,
    };
  }

  /**
   * Paginated Beans Transaction History for Admin Panel with multi-filter & search
   */
  public async getBeansHistory(params: IBeansHistoryQuery) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(params.limit) || 20));
    const skip = (page - 1) * limit;

    const query: Record<string, any> = { wallet: 'beans' };

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
        query.type = { $in: ['charm_received', 'other'] };
        query.paymentGateway = 'Admin';
        query.amount = { $gt: 0 };
      } else if (t === 'admin_debit') {
        query.paymentGateway = 'Admin';
        query.amount = { $lt: 0 };
      } else if (t === 'gift_received' || t === 'gift_income') {
        query.type = 'gift_received';
      } else if (t === 'call_income') {
        query.type = 'call_income';
      } else if (t === 'cash_out') {
        query.type = 'cash_out';
      } else if (t === 'exchange' || t === 'beans_to_coins') {
        query.type = { $in: ['beans_to_coins', 'exchange'] };
      } else if (t === 'agency_commission') {
        query.type = 'agency_commission';
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
      const matchingIds = matchingUsers.map(u => u._id);
      if (matchingIds.length > 0) {
        if (query.userId) {
          query.$and = [
            { userId: query.userId },
            { userId: { $in: matchingIds } }
          ];
          delete query.userId;
        } else {
          query.userId = { $in: matchingIds };
        }
      } else {
        return {
          history: [],
          summary: { totalTransactions: 0, totalAdded: 0, totalDeducted: 0 },
          pagination: { total: 0, page, limit, totalPages: 0 },
        };
      }
    }

    const [total, history, addedAgg, deductedAgg] = await Promise.all([
      CoinHistory.countDocuments(query),
      CoinHistory.find(query)
        .populate({
          path: 'userId',
          select: 'name email userId profileImage mobile beans charmCoins isCoinseller',
          populate: { path: 'profileImage' },
        })
        .populate({
          path: 'relatedUserId',
          select: 'name email userId profileImage mobile',
          populate: { path: 'profileImage' },
        })
        .populate({
          path: 'giftId',
          populate: { path: 'media', select: 'url' },
        })
        .populate({
          path: 'callId',
          select: 'callType duration',
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      CoinHistory.aggregate([
        { $match: { ...query, amount: { $gt: 0 } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      CoinHistory.aggregate([
        { $match: { ...query, amount: { $lt: 0 } } },
        { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } },
      ]),
    ]);

    const totalAdded = addedAgg[0]?.total || 0;
    const totalDeducted = deductedAgg[0]?.total || 0;

    return {
      history,
      summary: {
        totalTransactions: total,
        totalAdded,
        totalDeducted,
      },
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Paginated list of users with Beans balances, earnings, and level details
   */
  public async getBeansUsersList(params: IBeansUsersQuery) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(params.limit) || 10));
    const skip = (page - 1) * limit;

    const query: Record<string, any> = {};

    if (params.minBeans !== undefined && !isNaN(Number(params.minBeans))) {
      query.beans = { $gte: Number(params.minBeans) };
    }

    if (params.search) {
      const searchRegex = new RegExp(params.search.trim(), 'i');
      const numericSearch = Number(params.search.trim());
      query.$or = [
        { name: searchRegex },
        { email: searchRegex },
        { mobile: searchRegex },
        ...(!isNaN(numericSearch) ? [{ userId: numericSearch }] : []),
      ];
    }

    const sortField = params.sortBy === 'charmCoins'
      ? 'charmCoins'
      : (params.sortBy === 'createdAt' ? 'createdAt' : 'beans');
    const sortOrder = params.sortOrder === 'asc' ? 1 : -1;
    const sortObj: any = { [sortField]: sortOrder };

    const [total, users] = await Promise.all([
      User.countDocuments(query),
      User.find(query)
        .populate('profileImage')
        .populate('countryId')
        .select('name email userId mobile beans charmCoins coins wealthCoins isVerified isBlocked country createdAt')
        .sort(sortObj)
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    const usersWithStats = await Promise.all(
      users.map(async (u: any) => {
        const [earnedAgg, withdrawnAgg, txCount] = await Promise.all([
          CoinHistory.aggregate([
            { $match: { userId: u._id, wallet: 'beans', amount: { $gt: 0 } } },
            { $group: { _id: null, total: { $sum: '$amount' } } },
          ]),
          CoinHistory.aggregate([
            { $match: { userId: u._id, wallet: 'beans', type: 'cash_out' } },
            { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } },
          ]),
          CoinHistory.countDocuments({ userId: u._id, wallet: 'beans' }),
        ]);

        return {
          ...u,
          totalBeansEarned: earnedAgg[0]?.total || 0,
          totalBeansWithdrawn: withdrawnAgg[0]?.total || 0,
          beansTransactionCount: txCount || 0,
        };
      })
    );

    return {
      users: usersWithStats,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Detailed Beans Profile & Statistics for a specific user
   */
  public async getUserBeansDetails(userIdOrNum: string, page = 1, limit = 20) {
    let query: any = {};
    if (mongoose.Types.ObjectId.isValid(userIdOrNum)) {
      query = { _id: userIdOrNum };
    } else {
      const numericId = Number(userIdOrNum);
      if (!isNaN(numericId)) {
        query = { userId: numericId };
      } else {
        query = { _id: userIdOrNum };
      }
    }

    const user = await User.findOne(query)
      .populate('profileImage')
      .populate('countryId');

    if (!user) {
      throw new Error('User not found');
    }

    const userObjectId = user._id;

    // Aggregated statistics for Beans
    const [
      giftEarnedAgg,
      callEarnedAgg,
      agencyCommissionAgg,
      cashOutAgg,
      exchangedAgg,
      adminAddedAgg,
      adminDeductedAgg,
      totalIncomeAgg,
      totalOutgoingAgg,
    ] = await Promise.all([
      CoinHistory.aggregate([
        { $match: { userId: userObjectId, wallet: 'beans', type: 'gift_received' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      CoinHistory.aggregate([
        { $match: { userId: userObjectId, wallet: 'beans', type: 'call_income' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      CoinHistory.aggregate([
        { $match: { userId: userObjectId, wallet: 'beans', type: 'agency_commission' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      CoinHistory.aggregate([
        { $match: { userId: userObjectId, wallet: 'beans', type: 'cash_out' } },
        { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } },
      ]),
      CoinHistory.aggregate([
        { $match: { userId: userObjectId, wallet: 'beans', type: { $in: ['beans_to_coins', 'exchange'] } } },
        { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } },
      ]),
      CoinHistory.aggregate([
        { $match: { userId: userObjectId, wallet: 'beans', paymentGateway: 'Admin', amount: { $gt: 0 } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      CoinHistory.aggregate([
        { $match: { userId: userObjectId, wallet: 'beans', paymentGateway: 'Admin', amount: { $lt: 0 } } },
        { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } },
      ]),
      CoinHistory.aggregate([
        { $match: { userId: userObjectId, wallet: 'beans', amount: { $gt: 0 } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      CoinHistory.aggregate([
        { $match: { userId: userObjectId, wallet: 'beans', amount: { $lt: 0 } } },
        { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } },
      ]),
    ]);

    const { country, level, levelInfo } = await getUserCountryAndLevels(user, this.levelService);

    // Paginated history
    const historySkip = (page - 1) * limit;
    const historyTotal = await CoinHistory.countDocuments({ userId: userObjectId, wallet: 'beans' });
    const transactions = await CoinHistory.find({ userId: userObjectId, wallet: 'beans' })
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
        beans: user.beans || 0,
        withdrawableBeans: user.beans || 0,
        charmCoins: user.charmCoins || 0,
        coins: user.coins || 0,
      },
      stats: {
        totalEarned: totalIncomeAgg[0]?.total || 0,
        totalWithdrawnOrSpent: totalOutgoingAgg[0]?.total || 0,
        giftIncomeBeans: giftEarnedAgg[0]?.total || 0,
        callIncomeBeans: callEarnedAgg[0]?.total || 0,
        agencyCommissionBeans: agencyCommissionAgg[0]?.total || 0,
        cashOutBeans: cashOutAgg[0]?.total || 0,
        exchangedBeans: exchangedAgg[0]?.total || 0,
        adminAddedBeans: adminAddedAgg[0]?.total || 0,
        adminDeductedBeans: adminDeductedAgg[0]?.total || 0,
      },
      level: {
        name: typeof levelInfo?.name === 'string' ? levelInfo.name : 'Rising Star',
        levelNumber: typeof level === 'number' ? level : 1,
        charmCoins: user.charmCoins || 0,
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
   * Adjust Beans for user by Identifier (Numeric userId, ObjectId, email, or mobile)
   */
  public async adjustBeans(params: {
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
    const updatedUser = await this.userService.adjustUserBeans(
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
        beans: updatedUser.beans,
      },
      action,
      amount: numAmount,
      signedAmount,
      message: `Successfully ${action === 'add' ? 'credited' : 'deducted'} ${numAmount} beans`,
    };
  }
}
