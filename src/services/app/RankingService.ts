import { Service } from 'typedi';
import User from '../../models/User';
import CoinHistory from '../../models/CoinHistory';
import Follow from '../../models/Follow';
import { LevelService } from './LevelService';
import { getUserCountryAndLevels } from '../../utils/userLookup';
import { isAllCountries, resolveCountryUserIds } from '../../utils/countryFilter';

@Service()
export class RankingService {
  constructor(private levelService: LevelService) { }

  public async getRanking(
    type: 'rich' | 'charm',
    period: 'daily' | 'weekly' | 'monthly' | 'alltime',
    page: number = 1,
    limit: number = 20,
    country?: string
  ) {
    const skip = (page - 1) * limit;
    const countryUserIds = await resolveCountryUserIds(country);
    const countryFilterActive = !isAllCountries(country);

    if (countryFilterActive && (!countryUserIds || countryUserIds.length === 0)) {
      return [];
    }

    const startDate = period === 'alltime' ? new Date(0) : getPeriodStartDate(period);
    const historyMatch: Record<string, any> = {
      createdAt: { $gte: startDate },
      ...this.buildGiftHistoryMatch(type),
    };

    if (countryUserIds) {
      historyMatch.userId = { $in: countryUserIds };
    }

    const aggregation = await CoinHistory.aggregate([
      { $match: historyMatch },
      {
        $group: {
          _id: '$userId',
          totalAmount: { $sum: { $abs: '$amount' } },
          achievedAt: { $max: '$createdAt' },
        }
      },
      { $match: { totalAmount: { $gt: 0 } } },
      { $sort: { totalAmount: -1, achievedAt: 1, _id: 1 } },
      { $skip: skip },
      { $limit: limit }
    ]);

    const rankList = aggregation.map((a) => ({
      userId: a._id.toString(),
      score: a.totalAmount,
      achievedAt: a.achievedAt,
    }));

    const [dailyRankMap, weeklyRankMap, monthlyRankMap] = await Promise.all([
      this.getPeriodRanks(type, 'daily', countryUserIds),
      this.getPeriodRanks(type, 'weekly', countryUserIds),
      this.getPeriodRanks(type, 'monthly', countryUserIds),
    ]);

    const populatedRankList = [];
    let position = skip + 1;

    for (const item of rankList) {
      const user = await User.findById(item.userId)
        .populate('profileImage')
        .populate('countryId')
        .populate('activeFrame')
        .populate('activeEntry')
        .populate('activeChatBubble')
        .populate('activeTheme')
        .populate('activeRide');

      if (!user || user.userRole !== 'user') continue;

      const myFollowing = await Follow.find({ followerId: user._id, status: 'accepted' }).select('followingId');
      const myFollowingIds = myFollowing.map((f) => f.followingId);
      const friendsCount = await Follow.countDocuments({
        followingId: user._id,
        followerId: { $in: myFollowingIds },
        status: 'accepted'
      });

      const levels = await getUserCountryAndLevels(user, this.levelService);
      const hideWealth = !!(user as any).privacySettings?.hideWealthLevel;
      const hideCharm = !!(user as any).privacySettings?.hideCharmLevel;

      const userIdStr = item.userId;
      const dailyRank = dailyRankMap.get(userIdStr) ?? (period === 'daily' ? position : null);
      const weeklyRank = weeklyRankMap.get(userIdStr) ?? (period === 'weekly' ? position : null);
      const monthlyRank = monthlyRankMap.get(userIdStr) ?? (period === 'monthly' ? position : null);

      const dailyTag = dailyRank ? `Daily No. ${dailyRank}` : null;
      const weeklyTag = weeklyRank ? `Weekly No. ${weeklyRank}` : null;
      const monthlyTag = monthlyRank ? `Monthly No. ${monthlyRank}` : null;

      let rankTag: string | null = null;
      let tagObj: { type: 'daily' | 'weekly' | 'monthly'; rank: number; label: string; text: string } | null = null;

      if (dailyRank) {
        rankTag = `Daily No. ${dailyRank}`;
        tagObj = { type: 'daily', rank: dailyRank, label: `Daily No. ${dailyRank}`, text: `Daily No. ${dailyRank}` };
      } else if (weeklyRank) {
        rankTag = `Weekly No. ${weeklyRank}`;
        tagObj = { type: 'weekly', rank: weeklyRank, label: `Weekly No. ${weeklyRank}`, text: `Weekly No. ${weeklyRank}` };
      } else if (monthlyRank) {
        rankTag = `Monthly No. ${monthlyRank}`;
        tagObj = { type: 'monthly', rank: monthlyRank, label: `Monthly No. ${monthlyRank}`, text: `Monthly No. ${monthlyRank}` };
      }

      const isVip = Boolean(user.isPremium);
      const isPremium = Boolean(user.isPremium);
      const vipBadge = isVip
        ? {
            isVip: true,
            level: 1,
            name: 'VIP',
            badge: 'VIP',
          }
        : null;

      populatedRankList.push({
        position,
        score: item.score,
        achievedAt: item.achievedAt,
        dailyRank,
        weeklyRank,
        monthlyRank,
        dailyTag,
        weeklyTag,
        monthlyTag,
        rankTag,
        tag: tagObj,
        user: {
          _id: user._id,
          userId: user.userId,
          name: user.name,
          email: user.email,
          mobile: user.mobile,
          bio: user.bio,
          gender: user.gender,
          dob: user.dob,
          profileImage: user.profileImage,
          location: user.location,
          country: levels.country || user.country,
          countryId: levels.countryId,
          countryDetail: levels.country || user.countryId,
          friendsCount,
          coins: user.coins,
          beans: user.beans || 0,
          wealthCoins: user.wealthCoins !== undefined ? user.wealthCoins : (user.coins || 0),
          charmCoins: user.charmCoins || 0,
          level: hideWealth ? null : levels.level,
          charmLevel: hideCharm ? null : levels.charmLevel,
          levelInfo: hideWealth ? null : levels.levelInfo,
          richLevelInfo: hideWealth ? null : levels.richLevelInfo,
          charmLevelInfo: hideCharm ? null : levels.charmLevelInfo,
          isPremium,
          isVip,
          vip: isVip,
          vipBadge,
          activeFrame: user.activeFrame,
          activeEntry: user.activeEntry,
          activeChatBubble: user.activeChatBubble,
          activeTheme: user.activeTheme,
          activeRide: user.activeRide,
          dailyRank,
          weeklyRank,
          monthlyRank,
          dailyTag,
          weeklyTag,
          monthlyTag,
          rankTag,
          tag: tagObj,
        }
      });
      position++;
    }

    return populatedRankList;
  }

  private async getPeriodRanks(type: 'rich' | 'charm', period: 'daily' | 'weekly' | 'monthly', countryUserIds?: any[] | null) {
    const startDate = getPeriodStartDate(period);
    const historyMatch: Record<string, any> = {
      createdAt: { $gte: startDate },
      ...this.buildGiftHistoryMatch(type),
    };

    if (countryUserIds) {
      historyMatch.userId = { $in: countryUserIds };
    }

    const aggregation = await CoinHistory.aggregate([
      { $match: historyMatch },
      {
        $group: {
          _id: '$userId',
          totalAmount: { $sum: { $abs: '$amount' } },
          achievedAt: { $max: '$createdAt' },
        }
      },
      { $match: { totalAmount: { $gt: 0 } } },
      { $sort: { totalAmount: -1, achievedAt: 1, _id: 1 } },
      { $limit: 1000 }
    ]);

    const rankMap = new Map<string, number>();
    aggregation.forEach((item, idx) => {
      rankMap.set(item._id.toString(), idx + 1);
    });
    return rankMap;
  }

  private buildGiftHistoryMatch(type: 'rich' | 'charm') {
    if (type === 'rich') {
      return {
        $or: [
          { type: 'gift_sent' },
          { type: 'transfer', description: { $regex: /sent gift/i } },
        ]
      };
    }

    return {
      $or: [
        { type: 'gift_received' },
        { type: 'charm_received', description: { $regex: /received gift/i } },
      ]
    };
  }
}

function getPeriodStartDate(period: string): Date {
  const now = new Date();
  switch (period) {
    case 'daily': {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      return start;
    }
    case 'weekly': {
      const startOfWeek = new Date(now);
      const day = startOfWeek.getDay();
      const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
      startOfWeek.setDate(diff);
      startOfWeek.setHours(0, 0, 0, 0);
      return startOfWeek;
    }
    case 'monthly':
      return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    default:
      return new Date(0);
  }
}
