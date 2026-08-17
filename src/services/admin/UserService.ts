import { Service, Container, Inject } from 'typedi';
import mongoose from 'mongoose';
import User from '../../models/User';
import AgencyHost from '../../models/AgencyHost';
import Agency from '../../models/Agency';
import CoinHistory from '../../models/CoinHistory';
import Country from '../../models/Country';
import Follow from '../../models/Follow';
import { LevelService } from '../app/LevelService';
import { getUserCountryAndLevels } from '../../utils/userLookup';
import { FirebasePushService } from '../common/FirebasePushService';
import AppLogger from '../../api/loaders/logger';

type RestrictionBlockType = 'permanent' | 'temporary' | 'instant' | 'device_ban';

export interface RestrictionNotifyResult {
  user: any;
  restriction: {
    reason: string;
    blockedUntil: Date | null;
    blockType: RestrictionBlockType | 'none';
    isBlocked: boolean;
    instantBlock: boolean;
    deviceBan: boolean;
  };
  notified: { socket: boolean; push: boolean };
}

@Service()
export class UserService {
  constructor(@Inject() private firebasePushService: FirebasePushService) {}

  /**
   * Mobile clients should listen for socket event `account_blocked` and clear session/logout.
   * Payload: { type, reason, blockedUntil, blockType, isBlocked, instantBlock, deviceBan }
   * FCM data uses the same keys (all string values).
   */
  private async notifyAccountBlocked(
    user: any,
    blockType: RestrictionBlockType
  ): Promise<{ socket: boolean; push: boolean }> {
    const userId = user._id.toString();
    const reason = user.blockReason || 'Your account has been restricted by Admin';
    const blockedUntilIso = user.blockedUntil ? new Date(user.blockedUntil).toISOString() : '';
    const payload = {
      type: 'account_blocked',
      reason,
      blockedUntil: blockedUntilIso,
      blockType,
      isBlocked: 'true',
      instantBlock: user.instantBlock ? 'true' : 'false',
      deviceBan: user.deviceBan ? 'true' : 'false',
    };

    let socketNotified = false;
    let pushNotified = false;

    try {
      const io = Container.get('socket') as any;
      if (io) {
        const room = `user_${userId}`;
        const sockets = typeof io.in === 'function' && io.in(room).fetchSockets
          ? await io.in(room).fetchSockets()
          : [];

        if (sockets.length > 0) {
          for (const s of sockets) {
            s.emit('account_blocked', {
              ...payload,
              isBlocked: true,
              instantBlock: !!user.instantBlock,
              deviceBan: !!user.deviceBan,
            });
            s.disconnect(true);
          }
        } else {
          io.to(room).emit('account_blocked', {
            ...payload,
            isBlocked: true,
            instantBlock: !!user.instantBlock,
            deviceBan: !!user.deviceBan,
          });
        }
        socketNotified = true;
      }
    } catch (err) {
      AppLogger.warn(`account_blocked socket notify failed for ${userId}: ${err}`);
    }

    try {
      const untilText = blockedUntilIso
        ? ` Until: ${new Date(blockedUntilIso).toLocaleString()}`
        : ' This restriction is permanent.';
      await this.firebasePushService.notifyUser(userId, {
        title: 'Account Restricted',
        body: `${reason}.${untilText}`,
        data: payload,
      });
      pushNotified = true;
    } catch (err) {
      AppLogger.warn(`account_blocked push notify failed for ${userId}: ${err}`);
    }

    return { socket: socketNotified, push: pushNotified };
  }

  private async notifyAccountUnblocked(user: any): Promise<{ socket: boolean; push: boolean }> {
    const userId = user._id.toString();
    const payload = {
      type: 'account_unblocked',
      reason: '',
      blockedUntil: '',
      blockType: 'none',
      isBlocked: 'false',
      instantBlock: 'false',
      deviceBan: 'false',
    };

    let socketNotified = false;
    let pushNotified = false;

    try {
      const io = Container.get('socket') as any;
      if (io) {
        io.to(`user_${userId}`).emit('account_unblocked', {
          type: 'account_unblocked',
          isBlocked: false,
        });
        socketNotified = true;
      }
    } catch (err) {
      AppLogger.warn(`account_unblocked socket notify failed for ${userId}: ${err}`);
    }

    try {
      await this.firebasePushService.notifyUser(userId, {
        title: 'Account Restored',
        body: 'Your account restriction has been removed. You can use the app again.',
        data: payload,
      });
      pushNotified = true;
    } catch (err) {
      AppLogger.warn(`account_unblocked push notify failed for ${userId}: ${err}`);
    }

    return { socket: socketNotified, push: pushNotified };
  }

  private buildRestrictionResult(
    user: any,
    blockType: RestrictionBlockType | 'none',
    notified: { socket: boolean; push: boolean }
  ): RestrictionNotifyResult {
    return {
      user,
      restriction: {
        reason: user.blockReason || '',
        blockedUntil: user.blockedUntil || null,
        blockType,
        isBlocked: !!user.isBlocked,
        instantBlock: !!user.instantBlock,
        deviceBan: !!user.deviceBan,
      },
      notified,
    };
  }
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

  public async getUsersManagementList(params: {
    page?: number;
    limit?: number;
    search?: string;
    category?: string;
    country?: string;
    status?: string;
    role?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.max(1, Math.min(100, params.limit || 10));
    const skip = (page - 1) * limit;

    const query: any = {};

    // Category filter
    if (params.category && params.category !== 'all') {
      if (params.category === 'vip') {
        query.isPremium = true;
      } else if (params.category === 'normal' || params.category === 'real') {
        query.isPremium = false;
      }
    }

    // Country filter
    if (params.country && params.country !== 'all') {
      query.country = new RegExp(params.country, 'i');
    }

    // Status filter
    if (params.status && params.status !== 'all') {
      if (params.status === 'blocked') {
        query.isBlocked = true;
      } else if (params.status === 'active') {
        query.isBlocked = false;
      } else if (params.status === 'online') {
        const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
        query.lastLoginAt = { $gte: fifteenMinsAgo };
      } else if (params.status === 'offline') {
        const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
        query.$or = [{ lastLoginAt: { $lt: fifteenMinsAgo } }, { lastLoginAt: { $exists: false } }];
      }
    }

    // Role filter
    if (params.role && params.role !== 'all') {
      if (params.role === 'coinseller') {
        query.isCoinseller = true;
      } else if (params.role === 'admin') {
        query.userRole = 'admin';
      } else if (params.role === 'user') {
        query.userRole = 'user';
      }
    }

    // Search filter
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

    // Date range filter
    if (params.startDate || params.endDate) {
      query.createdAt = {};
      if (params.startDate) query.createdAt.$gte = new Date(params.startDate);
      if (params.endDate) query.createdAt.$lte = new Date(params.endDate);
    }

    // Aggregated Header Stats
    const [totalUsers, totalActiveUsers, males, females] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ isBlocked: false }),
      User.countDocuments({ gender: 'Male' }),
      User.countDocuments({ gender: 'Female' }),
    ]);

    const filteredTotal = await User.countDocuments(query);
    const users = await User.find(query)
      .populate('profileImage')
      .populate('countryId')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const levelService = Container.get(LevelService);

    const populatedUsers = await Promise.all(
      users.map(async (u) => {
        const userObj: any = u;
        const [followersCount, followingCount, friendsCount] = await Promise.all([
          Follow.countDocuments({ followingId: userObj._id }),
          Follow.countDocuments({ followerId: userObj._id }),
          Follow.countDocuments({ followerId: userObj._id, status: 'accepted' }),
        ]);

        const { level, levelInfo } = await getUserCountryAndLevels(userObj, levelService);

        const isOnline = userObj.lastLoginAt
          ? new Date(userObj.lastLoginAt).getTime() > Date.now() - 15 * 60 * 1000
          : false;

        let roleBadge = 'User';
        if (userObj.userRole === 'admin') roleBadge = 'Admin';
        else if (userObj.isCoinseller) roleBadge = 'CoinSeller';

        const age = userObj.dob ? new Date().getFullYear() - new Date(userObj.dob).getFullYear() : 18;

        const levelNum = typeof level === 'number' ? level : (typeof levelInfo?.currentLevel?.levelNumber === 'number' ? levelInfo.currentLevel.levelNumber : 1);
        const levelNameVal = levelInfo?.currentLevel?.name || levelInfo?.name;
        const levelNameStr = typeof levelNameVal === 'string' ? levelNameVal : (typeof levelNameVal === 'object' && levelNameVal?.en ? levelNameVal.en : 'Bronze Explorer');

        return {
          ...userObj,
          roleBadge,
          userType: userObj.isPremium ? 'VIP' : 'Normal',
          status: isOnline ? 'Online' : 'Offline',
          isOnline,
          age,
          wealthLevel: {
            levelNumber: levelNum,
            name: levelNameStr,
          },
          followersCount,
          followingCount,
          friendsCount,
          postsCount: 0,
          videosCount: 0,
          instantBlock: !!userObj.instantBlock,
          deviceBan: !!userObj.deviceBan,
        };
      })
    );

    return {
      users: populatedUsers,
      summary: {
        totalUsers,
        totalActiveUsers,
        males,
        females,
      },
      pagination: {
        total: filteredTotal,
        page,
        limit,
        totalPages: Math.ceil(filteredTotal / limit),
      },
    };
  }

  public async updateUserProfile(userId: string, updateData: any) {
    const user = await User.findById(userId);
    if (!user) throw new Error('USER_NOT_FOUND');

    if (updateData.name !== undefined) user.name = updateData.name;
    if (updateData.email !== undefined) user.email = updateData.email;
    if (updateData.mobile !== undefined) user.mobile = updateData.mobile;
    if (updateData.whatsapp !== undefined) user.whatsapp = updateData.whatsapp;
    if (updateData.gender !== undefined) user.gender = updateData.gender;
    if (updateData.country !== undefined) user.country = updateData.country;
    if (updateData.dob !== undefined) user.dob = new Date(updateData.dob);
    if (updateData.bio !== undefined) user.bio = updateData.bio;
    if (updateData.coins !== undefined) user.coins = Number(updateData.coins);
    if (updateData.coinSellerCoins !== undefined) user.coinSellerCoins = Number(updateData.coinSellerCoins);
    if (updateData.isCoinseller !== undefined) user.isCoinseller = Boolean(updateData.isCoinseller);
    if (updateData.isPremium !== undefined) user.isPremium = Boolean(updateData.isPremium);
    if (updateData.isVerified !== undefined) user.isVerified = Boolean(updateData.isVerified);
    if (updateData.voiceCallPrice !== undefined) user.voiceCallPrice = Number(updateData.voiceCallPrice);
    if (updateData.videoCallPrice !== undefined) user.videoCallPrice = Number(updateData.videoCallPrice);
    if (updateData.userRole !== undefined) user.userRole = updateData.userRole;
    if (updateData.profileImage !== undefined) user.profileImage = updateData.profileImage;

    await user.save();
    return user;
  }

  public async blockUserWithDuration(
    userId: string,
    params: { blockType: 'permanent' | 'temporary'; durationHours?: number; reason?: string }
  ): Promise<RestrictionNotifyResult> {
    const user = await User.findById(userId);
    if (!user) throw new Error('USER_NOT_FOUND');

    user.isBlocked = true;
    user.blockReason =
      params.reason ||
      (params.blockType === 'permanent'
        ? 'Permanently blocked by Admin'
        : 'Temporarily blocked by Admin');

    if (params.blockType === 'temporary' && params.durationHours && params.durationHours > 0) {
      user.blockedUntil = new Date(Date.now() + params.durationHours * 3600 * 1000);
    } else {
      user.blockedUntil = undefined;
    }

    await user.save();
    const notified = await this.notifyAccountBlocked(user, params.blockType);
    return this.buildRestrictionResult(user, params.blockType, notified);
  }

  public async unblockUser(userId: string): Promise<RestrictionNotifyResult> {
    const user = await User.findById(userId);
    if (!user) throw new Error('USER_NOT_FOUND');

    user.isBlocked = false;
    user.blockedUntil = undefined;
    user.blockReason = undefined;
    user.instantBlock = false;
    user.deviceBan = false;

    await user.save();
    const notified = await this.notifyAccountUnblocked(user);
    return this.buildRestrictionResult(user, 'none', notified);
  }

  public async toggleInstantBlock(userId: string): Promise<RestrictionNotifyResult> {
    const user = await User.findById(userId);
    if (!user) throw new Error('USER_NOT_FOUND');
    user.instantBlock = !user.instantBlock;
    if (user.instantBlock) {
      user.isBlocked = true;
      user.blockReason = 'Instant Blocked by Admin';
      user.blockedUntil = undefined;
      await user.save();
      const notified = await this.notifyAccountBlocked(user, 'instant');
      return this.buildRestrictionResult(user, 'instant', notified);
    }

    user.isBlocked = false;
    user.blockedUntil = undefined;
    user.blockReason = undefined;
    await user.save();
    const notified = await this.notifyAccountUnblocked(user);
    return this.buildRestrictionResult(user, 'none', notified);
  }

  public async toggleDeviceBan(userId: string): Promise<RestrictionNotifyResult> {
    const user = await User.findById(userId);
    if (!user) throw new Error('USER_NOT_FOUND');
    user.deviceBan = !user.deviceBan;
    if (user.deviceBan) {
      user.isBlocked = true;
      user.blockReason = 'Device Banned by Admin';
      user.blockedUntil = undefined;
      await user.save();
      const notified = await this.notifyAccountBlocked(user, 'device_ban');
      return this.buildRestrictionResult(user, 'device_ban', notified);
    }

    user.isBlocked = false;
    user.blockedUntil = undefined;
    user.blockReason = undefined;
    await user.save();
    const notified = await this.notifyAccountUnblocked(user);
    return this.buildRestrictionResult(user, 'none', notified);
  }

  public async toggleUserBlock(userId: string): Promise<RestrictionNotifyResult> {
    const user = await User.findById(userId);
    if (!user) throw new Error('USER_NOT_FOUND');

    if (!user.isBlocked) {
      user.isBlocked = true;
      user.blockReason = user.blockReason || 'Blocked by Admin';
      user.blockedUntil = undefined;
      await user.save();
      const notified = await this.notifyAccountBlocked(user, 'permanent');
      return this.buildRestrictionResult(user, 'permanent', notified);
    }

    user.isBlocked = false;
    user.blockedUntil = undefined;
    user.blockReason = undefined;
    user.instantBlock = false;
    user.deviceBan = false;
    await user.save();
    const notified = await this.notifyAccountUnblocked(user);
    return this.buildRestrictionResult(user, 'none', notified);
  }

  public async adjustUserCoins(userId: string, amount: number, description?: string) {
    const user = await User.findById(userId);
    if (!user) throw new Error('USER_NOT_FOUND');

    const currentCoins = user.coins || 0;
    const newCoins = currentCoins + amount;
    if (newCoins < 0) {
      throw new Error(`Insufficient coins balance. Resulting balance cannot be less than zero.`);
    }

    user.coins = newCoins;
    await user.save();

    await CoinHistory.create({
      userId: user._id,
      amount: amount,
      type: 'other',
      description: description || (amount >= 0 ? 'Coins Added by Admin' : 'Coins Deducted by Admin'),
    });

    return user;
  }


  public async toggleCoinseller(userId: string) {
    const user = await User.findById(userId);
    if (!user) throw new Error('USER_NOT_FOUND');
    user.isCoinseller = !user.isCoinseller;
    if (user.isCoinseller) {
      user.isCoinsellerActive = true;
    }
    await user.save();
    return user;
  }

  public async toggleCoinsellerActive(userId: string) {
    const user = await User.findById(userId);
    if (!user) throw new Error('USER_NOT_FOUND');
    if (!user.isCoinseller) {
      throw new Error('User is not a coin trader');
    }
    user.isCoinsellerActive = user.isCoinsellerActive === false;
    await user.save();
    return user;
  }

  public async setCoinsellerAndRemoveFromAgencies(
    userId: string,
    isCoinseller: boolean = true,
    extras?: {
      whatsapp?: string;
      initialCoins?: number;
      countryId?: string;
      countryCode?: string;
    }
  ) {
    const user = await User.findById(userId);
    if (!user) throw new Error('USER_NOT_FOUND');

    user.isCoinseller = isCoinseller;
    if (isCoinseller) {
      user.isCoinsellerActive = true;
    }

    const whatsapp = extras?.whatsapp?.trim();
    if (whatsapp) {
      user.whatsapp = whatsapp;
    }

    if (extras?.countryId || extras?.countryCode) {
      const country = extras.countryId
        ? await Country.findById(extras.countryId)
        : await Country.findOne({
            $or: [
              { code: extras.countryCode },
              { name: extras.countryCode },
            ],
          });
      if (!country) {
        throw new Error('Country not found');
      }
      user.countryId = country._id;
      user.country = country.name;
    }

    const initialCoins = Number(extras?.initialCoins) || 0;
    if (initialCoins < 0) {
      throw new Error('Initial coins cannot be negative');
    }
    if (initialCoins > 0) {
      user.coinSellerCoins = (user.coinSellerCoins || 0) + initialCoins;
    }

    await user.save();

    const removedHosts = await AgencyHost.deleteMany({ userId: user._id });

    if (initialCoins > 0) {
      await CoinHistory.create({
        userId: user._id,
        amount: initialCoins,
        type: 'other',
        description: 'Initial coins added by Admin',
      });
    }

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
      query.isCoinsellerActive = { $ne: false };
    } else if (params.status === 'inactive') {
      query.isCoinsellerActive = false;
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
      User.countDocuments({ isCoinseller: true, isCoinsellerActive: { $ne: false } }),
      User.countDocuments({ isCoinseller: true, isCoinsellerActive: false }),
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
        const [spentAgg, dealsCount, uniqueBuyers] = await Promise.all([
          CoinHistory.aggregate([
            { $match: { userId: trader._id, type: 'transfer', amount: { $lt: 0 } } },
            { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } }
          ]),
          CoinHistory.countDocuments({ userId: trader._id, type: 'transfer', amount: { $lt: 0 } }),
          CoinHistory.distinct('relatedUserId', { userId: trader._id, type: 'transfer', amount: { $lt: 0 } }),
        ]);

        const spentCoins = spentAgg[0]?.total || 0;

        return {
          ...trader,
          spentCoins,
          totalDeals: dealsCount || 0,
          totalBuyers: uniqueBuyers.length || 0,
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
        isCoinsellerActive: user.isCoinsellerActive !== false,
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
        name: typeof levelInfo?.name === 'string' ? levelInfo.name : (typeof levelInfo?.name === 'object' ? (levelInfo.name.en || 'Sapphire Visionary') : (levelInfo?.levelName || 'Sapphire Visionary')),
        levelNumber: typeof level === 'number' ? level : 7,
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

  public async getCoinTradersCoinHistory(params: {
    page?: number;
    limit?: number;
    search?: string;
    traderId?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.max(1, Math.min(100, params.limit || 10));
    const skip = (page - 1) * limit;

    const traderQuery: any = { isCoinseller: true };
    if (params.traderId) {
      if (mongoose.Types.ObjectId.isValid(params.traderId)) {
        traderQuery._id = params.traderId;
      } else {
        const numericId = Number(params.traderId);
        if (!Number.isNaN(numericId)) {
          traderQuery.userId = numericId;
        }
      }
    }

    const traders = await User.find(traderQuery).select('_id');
    const traderIds = traders.map((trader) => trader._id);

    const query: any = {
      userId: { $in: traderIds },
      type: { $in: ['other', 'transfer', 'recharge'] },
    };

    if (params.startDate || params.endDate) {
      query.createdAt = {};
      if (params.startDate) query.createdAt.$gte = new Date(params.startDate);
      if (params.endDate) {
        const end = new Date(params.endDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }

    if (params.search) {
      query.description = new RegExp(params.search, 'i');
    }

    const [total, addedAgg, deductedAgg, items] = await Promise.all([
      CoinHistory.countDocuments(query),
      CoinHistory.aggregate([
        { $match: { ...query, amount: { $gt: 0 } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      CoinHistory.aggregate([
        { $match: { ...query, amount: { $lt: 0 } } },
        { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } },
      ]),
      CoinHistory.find(query)
        .populate({
          path: 'userId',
          select: 'userId name email mobile whatsapp coinSellerCoins profileImage',
          populate: { path: 'profileImage' },
        })
        .populate({ path: 'relatedUserId', select: 'userId name' })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    return {
      history: items,
      summary: {
        totalTransactions: total,
        totalAdded: addedAgg[0]?.total || 0,
        totalDeducted: deductedAgg[0]?.total || 0,
      },
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }
}

