import { Service } from 'typedi';
import mongoose from 'mongoose';
import User from '../../models/User';
import CoinHistory from '../../models/CoinHistory';
import Follow from '../../models/Follow';
import { LevelService } from './LevelService';

@Service()
export class RankingService {
  constructor(private levelService: LevelService) {}

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
        .sort({ [sortField]: -1 })
        .skip(skip)
        .limit(limit);

      rankList = users.map(u => ({
        userId: u._id.toString(),
        score: type === 'rich' ? (u.wealthCoins || u.coins || 0) : (u.charmCoins || 0)
      }));
    } else {
      const startDate = getPeriodStartDate(period);
      const historyType = type === 'rich' ? 'recharge' : 'charm_received';

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
        { $sort: { totalAmount: -1 } },
        { $skip: skip },
        { $limit: limit }
      ]);

      rankList = aggregation.map(a => ({
        userId: a._id.toString(),
        score: a.totalAmount
      }));

      // Fallback to alltime if period doesn't have enough data
      if (rankList.length < limit) {
        const existingIds = new Set(rankList.map(r => r.userId));
        const sortField = type === 'rich' ? 'wealthCoins' : 'charmCoins';
        
        const fallbackUsers = await User.find({
          userRole: 'user',
          _id: { $nin: Array.from(existingIds).map(id => new mongoose.Types.ObjectId(id)) }
        })
          .sort({ [sortField]: -1 })
          .limit(limit - rankList.length);

        for (const u of fallbackUsers) {
          rankList.push({
            userId: u._id.toString(),
            score: 0
          });
        }
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
