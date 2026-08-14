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

    const populatedRankList = [];
    let position = skip + 1;

    for (const item of rankList) {
      const user = await User.findById(item.userId)
        .populate('profileImage')
        .populate('countryId');

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

      populatedRankList.push({
        position,
        score: item.score,
        achievedAt: item.achievedAt,
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
          wealthCoins: user.wealthCoins !== undefined ? user.wealthCoins : (user.coins || 0),
          charmCoins: user.charmCoins || 0,
          level: hideWealth ? null : levels.level,
          charmLevel: hideCharm ? null : levels.charmLevel,
          levelInfo: hideWealth ? null : levels.levelInfo,
          richLevelInfo: hideWealth ? null : levels.richLevelInfo,
          charmLevelInfo: hideCharm ? null : levels.charmLevelInfo,
        }
      });
      position++;
    }

    return populatedRankList;
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
