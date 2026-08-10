import { Service, Container, Inject } from 'typedi';
import mongoose from 'mongoose';
import User from '../../models/User';
import CoinHistory from '../../models/CoinHistory';
import { AppSettingService } from '../common/AppSettingService';
import { LevelService } from './LevelService';
import { ChatService } from './ChatService';
import { getUserCountryAndLevels, resolveCountryObject, toPlainObject } from '../../utils/userLookup';
import Country from '../../models/Country';

@Service()
export class CoinSellerService {
  constructor(
    @Inject() private levelService: LevelService,
    @Inject() private chatService: ChatService
  ) { }


  async transferCoins(senderId: string, targetUserId: number, amount: number) {
    if (!amount || amount <= 0) {
      throw new Error('Transfer amount must be greater than zero');
    }

    const sender = await User.findById(senderId).populate('profileImage');
    if (!sender) throw new Error('Sender user not found');
    if (!sender.isCoinseller) {
      throw new Error('You are not authorized as a coin seller');
    }
    if ((sender.coinSellerCoins || 0) < amount) {
      throw new Error('Insufficient coinseller coins balance');
    }

    const target = await User.findOne({ userId: targetUserId }).populate('profileImage');
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
      await User.findByIdAndUpdate(senderId, { $inc: { coinSellerCoins: -amount } }, { session });

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
        },
        user: {
          id: target._id,
          userId: target.userId,
          name: target.name,
          email: target.email,
          profileImage: target.profileImage
        },
        coinSeller: {
          id: sender._id,
          userId: sender.userId,
          name: sender.name,
          email: sender.email,
          profileImage: sender.profileImage
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

    const seller = await User.findById(sellerId)
      .select('userId name coins coinSellerCoins beans mobile whatsapp profileImage')
      .populate('profileImage');
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
      mobile: seller.mobile,
      whatsapp: seller.whatsapp,
      profileImage: seller.profileImage,
      availableBalance: seller.coins || 0,
      coinSellerBalance: seller.coinSellerCoins || 0,
      beansBalance: seller.beans || 0,
      totalCoinsSold,
      customerNumbers,
      coinSellerRank
    };
  }

  async convertBeansToCoins(
    userId: string,
    beansAmount: number,
    targetUserId?: number
  ) {
    if (!beansAmount || beansAmount <= 0) {
      throw new Error('Beans amount must be greater than zero');
    }

    const sender = await User.findById(userId);
    if (!sender) throw new Error('User not found');
    if ((sender.beans || 0) < beansAmount) {
      throw new Error('Insufficient beans balance');
    }

    let recipient = sender;
    if (targetUserId && targetUserId !== sender.userId) {
      const foundTarget = await User.findOne({ userId: targetUserId });
      if (!foundTarget) {
        throw new Error('Recipient user with specified ID not found');
      }
      recipient = foundTarget;
    }

    const appSettingService = Container.get(AppSettingService);
    const coinToBeanRate = await appSettingService.getSettingValue('coin_to_bean_rate') || 1;
    const minTransfer = await appSettingService.getSettingValue('min_coin_to_bean_transfer') || 100;

    if (beansAmount < minTransfer) {
      throw new Error(`Minimum transfer amount is ${minTransfer} beans`);
    }

    const coinsToCredit = Math.floor(beansAmount / coinToBeanRate);
    if (coinsToCredit <= 0) {
      throw new Error('Converted coins value is too low');
    }

    const isTransfer = sender._id.toString() !== recipient._id.toString();
    // Credit coinSellerCoins if recipient is a coin seller and converting for self, else credit coins
    const incField = (recipient.isCoinseller && !isTransfer) ? 'coinSellerCoins' : 'coins';

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // 1. Deduct beans from sender
      await User.findByIdAndUpdate(sender._id, {
        $inc: { beans: -beansAmount }
      }, { session });

      // 2. Credit coins or coinSellerCoins to recipient
      await User.findByIdAndUpdate(recipient._id, {
        $inc: { [incField]: coinsToCredit }
      }, { session });

      // 3. Create history records
      if (isTransfer) {
        // Record for sender
        await CoinHistory.create([{
          userId: sender._id,
          relatedUserId: recipient._id,
          amount: -coinsToCredit,
          type: 'beans_to_coins',
          description: `Converted ${beansAmount} beans to ${coinsToCredit} coins and transferred to ${recipient.name || 'User'} (ID: ${recipient.userId})`
        }], { session });

        // Record for recipient
        await CoinHistory.create([{
          userId: recipient._id,
          relatedUserId: sender._id,
          amount: coinsToCredit,
          type: 'beans_to_coins',
          description: `Received ${coinsToCredit} coins converted from beans by ${sender.name || 'User'} (ID: ${sender.userId})`
        }], { session });
      } else {
        await CoinHistory.create([{
          userId: sender._id,
          amount: coinsToCredit,
          type: 'beans_to_coins',
          description: `Converted ${beansAmount} beans to ${coinsToCredit} coins`
        }], { session });
      }

      await session.commitTransaction();
      return {
        success: true,
        message: isTransfer
          ? `Beans converted to coins and transferred to User (ID: ${recipient.userId}) successfully`
          : `Beans converted to coins successfully`,
        beansDeducted: beansAmount,
        coinsCredited: coinsToCredit,
        recipient: {
          id: recipient._id,
          userId: recipient.userId,
          name: recipient.name
        }
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async convertCoinsToBeans(userId: string, coinsAmount: number) {
    if (!coinsAmount || coinsAmount <= 0) {
      throw new Error('Coins amount must be greater than zero');
    }

    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');
    if ((user.coins || 0) < coinsAmount) {
      throw new Error('Insufficient coins balance');
    }

    const appSettingService = Container.get(AppSettingService);
    const coinToBeanRate = await appSettingService.getSettingValue('coin_to_bean_rate') || 1;

    const beansToCredit = coinsAmount * coinToBeanRate;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Deduct coins and add beans
      await User.findByIdAndUpdate(userId, {
        $inc: { coins: -coinsAmount, beans: beansToCredit }
      }, { session });

      // Create history record
      await CoinHistory.create([{
        userId: user._id,
        amount: -coinsAmount,
        type: 'coins_to_beans',
        description: `Converted ${coinsAmount} coins to ${beansToCredit} beans`
      }], { session });

      await session.commitTransaction();
      return {
        success: true,
        message: 'Coins converted to beans successfully',
        coinsDeducted: coinsAmount,
        beansCredited: beansToCredit
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async checkUser(userId: number) {
    const user = await User.findOne({ userId })
      .populate('profileImage')
      .populate('countryId');
    if (!user) {
      throw new Error('Recipient user with specified ID not found');
    }

    const { country, countryId, level, levelInfo, richLevelInfo, charmLevel, charmLevelInfo } =
      await getUserCountryAndLevels(user, this.levelService);

    return {
      id: user._id,
      userId: user.userId,
      name: user.name,
      email: user.email,
      profileImage: toPlainObject(user.profileImage),
      isPremium: user.isPremium,
      location: user.location,
      countryId,
      country,
      level,
      levelInfo,
      richLevelInfo,
      charmLevel,
      charmLevelInfo,
    };
  }

  /**
   * Get public paginated coin sellers list for app users (Recharge Service)
   */
  async getPublicCoinSellersList(params: {
    currentUserId?: string;
    page?: number;
    limit?: number;
    country?: string;
    search?: string;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.max(1, Math.min(100, params.limit || 20));
    const skip = (page - 1) * limit;

    const query: any = { isCoinseller: true, isBlocked: false };
    const andConditions: any[] = [];

    if (params.country && params.country.trim() !== '' && params.country.trim().toLowerCase() !== 'all') {
      const targetCountry = params.country.trim();
      const countryConditions: any[] = [];

      if (mongoose.Types.ObjectId.isValid(targetCountry)) {
        countryConditions.push({ _id: new mongoose.Types.ObjectId(targetCountry) });
      }
      countryConditions.push({ name: { $regex: new RegExp(`^${targetCountry}$`, 'i') } });
      countryConditions.push({ code: { $regex: new RegExp(`^${targetCountry}$`, 'i') } });
      countryConditions.push({ name: { $regex: targetCountry, $options: 'i' } });

      const matchingCountries = await Country.find({ $or: countryConditions });
      const countryObjIds = matchingCountries.map(c => c._id);
      const countryNames = matchingCountries.map(c => c.name);
      const countryCodes = matchingCountries.map(c => c.code);

      const userCountryConditions: any[] = [
        { country: { $regex: new RegExp(targetCountry, 'i') } },
        { nationality: { $regex: new RegExp(targetCountry, 'i') } }
      ];

      if (mongoose.Types.ObjectId.isValid(targetCountry)) {
        userCountryConditions.push({ countryId: new mongoose.Types.ObjectId(targetCountry) });
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

      andConditions.push({ $or: userCountryConditions });
    }

    if (params.search && params.search.trim() !== '') {
      const searchStr = params.search.trim();
      const searchRegex = new RegExp(searchStr, 'i');
      const numericSearch = Number(searchStr);
      andConditions.push({
        $or: [
          { name: searchRegex },
          { mobile: searchRegex },
          { whatsapp: searchRegex },
          ...(!isNaN(numericSearch) ? [{ userId: numericSearch }] : [])
        ]
      });
    }

    if (andConditions.length > 0) {
      query.$and = andConditions;
    }

    const total = await User.countDocuments(query);
    const sellers = await User.find(query)
      .select('_id userId name profileImage mobile whatsapp country countryId coinSellerCoins createdAt')
      .populate('profileImage')
      .populate('countryId')
      .skip(skip)
      .limit(limit)
      .lean();

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const list = await Promise.all(
      sellers.map(async (seller) => {
        const sellerObjectId = seller._id;
        const countryObj = await resolveCountryObject(seller as any);

        // 30 days deals calculation
        const deals30DaysAgg = await CoinHistory.aggregate([
          {
            $match: {
              userId: sellerObjectId,
              type: 'transfer',
              amount: { $lt: 0 },
              createdAt: { $gte: thirtyDaysAgo }
            }
          },
          { $group: { _id: null, totalCoinsSold: { $sum: { $abs: '$amount' } } } }
        ]);
        const dealsLast30Days = deals30DaysAgg[0]?.totalCoinsSold || 0;

        // Unique buyers count
        const uniqueCustomers = await CoinHistory.distinct('relatedUserId', {
          userId: sellerObjectId,
          type: 'transfer',
          amount: { $lt: 0 }
        });
        const buyersCount = uniqueCustomers.length;

        // Format deals number (e.g. 183.9M, 1.2K, 500)
        let dealsFormatted = dealsLast30Days.toString();
        if (dealsLast30Days >= 1_000_000) {
          dealsFormatted = (dealsLast30Days / 1_000_000).toFixed(1) + 'M';
        } else if (dealsLast30Days >= 1_000) {
          dealsFormatted = (dealsLast30Days / 1_000).toFixed(1) + 'K';
        }

        // Get or Auto-Create Chat between current user and seller
        let chatId: string | null = null;
        if (params.currentUserId) {
          try {
            const chat = await this.chatService.getOrCreateSingleChat(params.currentUserId, seller._id.toString());
            chatId = chat ? chat._id.toString() : null;
          } catch (err) {
            chatId = null;
          }
        }

        return {
          _id: seller._id,
          userId: seller.userId,
          name: seller.name || 'Seller',
          profileImage: seller.profileImage || null,
          mobile: seller.mobile || '',
          whatsapp: seller.whatsapp || seller.mobile || '',
          chatId,
          country: seller.country || countryObj?.name || countryObj?.code || 'IND',
          countryObject: countryObj || null,
          badge: 'Senior Seller',
          buyersCount,
          dealsLast30Days,
          dealsLast30DaysFormatted: dealsFormatted,
        };
      })
    );

    return {
      sellers: list,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

}

