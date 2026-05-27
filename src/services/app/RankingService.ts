import { Service } from 'typedi';
import mongoose from 'mongoose';
import User from '../../models/User';
import CoinHistory from '../../models/CoinHistory';
import Follow from '../../models/Follow';
import { LevelService } from './LevelService';

@Service()
export class RankingService {
  constructor(private levelService: LevelService) { }

  public async getRanking(
    type: 'rich' | 'charm',
    period: 'daily' | 'weekly' | 'monthly' | 'alltime',
    page: number = 1,
    limit: number = 20
  ) {
    const skip = (page - 1) * limit;
    let rankList: { userId: string; score: number }[] = [];

    if (period === 'alltime') {
      const sortField = type === 'rich' ? 'wealthCoins' : 'charmCoins';
      const users = await User.find({ userRole: 'user' })
        .sort({ [sortField]: -1, _id: 1 })
        .skip(skip)
        .limit(limit);

      rankList = users.map(u => ({
        userId: u._id.toString(),
        score: type === 'rich' ? (u.wealthCoins || u.coins || 0) : (u.charmCoins || 0)
      }));
    } else {
      const startDate = getPeriodStartDate(period);
      const historyType = type === 'rich' ? 'recharge' : 'charm_received';

      // Get all unique user IDs who have activity in the period (to exclude them from fallback)
      const allPeriodUserIdsAgg = await CoinHistory.aggregate([
        {
          $match: {
            type: historyType,
            createdAt: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: '$userId'
          }
        }
      ]);
      const allPeriodUserIds = allPeriodUserIdsAgg
        .map(a => a._id)
        .filter((id): id is mongoose.Types.ObjectId => !!id);
      const totalPeriodUsers = allPeriodUserIds.length;

      if (skip + limit <= totalPeriodUsers) {
        // Case 1: We only need period users
        const aggregation = await CoinHistory.aggregate([
          {
            $match: {
              type: historyType,
              createdAt: { $gte: startDate }
            }
          },
          {
            $group: {
              _id: '$userId',
              totalAmount: { $sum: { $abs: '$amount' } }
            }
          },
          { $sort: { totalAmount: -1, _id: 1 } },
          { $skip: skip },
          { $limit: limit }
        ]);

        rankList = aggregation.map(a => ({
          userId: a._id.toString(),
          score: a.totalAmount
        }));
      } else if (skip < totalPeriodUsers) {
        // Case 2: We need some period users and some fallback users
        const periodLimit = totalPeriodUsers - skip;
        const aggregation = await CoinHistory.aggregate([
          {
            $match: {
              type: historyType,
              createdAt: { $gte: startDate }
            }
          },
          {
            $group: {
              _id: '$userId',
              totalAmount: { $sum: { $abs: '$amount' } }
            }
          },
          { $sort: { totalAmount: -1, _id: 1 } },
          { $skip: skip },
          { $limit: periodLimit }
        ]);

        rankList = aggregation.map(a => ({
          userId: a._id.toString(),
          score: a.totalAmount
        }));

        // The remaining slots come from fallback users starting at index 0 of fallback
        const fallbackLimit = limit - rankList.length;
        const sortField = type === 'rich' ? 'wealthCoins' : 'charmCoins';
        const fallbackUsers = await User.find({
          userRole: 'user',
          _id: { $nin: allPeriodUserIds }
        })
          .sort({ [sortField]: -1, _id: 1 })
          .limit(fallbackLimit);

        for (const u of fallbackUsers) {
          rankList.push({
            userId: u._id.toString(),
            score: 0
          });
        }
      } else {
        // Case 3: We only need fallback users
        const fallbackSkip = skip - totalPeriodUsers;
        const sortField = type === 'rich' ? 'wealthCoins' : 'charmCoins';
        const fallbackUsers = await User.find({
          userRole: 'user',
          _id: { $nin: allPeriodUserIds }
        })
          .sort({ [sortField]: -1, _id: 1 })
          .skip(fallbackSkip)
          .limit(limit);

        rankList = fallbackUsers.map(u => ({
          userId: u._id.toString(),
          score: 0
        }));
      }
    }

    const populatedRankList = [];
    let position = skip + 1;

    for (const item of rankList) {
      const user = await User.findById(item.userId)
        .populate('profileImage')
        .populate('countryId');

      if (!user) continue;

      // Friends count calculation (mutual follows)
      const myFollowing = await Follow.find({ followerId: user._id, status: 'accepted' }).select('followingId');
      const myFollowingIds = myFollowing.map(f => f.followingId);
      const friendsCount = await Follow.countDocuments({
        followingId: user._id,
        followerId: { $in: myFollowingIds },
        status: 'accepted'
      });

      const richCoins = user.wealthCoins !== undefined ? user.wealthCoins : (user.coins || 0);
      const charmCoins = user.charmCoins || 0;

      const richLevelInfo = await this.levelService.getLevelInfoForCoins(richCoins, 'rich');
      const charmLevelInfo = await this.levelService.getLevelInfoForCoins(charmCoins, 'charm');

      populatedRankList.push({
        position,
        score: item.score,
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          mobile: user.mobile,
          bio: user.bio,
          gender: user.gender,
          dob: user.dob,
          profileImage: user.profileImage,
          location: user.location,
          country: user.country,
          countryDetail: user.countryId,
          friendsCount,
          coins: user.coins,
          wealthCoins: richCoins,
          charmCoins: charmCoins,
          richLevelInfo,
          charmLevelInfo
        }
      });
      position++;
    }

    return populatedRankList;
  }
}

function getPeriodStartDate(period: string): Date {
  const now = new Date();
  switch (period) {
    case 'daily':
      return new Date(now.setHours(0, 0, 0, 0));
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
