import { Service } from 'typedi';
import mongoose from 'mongoose';
import User from '../../models/User';
import CoinHistory from '../../models/CoinHistory';
import UserOnlineSession from '../../models/UserOnlineSession';
import CoinsellerRankingLog from '../../models/CoinsellerRankingLog';
import AppSetting from '../../models/AppSetting';
import Country from '../../models/Country';
import { resolveCountryObject, toPlainObject } from '../../utils/userLookup';
import { Container } from 'typedi';

export interface ICoinsellerRankingSettings {
  general: {
    enabled: boolean;
    countryWiseRanking: boolean;
    rankingPeriodDays: number;
    autoRankingUpdate: boolean;
    separateRankingForNormal: boolean;
    separateRankingForRechargeService: boolean;
  };
  weights: {
    coinsSold: number;
    uniqueUsers: number;
    onlineDuration: number;
  };
  promotion: {
    enabled: boolean;
    durationDays: number;
    badgeEnabled: boolean;
    priorityDisplayEnabled: boolean;
    rotationEnabled: boolean;
  };
}

export const DEFAULT_RANKING_SETTINGS: ICoinsellerRankingSettings = {
  general: {
    enabled: true,
    countryWiseRanking: true,
    rankingPeriodDays: 30,
    autoRankingUpdate: true,
    separateRankingForNormal: true,
    separateRankingForRechargeService: true,
  },
  weights: {
    coinsSold: 50,
    uniqueUsers: 30,
    onlineDuration: 20,
  },
  promotion: {
    enabled: true,
    durationDays: 7,
    badgeEnabled: true,
    priorityDisplayEnabled: true,
    rotationEnabled: true,
  },
};

const SETTINGS_KEY = 'coinseller_ranking_settings';

@Service()
export class CoinsellerRankingService {
  /**
   * Get current ranking settings with defaults
   */
  async getSettings(): Promise<ICoinsellerRankingSettings> {
    try {
      const doc = await AppSetting.findOne({ key: SETTINGS_KEY }).lean();
      if (!doc || !doc.value) {
        return JSON.parse(JSON.stringify(DEFAULT_RANKING_SETTINGS));
      }
      return {
        general: { ...DEFAULT_RANKING_SETTINGS.general, ...(doc.value.general || {}) },
        weights: { ...DEFAULT_RANKING_SETTINGS.weights, ...(doc.value.weights || {}) },
        promotion: { ...DEFAULT_RANKING_SETTINGS.promotion, ...(doc.value.promotion || {}) },
      };
    } catch {
      return JSON.parse(JSON.stringify(DEFAULT_RANKING_SETTINGS));
    }
  }

  /**
   * Update ranking settings from Admin with strict validation (weights sum to 100)
   */
  async updateSettings(
    newSettings: Partial<ICoinsellerRankingSettings>,
    adminUser?: { _id?: any; name?: string }
  ): Promise<ICoinsellerRankingSettings> {
    const current = await this.getSettings();

    const merged: ICoinsellerRankingSettings = {
      general: { ...current.general, ...(newSettings.general || {}) },
      weights: { ...current.weights, ...(newSettings.weights || {}) },
      promotion: { ...current.promotion, ...(newSettings.promotion || {}) },
    };

    // Validation: weights must sum to 100
    const wCoins = Number(merged.weights.coinsSold) || 0;
    const wUsers = Number(merged.weights.uniqueUsers) || 0;
    const wOnline = Number(merged.weights.onlineDuration) || 0;
    const totalWeight = wCoins + wUsers + wOnline;

    if (totalWeight !== 100) {
      throw new Error(`Ranking weights must sum exactly to 100%. Current sum: ${totalWeight}% (Coins: ${wCoins}%, Users: ${wUsers}%, Online: ${wOnline}%)`);
    }

    if (merged.promotion.durationDays < 1) {
      throw new Error('Promotion duration must be at least 1 day.');
    }

    await AppSetting.findOneAndUpdate(
      { key: SETTINGS_KEY },
      { key: SETTINGS_KEY, value: merged, description: 'Coinseller Ranking and Promotion Configuration' },
      { upsert: true, new: true }
    );

    // Audit log
    await CoinsellerRankingLog.create({
      adminId: adminUser?._id,
      adminName: adminUser?.name || 'Admin',
      action: 'update_settings',
      reason: 'Updated coinseller ranking and promotion settings',
      details: merged,
    });

    return merged;
  }

  /**
   * Cleanup stale online sessions (e.g. server crash without disconnect event)
   */
  async cleanupStaleSessions(): Promise<void> {
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const staleSessions = await UserOnlineSession.find({
        isClosed: false,
        lastHeartbeat: { $lt: fiveMinutesAgo },
      }).limit(100);

      for (const session of staleSessions) {
        const duration = Math.max(0, Math.round((session.lastHeartbeat.getTime() - session.startTime.getTime()) / 1000));
        session.endTime = session.lastHeartbeat;
        session.durationSeconds = duration;
        session.isClosed = true;
        await session.save();
      }
    } catch {}
  }

  /**
   * Calculate 30-day online duration in seconds for a specific seller
   */
  async calculateOnlineDurationSeconds(userId: mongoose.Types.ObjectId, sinceDate: Date): Promise<number> {
    const sessions = await UserOnlineSession.find({
      userId,
      $or: [
        { startTime: { $gte: sinceDate } },
        { isClosed: false },
      ],
    }).lean();

    let totalSeconds = 0;
    const now = Date.now();

    for (const s of sessions) {
      const startMs = Math.max(new Date(s.startTime).getTime(), sinceDate.getTime());
      if (s.isClosed && s.endTime) {
        const endMs = new Date(s.endTime).getTime();
        if (endMs > startMs) {
          totalSeconds += Math.round((endMs - startMs) / 1000);
        }
      } else {
        // Active session
        if (now > startMs) {
          totalSeconds += Math.round((now - startMs) / 1000);
        }
      }
    }

    return totalSeconds;
  }

  /**
   * Calculate metrics for a single seller in the given rolling window
   */
  async calculateSellerMetrics(seller: any, sinceDate: Date, settings: ICoinsellerRankingSettings, ioServer: any) {
    const sellerObjectId = new mongoose.Types.ObjectId(seller._id.toString());
    const countryObj = await resolveCountryObject(seller);

    // 1. Total Coins Sold (Last 30 Days) - Successful recharge transfers only
    const historyMatch = {
      userId: sellerObjectId,
      amount: { $lt: 0 },
      createdAt: { $gte: sinceDate },
      $or: [
        { type: { $in: ['transfer', 'beans_to_coins', 'coinseller', 'recharge'] } },
        { wallet: 'coinSellerCoins' },
        { transferTarget: { $in: ['user', 'coinseller'] } },
        { paymentGateway: 'CoinSeller' },
      ],
    };

    const dealsAgg = await CoinHistory.aggregate([
      { $match: historyMatch },
      {
        $group: {
          _id: null,
          totalCoinsSold: { $sum: { $abs: '$amount' } },
          dealsCount: { $sum: 1 },
        },
      },
    ]);
    const coinsSold = dealsAgg[0]?.totalCoinsSold || 0;
    const dealsCount = dealsAgg[0]?.dealsCount || 0;

    // 2. Total Unique Users Served (Last 30 Days) - Deduplicated buyers
    const uniqueUserIds = await CoinHistory.distinct('relatedUserId', {
      ...historyMatch,
      relatedUserId: { $ne: sellerObjectId, $exists: true, $nin: [null, ''] },
    });
    const uniqueUsersCount = uniqueUserIds.filter(Boolean).length;

    // Lifetime recharge transfers to members
    const lifetimeMatch = {
      userId: sellerObjectId,
      amount: { $lt: 0 },
      $or: [
        { type: { $in: ['transfer', 'beans_to_coins', 'coinseller', 'recharge'] } },
        { wallet: 'coinSellerCoins' },
        { transferTarget: { $in: ['user', 'coinseller'] } },
        { paymentGateway: 'CoinSeller' },
      ],
    };
    const lifetimeAgg = await CoinHistory.aggregate([
      { $match: lifetimeMatch },
      {
        $group: {
          _id: null,
          totalCoinsSold: { $sum: { $abs: '$amount' } },
          dealsCount: { $sum: 1 },
        },
      },
    ]);
    const totalCoinsSold = lifetimeAgg[0]?.totalCoinsSold || coinsSold;
    const totalDealsCount = lifetimeAgg[0]?.dealsCount || dealsCount;

    const lifetimeUserIds = await CoinHistory.distinct('relatedUserId', {
      ...lifetimeMatch,
      relatedUserId: { $ne: sellerObjectId, $exists: true, $nin: [null, ''] },
    });
    const totalBuyersCount = lifetimeUserIds.filter(Boolean).length || uniqueUsersCount;

    // 3. Total Online Duration (Last 30 Days)
    const onlineSeconds = await this.calculateOnlineDurationSeconds(sellerObjectId, sinceDate);
    const onlineHours = Math.round((onlineSeconds / 3600) * 10) / 10;

    // Real-time online presence with active socket verification
    const sellerIdStr = seller._id.toString();
    const userRoom = ioServer?.sockets?.adapter?.rooms?.get(`user_${sellerIdStr}`);
    const isSocketOnline = Boolean(userRoom && userRoom.size > 0);

    const twoMinutesAgo = Date.now() - 2 * 60 * 1000;
    const isRecentActive = seller.lastActiveAt ? new Date(seller.lastActiveAt).getTime() > twoMinutesAgo : false;
    const isOnline = isSocketOnline || (!ioServer && seller.isOnline === true && isRecentActive);

    // If socket confirms user is disconnected but DB has isOnline=true, quietly sync DB
    if (!isSocketOnline && seller.isOnline === true && ioServer) {
      User.findByIdAndUpdate(seller._id, { isOnline: false }).catch(() => {});
    }

    // 4. New Seller Promotion Status
    const activationDate = seller.coinsellerJoinedAt || seller.createdAt || new Date();
    const ageDays = (Date.now() - new Date(activationDate).getTime()) / (1000 * 60 * 60 * 24);
    const isNewSeller = Boolean(
      settings.promotion.enabled &&
      ageDays <= settings.promotion.durationDays &&
      !seller.coinsellerRankingExcluded
    );

    const formatCoinsAbbr = (n: number) => {
      if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
      if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
      return n.toString();
    };

    return {
      seller,
      countryObj,
      coinsSold,
      dealsCount,
      uniqueUsersCount,
      totalCoinsSold,
      totalDealsCount,
      totalBuyersCount,
      dealsLast30DaysFormatted: formatCoinsAbbr(coinsSold),
      totalCoinsSoldFormatted: formatCoinsAbbr(totalCoinsSold),
      onlineSeconds,
      onlineHours,
      isOnline,
      isNewSeller,
      ageDays: Math.floor(ageDays),
      category: seller.coinsellerCategory || 'recharge_service',
      isExcluded: Boolean(seller.coinsellerRankingExcluded),
      excludeReason: seller.coinsellerRankingExcludeReason || '',
    };
  }

  /**
   * Fair daily rotation seed for promotional new sellers
   */
  private getDailyRotationRank(sellerId: string, dayIndex: number): number {
    let hash = 0;
    const str = `${sellerId}_${dayIndex}`;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  /**
   * Main ranking engine: Country-wise, Category-wise, Promotion-first, Normalized Scoring
   */
  async getRankedSellers(options: {
    currentUserId?: string;
    country?: string;
    category?: 'normal' | 'recharge_service' | 'all';
    search?: string;
    includeExcluded?: boolean;
    page?: number;
    limit?: number;
  }) {
    await this.cleanupStaleSessions();

    const settings = await this.getSettings();
    const page = Math.max(1, options.page || 1);
    const limit = Math.max(1, Math.min(100, options.limit || 20));
    const skip = (page - 1) * limit;

    const rankingDays = settings.general.rankingPeriodDays || 30;
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - rankingDays);

    // 1. Build Base Database Query
    const baseQuery: any = {
      isCoinseller: true,
      isBlocked: false,
      isCoinsellerActive: { $ne: false },
    };

    if (!options.includeExcluded) {
      baseQuery.coinsellerRankingExcluded = { $ne: true };
    }

    // Category filtering
    const category = options.category || 'recharge_service';
    if (category !== 'all') {
      if (category === 'normal') {
        baseQuery.coinsellerCategory = { $in: ['normal', 'both'] };
      } else {
        baseQuery.coinsellerCategory = { $in: ['recharge_service', 'both', null] };
      }
    }

    // Country filtering (Mandatory country-wise logic)
    let targetCountryCode: string | null = null;

    if (options.country && options.country.trim() !== '' && options.country.trim().toLowerCase() !== 'all') {
      targetCountryCode = options.country.trim();
    } else if (settings.general.countryWiseRanking && options.currentUserId) {
      // Automatic country-wise enforcement for app users
      const currentUser = await User.findById(options.currentUserId).select('country countryId').populate('countryId').lean();
      if (currentUser) {
        targetCountryCode = (currentUser.countryId as any)?.code || (currentUser.countryId as any)?.name || currentUser.country || null;
      }
    }

    if (targetCountryCode && targetCountryCode.toLowerCase() !== 'all') {
      const countryConditions: any[] = [];
      if (mongoose.Types.ObjectId.isValid(targetCountryCode)) {
        countryConditions.push({ _id: new mongoose.Types.ObjectId(targetCountryCode) });
      }
      countryConditions.push({ name: { $regex: new RegExp(`^${targetCountryCode}$`, 'i') } });
      countryConditions.push({ code: { $regex: new RegExp(`^${targetCountryCode}$`, 'i') } });

      const matchingCountries = await Country.find({ $or: countryConditions }).select('_id name code').lean();
      const countryObjIds = matchingCountries.map((c: any) => c._id);
      const countryNames = matchingCountries.map((c: any) => c.name);
      const countryCodes = matchingCountries.map((c: any) => c.code);

      const userCountryConditions: any[] = [
        { country: { $regex: new RegExp(`^${targetCountryCode}$`, 'i') } },
        { nationality: { $regex: new RegExp(`^${targetCountryCode}$`, 'i') } },
      ];

      if (mongoose.Types.ObjectId.isValid(targetCountryCode)) {
        userCountryConditions.push({ countryId: new mongoose.Types.ObjectId(targetCountryCode) });
      }
      if (countryObjIds.length > 0) {
        userCountryConditions.push({ countryId: { $in: countryObjIds } });
      }
      if (countryNames.length > 0) {
        userCountryConditions.push({ country: { $in: countryNames } });
        userCountryConditions.push({ nationality: { $in: countryNames } });
      }
      if (countryCodes.length > 0) {
        userCountryConditions.push({ country: { $in: countryCodes } });
      }

      baseQuery.$and = baseQuery.$and || [];
      baseQuery.$and.push({ $or: userCountryConditions });
    }

    // Search filtering
    if (options.search && options.search.trim() !== '') {
      const searchStr = options.search.trim();
      const searchRegex = new RegExp(searchStr, 'i');
      const numericSearch = Number(searchStr);

      const searchOrConditions: any[] = [
        { name: searchRegex },
        { mobile: searchRegex },
        { whatsapp: searchRegex },
        { country: searchRegex },
        ...(!isNaN(numericSearch) ? [{ userId: numericSearch }] : []),
      ];

      baseQuery.$and = baseQuery.$and || [];
      baseQuery.$and.push({ $or: searchOrConditions });
    }

    // 2. Fetch Sellers
    const sellers = await User.find(baseQuery)
      .select('_id userId name profileImage mobile whatsapp country countryId coinSellerCoins coinsellerCategory coinsellerJoinedAt coinsellerRankingExcluded coinsellerRankingExcludeReason isOnline createdAt')
      .populate('profileImage')
      .populate('countryId')
      .lean();

    let ioServer: any = null;
    try { ioServer = Container.get('socket'); } catch {}

    // 3. Calculate 30-Day Metrics for each Seller
    const metricsList = await Promise.all(
      sellers.map((s) => this.calculateSellerMetrics(s, sinceDate, settings, ioServer))
    );

    // 4. Split into Promotional New Sellers (Priority 1) & Normal Ranked Sellers (Priority 2)
    const newSellers: typeof metricsList = [];
    const normalSellers: typeof metricsList = [];

    for (const item of metricsList) {
      if (item.isNewSeller && settings.promotion.priorityDisplayEnabled) {
        newSellers.push(item);
      } else {
        normalSellers.push(item);
      }
    }

    // 5. Fair Rotation among New Sellers
    if (newSellers.length > 1 && settings.promotion.rotationEnabled) {
      const dayIndex = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
      newSellers.sort((a, b) => {
        const rankA = this.getDailyRotationRank(a.seller._id.toString(), dayIndex);
        const rankB = this.getDailyRotationRank(b.seller._id.toString(), dayIndex);
        return rankB - rankA;
      });
    } else {
      newSellers.sort((a, b) => new Date(b.seller.createdAt).getTime() - new Date(a.seller.createdAt).getTime());
    }

    // 6. Normalization & Scoring for Normal Sellers
    if (normalSellers.length > 0) {
      const maxCoins = Math.max(...normalSellers.map((s) => s.coinsSold));
      const minCoins = Math.min(...normalSellers.map((s) => s.coinsSold));

      const maxUsers = Math.max(...normalSellers.map((s) => s.uniqueUsersCount));
      const minUsers = Math.min(...normalSellers.map((s) => s.uniqueUsersCount));

      const maxOnline = Math.max(...normalSellers.map((s) => s.onlineHours));
      const minOnline = Math.min(...normalSellers.map((s) => s.onlineHours));

      // Weight proportions check (Requirement 5: if metric is zero for all sellers, proportionally adjust active weights)
      let wCoins = settings.weights.coinsSold;
      let wUsers = settings.weights.uniqueUsers;
      let wOnline = settings.weights.onlineDuration;

      let activeWeightSum = 0;
      if (maxCoins > 0) activeWeightSum += wCoins;
      if (maxUsers > 0) activeWeightSum += wUsers;
      if (maxOnline > 0) activeWeightSum += wOnline;

      if (activeWeightSum > 0 && activeWeightSum < 100) {
        wCoins = maxCoins > 0 ? (wCoins / activeWeightSum) * 100 : 0;
        wUsers = maxUsers > 0 ? (wUsers / activeWeightSum) * 100 : 0;
        wOnline = maxOnline > 0 ? (wOnline / activeWeightSum) * 100 : 0;
      }

      for (const item of normalSellers) {
        // Min-max normalized scores (0 to 100)
        let coinsScore = 0;
        if (maxCoins > 0) {
          coinsScore = maxCoins === minCoins ? 100 : ((item.coinsSold - minCoins) / (maxCoins - minCoins)) * 100;
        }

        let usersScore = 0;
        if (maxUsers > 0) {
          usersScore = maxUsers === minUsers ? 100 : ((item.uniqueUsersCount - minUsers) / (maxUsers - minUsers)) * 100;
        }

        let onlineScore = 0;
        if (maxOnline > 0) {
          onlineScore = maxOnline === minOnline ? 100 : ((item.onlineHours - minOnline) / (maxOnline - minOnline)) * 100;
        }

        const finalScore = (coinsScore * (wCoins / 100)) + (usersScore * (wUsers / 100)) + (onlineScore * (wOnline / 100));
        (item as any).score = Math.round(finalScore * 100) / 100;
        (item as any).coinsScore = Math.round(coinsScore * 10) / 10;
        (item as any).usersScore = Math.round(usersScore * 10) / 10;
        (item as any).onlineScore = Math.round(onlineScore * 10) / 10;
      }

      // Sort normal sellers strictly by Requirement 6:
      // Final Score -> Coins Sold -> Unique Users -> Online Duration -> Account Age
      normalSellers.sort((a: any, b: any) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.coinsSold !== a.coinsSold) return b.coinsSold - a.coinsSold;
        if (b.uniqueUsersCount !== a.uniqueUsersCount) return b.uniqueUsersCount - a.uniqueUsersCount;
        if (b.onlineHours !== a.onlineHours) return b.onlineHours - a.onlineHours;
        return new Date(a.seller.createdAt).getTime() - new Date(b.seller.createdAt).getTime();
      });
    }

    // 7. Combine lists (Priority 1: New Sellers, Priority 2: Normal Sellers)
    const combinedList = [...newSellers, ...normalSellers];
    const total = combinedList.length;

    // 8. Assign Ranks and Badges
    combinedList.forEach((item: any, idx) => {
      item.rank = idx + 1;
      if (item.isNewSeller && settings.promotion.badgeEnabled) {
        item.badge = 'NEW SELLER';
      } else if (item.rank === 1) {
        item.badge = '#1 Top Gold Seller';
      } else if (item.rank === 2) {
        item.badge = '#2 Silver Seller';
      } else if (item.rank === 3) {
        item.badge = '#3 Bronze Seller';
      } else if (item.rank <= 10) {
        item.badge = 'Senior Seller';
      } else {
        item.badge = 'Active Seller';
      }
    });

    // 9. Paginate
    const paginated = combinedList.slice(skip, skip + limit);

    return {
      sellers: paginated,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      settingsSummary: {
        country: targetCountryCode || 'All',
        category,
        rankingPeriodDays: rankingDays,
        newSellersCount: newSellers.length,
        normalSellersCount: normalSellers.length,
      },
    };
  }

  /**
   * Exclude a seller from ranking with mandatory reason and audit logging
   */
  async excludeSeller(sellerId: string, reason: string, adminUser?: { _id?: any; name?: string }) {
    if (!reason || reason.trim().length === 0) {
      throw new Error('A valid reason is required to exclude a coinseller from ranking.');
    }

    const seller = await User.findById(sellerId);
    if (!seller) throw new Error('Coinseller not found');

    seller.coinsellerRankingExcluded = true;
    seller.coinsellerRankingExcludeReason = reason.trim();
    seller.coinsellerRankingExcludedAt = new Date();
    seller.coinsellerRankingExcludedBy = adminUser?._id;
    await seller.save();

    await CoinsellerRankingLog.create({
      sellerId: seller._id,
      sellerName: seller.name,
      sellerUserId: seller.userId,
      adminId: adminUser?._id,
      adminName: adminUser?.name || 'Admin',
      action: 'exclude',
      reason: reason.trim(),
    });

    return { success: true, message: `Seller ${seller.name || seller.userId} excluded from ranking` };
  }

  /**
   * Restore an excluded seller to ranking with audit logging
   */
  async restoreSeller(sellerId: string, reason?: string, adminUser?: { _id?: any; name?: string }) {
    const seller = await User.findById(sellerId);
    if (!seller) throw new Error('Coinseller not found');

    seller.coinsellerRankingExcluded = false;
    seller.coinsellerRankingExcludeReason = undefined;
    seller.coinsellerRankingExcludedAt = undefined;
    seller.coinsellerRankingExcludedBy = undefined;
    await seller.save();

    await CoinsellerRankingLog.create({
      sellerId: seller._id,
      sellerName: seller.name,
      sellerUserId: seller.userId,
      adminId: adminUser?._id,
      adminName: adminUser?.name || 'Admin',
      action: 'restore',
      reason: reason?.trim() || 'Restored to ranking by admin',
    });

    return { success: true, message: `Seller ${seller.name || seller.userId} restored to ranking` };
  }

  /**
   * Update seller recharge category (normal, recharge_service, both)
   */
  async updateSellerCategory(
    sellerId: string,
    category: 'normal' | 'recharge_service' | 'both',
    adminUser?: { _id?: any; name?: string }
  ) {
    const valid = ['normal', 'recharge_service', 'both'];
    if (!valid.includes(category)) {
      throw new Error('Invalid seller category. Must be "normal", "recharge_service", or "both".');
    }

    const seller = await User.findById(sellerId);
    if (!seller) throw new Error('Coinseller not found');

    const oldCategory = seller.coinsellerCategory || 'recharge_service';
    seller.coinsellerCategory = category;
    await seller.save();

    await CoinsellerRankingLog.create({
      sellerId: seller._id,
      sellerName: seller.name,
      sellerUserId: seller.userId,
      adminId: adminUser?._id,
      adminName: adminUser?.name || 'Admin',
      action: 'update_category',
      reason: `Changed category from ${oldCategory} to ${category}`,
      details: { oldCategory, newCategory: category },
    });

    return { success: true, message: `Seller category updated to ${category}` };
  }

  /**
   * Fetch audit logs for ranking operations
   */
  async getAuditLogs(page: number = 1, limit: number = 20) {
    const p = Math.max(1, page);
    const l = Math.max(1, Math.min(100, limit));
    const skip = (p - 1) * l;

    const [logs, total] = await Promise.all([
      CoinsellerRankingLog.find().sort({ createdAt: -1 }).skip(skip).limit(l).lean(),
      CoinsellerRankingLog.countDocuments(),
    ]);

    return {
      logs,
      pagination: {
        total,
        page: p,
        limit: l,
        totalPages: Math.ceil(total / l),
      },
    };
  }
}

