import { Service, Inject, Container } from 'typedi';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import qs from 'querystring';
import axios from 'axios';
import config from '../../config';
import CoinPackage, { ICoinPackage } from '../../models/CoinPackage';
import CoinHistory from '../../models/CoinHistory';
import Gift from '../../models/Gift';
import User from '../../models/User';
import Country from '../../models/Country';
import { calculateLocalPrice } from '../../utils/pricing';
import mongoose from 'mongoose';
import { AppSettingService } from '../common/AppSettingService';
import { PaymentMethodService } from './PaymentMethodService';
import { PaymentGatewayKey } from '../../models/PaymentMethod';
import AppLogger from '../../api/loaders/logger';

type RechargeAudience = 'user' | 'seller' | 'website';

const BEANS_HISTORY_TYPES = [
  'charm_received',
  'coins_to_beans',
  'beans_to_coins',
  'cash_out',
  'call_income',
  'agency_commission'
] as const;

const BEANS_HISTORY_FILTER_TYPES = [
  { key: 'all', label: 'All Transactions' },
  { key: 'cash_out', label: 'Cash Out' },
  { key: 'gift_income', label: 'Gift Income' },
  { key: 'call_income', label: 'Call Income' },
  { key: 'bean_to_coin_exchange', label: 'Bean to Coin Exchange' },
  { key: 'user_transfer', label: 'User Transfer' },
  { key: 'coinseller_transfer', label: 'CoinSeller Transfer' }
] as const;

const VALID_BEANS_FILTERS = new Set(BEANS_HISTORY_FILTER_TYPES.map(f => f.key));
const GIFT_DESCRIPTION_RE = /gift '([^']+)' x(\d+)/i;

@Service()
export class CoinService {
  constructor(
    @Inject() private appSettingService: AppSettingService,
    @Inject() private paymentMethodService: PaymentMethodService
  ) { }

  async getPackages(countryIdOrCode?: string, audience: RechargeAudience = 'user') {
    const audienceFilter = audience === 'website'
      ? { $in: ['website', 'all', null] }
      : { $in: [audience, 'all', null] };

    let packages = await CoinPackage.find({
      isActive: true,
      $or: [
        { targetAudience: audienceFilter },
        { targetAudience: { $exists: false } },
      ],
    }).sort({ price: 1, coins: 1 });

    // Fallback if no packages matched
    if (packages.length === 0) {
      packages = await CoinPackage.find({
        isActive: true,
      }).sort({ price: 1, coins: 1 });
    }

    let country: any = null;
    if (countryIdOrCode && countryIdOrCode.trim() !== '') {
      const clean = countryIdOrCode.trim();
      if (mongoose.Types.ObjectId.isValid(clean)) {
        country = await Country.findById(clean);
      }
      if (!country) {
        country = await Country.findOne({
          code: clean.toUpperCase(),
          isActive: true,
        });
      }
      if (!country) {
        country = await Country.findOne({
          name: { $regex: new RegExp(`^${clean}$`, 'i') },
          isActive: true,
        });
      }
    }

    if (!country) {
      country = await Country.findOne({ code: 'IN', isActive: true }) || await Country.findOne({ isActive: true });
    }

    const usdToInrRate = Number(
      (await this.appSettingService.getSettingValue('usd_to_inr_exchange_rate')) || 95.0
    );

    return packages.map(pkg => {
      const usdPrice = Number(pkg.price);
      let exchangeRate = 1;

      if (!country || country.currencyCode === 'INR' || country.code === 'IN') {
        exchangeRate = usdToInrRate;
      } else if (country.currencyCode === 'USD' || country.code === 'US') {
        exchangeRate = 1;
      } else {
        exchangeRate = Number(country.exchangeRate || 1);
      }

      const localPrice = calculateLocalPrice(usdPrice, exchangeRate);
      const discountPercent = Math.min(Math.round(((pkg.coins - (usdPrice * 100)) / (pkg.coins || 1)) * 100), 75);

      return {
        ...pkg.toObject(),
        price: usdPrice,
        currencyCode: 'USD',
        currencySymbol: '$',
        localPrice,
        localCurrencyCode: country ? country.currencyCode : 'INR',
        localCurrencySymbol: country ? country.currencySymbol : '₹',
        exchangeRate,
        countryName: country?.name || 'India',
        countryFlag: country?.flag || 'https://flagcdn.com/w160/in.png',
        countryCode: country?.code || 'IN',
        discountPercent: discountPercent > 0 ? discountPercent : 0,
      };
    });
  }

  async getWallet(userId: string) {
    const user = await User.findById(userId).select('coins beans coinSellerCoins isCoinseller');
    if (!user) throw new Error('User not found');
    return {
      coins: user.coins || 0,
      beans: user.beans || 0,
      coinSellerCoins: user.coinSellerCoins || 0,
      isCoinseller: user.isCoinseller || false,
    };
  }

  async getBeansWallet(userId: string) {
    const user = await User.findById(userId).select('beans');
    if (!user) throw new Error('User not found');

    const appSettingService = Container.get(AppSettingService);
    const coinToBeanRateSelf = Number(await appSettingService.getSettingValue('coin_to_bean_rate') ?? 1);
    const coinToBeanRateOther = Number(await appSettingService.getSettingValue('bean_to_coin_rate_other') ?? 0.95);
    const minCoinToBeanTransfer = Number(await appSettingService.getSettingValue('min_coin_to_bean_transfer') ?? 100);
    const exchangeRateBaseBeans = Number(await appSettingService.getSettingValue('exchange_rate_base_beans') ?? 10000);

    const cashoutEnabled = Boolean((await appSettingService.getSettingValue('cashout_enabled')) ?? true);
    const rawAllowedDays = (await appSettingService.getSettingValue('cashout_allowed_days')) || [
      'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
    ];
    const cashoutAllowedDays: string[] = Array.isArray(rawAllowedDays)
      ? rawAllowedDays.map((d: string) => String(d).trim().toLowerCase())
      : ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

    const cashoutDisabledMessage = (await appSettingService.getSettingValue('cashout_disabled_message')) ||
      'Beans cash out is currently closed. Please check the allowed withdrawal schedule.';

    const beansPerUsd = Number((await appSettingService.getSettingValue('beans_per_usd')) || exchangeRateBaseBeans || 10000);
    const usdToInrExchangeRate = Number((await appSettingService.getSettingValue('usd_to_inr_exchange_rate')) || 95.0);

    const currentDay = new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: 'Asia/Kolkata' }).toLowerCase();
    const isCashoutAllowedToday = cashoutAllowedDays.includes(currentDay);
    const isCashoutOpen = cashoutEnabled && isCashoutAllowedToday;

    const totalBeans = user.beans || 0;
    const withdrawableBeans = totalBeans;
    const beansToBeConfirmed = 0;

    return {
      totalBeans,
      withdrawableBeans,
      beansToBeConfirmed,
      coinToBeanRateSelf,
      coinToBeanRateOther,
      minCoinToBeanTransfer,
      exchangeRateBaseBeans,
      beansPerUsd,
      usdToInrExchangeRate,
      isCashoutOpen,
      cashoutEnabled,
      cashoutAllowedDays,
      cashoutDisabledMessage,
    };
  }

  async getHistory(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [history, total] = await Promise.all([
      CoinHistory.find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      CoinHistory.countDocuments({ userId })
    ]);

    return {
      history,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async getBeansHistory(userId: string, page: number = 1, limit: number = 20, type?: string) {
    const filterType = (type || 'all').toLowerCase();
    if (!VALID_BEANS_FILTERS.has(filterType as typeof BEANS_HISTORY_FILTER_TYPES[number]['key'])) {
      throw new Error('Invalid transaction type filter');
    }

    const skip = (page - 1) * limit;
    const query = await this.buildBeansHistoryQuery(userId, filterType);

    const [history, total] = await Promise.all([
      CoinHistory.find(query)
        .populate({
          path: 'giftId',
          populate: { path: 'media', select: 'url' }
        })
        .populate({ path: 'relatedUserId', select: 'name userId isCoinseller' })
        .populate({ path: 'callId', select: 'callType' })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      CoinHistory.countDocuments(query)
    ]);

    const giftByName = await this.lookupGiftsByDescription(history);

    return {
      history: history.map(row => this.mapBeansHistoryRow(row, giftByName)),
      filterTypes: BEANS_HISTORY_FILTER_TYPES,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  private async buildBeansHistoryQuery(userId: string, filterType: string) {
    const query: Record<string, unknown> = { userId };

    if (filterType === 'all') {
      query.type = { $in: [...BEANS_HISTORY_TYPES] };
      return query;
    }

    if (filterType === 'cash_out') {
      query.type = 'cash_out';
      return query;
    }

    if (filterType === 'gift_income') {
      query.type = 'charm_received';
      return query;
    }

    if (filterType === 'call_income') {
      query.type = 'call_income';
      return query;
    }

    query.type = 'beans_to_coins';

    if (filterType === 'bean_to_coin_exchange') {
      query.$or = [
        { transferTarget: 'self' },
        { relatedUserId: { $exists: false } },
        { relatedUserId: null }
      ];
      return query;
    }

    const coinsellerIds = await User.find({ isCoinseller: true }).distinct('_id');
    const legacyRelatedMatch = filterType === 'coinseller_transfer'
      ? { $in: coinsellerIds }
      : { $exists: true, $ne: null, $nin: coinsellerIds };

    query.$or = [
      { transferTarget: filterType === 'coinseller_transfer' ? 'coinseller' : 'user' },
      {
        transferTarget: { $exists: false },
        relatedUserId: legacyRelatedMatch
      },
      {
        transferTarget: null,
        relatedUserId: legacyRelatedMatch
      }
    ];

    return query;
  }

  private async lookupGiftsByDescription(history: any[]) {
    const names = new Set<string>();
    for (const row of history) {
      if (row.type !== 'charm_received') continue;
      if (row.giftId && row.giftId._id) continue;
      const parsed = this.parseGiftFromDescription(row.description);
      if (parsed) names.add(parsed.name);
    }

    if (names.size === 0) return new Map<string, any>();

    const gifts = await Gift.find({ name: { $in: [...names] } })
      .populate({ path: 'media', select: 'url' })
      .lean();

    return new Map(gifts.map((gift: any) => [gift.name, gift]));
  }

  private parseGiftFromDescription(description?: string): { name: string; quantity: number } | null {
    if (!description) return null;
    const match = description.match(GIFT_DESCRIPTION_RE);
    if (!match) return null;
    return { name: match[1], quantity: parseInt(match[2], 10) };
  }

  private resolveRelatedUser(relatedUserId: any): { name: string | null; userId: number | null } | null {
    if (!relatedUserId || !relatedUserId._id) return null;
    if (relatedUserId.name === undefined && relatedUserId.userId === undefined && relatedUserId.isCoinseller === undefined) {
      return null;
    }
    return {
      name: relatedUserId.name ?? null,
      userId: relatedUserId.userId ?? null
    };
  }

  private resolveCallType(row: any): 'voice' | 'video' | null {
    if (row.contextType === 'audio_call') return 'voice';
    if (row.contextType === 'video_call') return 'video';
    const populatedCallType = row.callId?.callType;
    if (populatedCallType === 'voice' || populatedCallType === 'video') return populatedCallType;
    const description = row.description || '';
    if (/video call/i.test(description)) return 'video';
    if (/voice call/i.test(description)) return 'voice';
    return null;
  }

  private resolveTransactionType(row: any): string {
    if (row.type === 'charm_received') return 'gift_income';
    if (row.type === 'cash_out') return 'cash_out';
    if (row.type === 'call_income') return 'call_income';
    if (row.type === 'beans_to_coins') {
      if (row.transferTarget === 'self' || !row.relatedUserId) return 'bean_to_coin_exchange';
      if (row.transferTarget === 'user') return 'user_transfer';
      if (row.transferTarget === 'coinseller') return 'coinseller_transfer';
      if (row.relatedUserId?.isCoinseller) return 'coinseller_transfer';
      return 'user_transfer';
    }
    return row.type;
  }

  private resolveIconType(transactionType: string, callType: 'voice' | 'video' | null): string {
    if (transactionType === 'call_income') {
      return callType === 'video' ? 'video_call' : 'voice_call';
    }
    if (transactionType === 'gift_income') return 'gift';
    if (transactionType === 'cash_out') return 'cash_out';
    if (transactionType === 'bean_to_coin_exchange') return 'exchange';
    if (transactionType === 'user_transfer') return 'user_transfer';
    if (transactionType === 'coinseller_transfer') return 'coinseller_transfer';
    if (transactionType === 'agency_commission') return 'agency_commission';
    return transactionType;
  }

  private resolveTitle(
    relatedUser: { name: string | null; userId: number | null } | null,
    gift: { name?: string } | null,
    transactionType: string,
    callType: 'voice' | 'video' | null
  ): string {
    if (relatedUser?.name) return relatedUser.name;
    if (gift?.name) return gift.name;
    if (transactionType === 'call_income') return callType === 'video' ? 'Video Call' : 'Voice Call';
    if (transactionType === 'gift_income') return 'Gift Income';
    if (transactionType === 'cash_out') return 'Cash Out';
    if (transactionType === 'bean_to_coin_exchange') return 'Bean to Coin Exchange';
    if (transactionType === 'user_transfer') return 'User Transfer';
    if (transactionType === 'coinseller_transfer') return 'CoinSeller Transfer';
    if (transactionType === 'agency_commission') return 'Agency Commission';
    return transactionType;
  }

  private resolveGiftPayload(row: any, giftByName: Map<string, any>) {
    const populatedGift = row.giftId && row.giftId._id ? row.giftId : null;
    const parsed = !populatedGift && row.type === 'charm_received'
      ? this.parseGiftFromDescription(row.description)
      : null;
    const lookedUpGift = parsed ? giftByName.get(parsed.name) : null;
    const giftDoc = populatedGift || lookedUpGift;

    if (!giftDoc) return null;

    const quantity = row.quantity ?? parsed?.quantity ?? null;
    const media = giftDoc.media;

    return {
      name: giftDoc.name,
      icon: media?.url || null,
      quantity
    };
  }

  private mapBeansHistoryRow(row: any, giftByName: Map<string, any>) {
    const transactionType = this.resolveTransactionType(row);
    const callType = transactionType === 'call_income' ? this.resolveCallType(row) : null;
    const relatedUser = this.resolveRelatedUser(row.relatedUserId);
    const gift = this.resolveGiftPayload(row, giftByName);

    return {
      _id: row._id,
      amount: row.amount,
      type: row.type,
      transactionType,
      title: this.resolveTitle(relatedUser, gift, transactionType, callType),
      subtitle: relatedUser?.userId != null ? String(relatedUser.userId) : '',
      relatedUser,
      callType,
      iconType: this.resolveIconType(transactionType, callType),
      description: row.description,
      transactionId: row.transactionId,
      packageId: row.packageId,
      paymentGateway: row.paymentGateway,
      channelName: row.channelName,
      transferTarget: row.transferTarget || null,
      gift,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }

  private normalizeAudience(audience?: string): RechargeAudience {
    if (!audience) return 'user';
    const normalized = String(audience).trim().toLowerCase();
    if (['seller', 'coinseller', 'coin_seller', 'coin-seller'].includes(normalized)) {
      return 'seller';
    }
    if (['website', 'web'].includes(normalized)) {
      return 'website';
    }
    return 'user';
  }

  /**
   * Credit wallet based on recharge context (user → coins/wealthCoins, seller → coinSellerCoins).
   */
  private async creditRechargeCoins(
    userId: string,
    pkg: ICoinPackage,
    audience: RechargeAudience,
    session: mongoose.ClientSession
  ) {
    const user = await User.findById(userId).session(session);
    if (!user) throw new Error('User not found');

    if (audience === 'seller') {
      await User.findByIdAndUpdate(
        userId,
        {
          $inc: { coinSellerCoins: pkg.coins },
          $set: { isCoinseller: true, isCoinsellerActive: true }
        },
        { session }
      );
      return { wallet: 'coinSellerCoins' as const };
    }

    const totalCoins = (pkg.coins || 0) + (pkg.bonus || 0);
    await User.findByIdAndUpdate(
      userId,
      { $inc: { coins: totalCoins, wealthCoins: totalCoins } },
      { session }
    );
    return { wallet: 'coins' as const };
  }

  private async prepareRechargeContext(
    userId: string,
    packageId: string,
    gateway: PaymentGatewayKey,
    audienceRaw?: string,
    platform: 'app' | 'web' = 'app'
  ) {
    const pkg = await CoinPackage.findById(packageId);
    if (!pkg) throw new Error('Coin package not found');
    if (!pkg.isActive) throw new Error('Coin package is not active');

    let audience: RechargeAudience;
    if (audienceRaw) {
      audience = this.normalizeAudience(audienceRaw);
    } else if (pkg.targetAudience === 'seller') {
      audience = 'seller';
    } else {
      audience = 'user';
    }

    await this.paymentMethodService.assertPackageAllowedForAudience(
      pkg.targetAudience,
      audience
    );

    if (audience === 'seller') {
      const user = await User.findById(userId).select('isCoinseller');
      if (!user) throw new Error('User not found');
      if (!user.isCoinseller) {
        await User.findByIdAndUpdate(userId, { isCoinseller: true, isCoinsellerActive: true });
      }
    }

    await this.paymentMethodService.assertPaymentGatewayAllowed(
      userId,
      gateway,
      audience,
      platform
    );

    return { audience, pkg };
  }

  async recharge(
    userId: string,
    packageId: string,
    transactionId: string,
    audienceRaw?: string
  ) {
    const pkg = await CoinPackage.findById(packageId);
    if (!pkg) throw new Error('Package not found');

    let audience: RechargeAudience;
    if (audienceRaw) {
      audience = this.normalizeAudience(audienceRaw);
    } else if (pkg.targetAudience === 'seller') {
      audience = 'seller';
    } else {
      audience = 'user';
    }

    await this.paymentMethodService.assertPackageAllowedForAudience(
      pkg.targetAudience,
      audience
    );

    if (audience === 'seller') {
      const user = await User.findById(userId).select('isCoinseller');
      if (!user?.isCoinseller) {
        await User.findByIdAndUpdate(userId, { isCoinseller: true, isCoinsellerActive: true });
      }
    }

    if (transactionId) {
      const existing = await CoinHistory.findOne({ transactionId });
      if (existing) {
        throw new Error('This transaction has already been processed');
      }
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const credit = await this.creditRechargeCoins(userId, pkg, audience, session);

      await CoinHistory.create([{
        userId,
        packageId: pkg._id,
        amount: pkg.coins,
        type: 'recharge',
        description: `Recharged with ${pkg.name} (${audience})`,
        transactionId,
        paymentGateway: 'Manual',
      }], { session });

      await session.commitTransaction();

      const updatedUser = await User.findById(userId).select('coins coinSellerCoins');
      const newBal = credit.wallet === 'coinSellerCoins' ? (updatedUser?.coinSellerCoins || 0) : (updatedUser?.coins || 0);
      try {
        const { ChatService } = require('./ChatService');
        const chatService: any = Container.get(ChatService);
        await chatService.sendSystemMessage(
          userId,
          'Recharge Successful',
          `🎉 Recharge Successful! You have recharged ${pkg.coins} coins with package "${pkg.name}". Updated Balance: ${newBal} Coins.`,
          {
            isRecharge: true,
            amount: pkg.coins,
            fromUserId: 0,
            fromUserName: 'Payment Gateway',
            newBalance: newBal,
            wallet: credit.wallet,
            isCoinseller: credit.wallet === 'coinSellerCoins',
          }
        );
      } catch (err: any) {
        AppLogger.warn(`[CoinService: recharge] Failed to send system message: ${err?.message}`);
      }

      return { success: true, coins: pkg.coins, wallet: credit.wallet, audience };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  private async getRazorpayConfig() {
    const dbMode = await this.appSettingService.getSettingValue('payment_gateway_razorpay_mode');
    const dbKeyId = await this.appSettingService.getSettingValue('payment_gateway_razorpay_key_id');
    const dbKeySecret = await this.appSettingService.getSettingValue('payment_gateway_razorpay_key_secret');
    const dbTestKeyId = await this.appSettingService.getSettingValue('payment_gateway_razorpay_test_key_id');
    const dbTestKeySecret = await this.appSettingService.getSettingValue('payment_gateway_razorpay_test_key_secret');

    const envKeyId = config.razorpay.keyId || process.env.RAZORPAY_KEY_ID || '';
    const envKeySecret = config.razorpay.keySecret || process.env.RAZORPAY_KEY_SECRET || '';

    let mode = (dbMode || process.env.RAZORPAY_MODE || 'production').toLowerCase();
    let keyId = '';
    let keySecret = '';

    if (mode === 'sandbox' || mode === 'test') {
      keyId =
        (envKeyId.startsWith('rzp_test_') ? envKeyId : '') ||
        dbTestKeyId ||
        (dbKeyId && dbKeyId.startsWith('rzp_test_') ? dbKeyId : '') ||
        'rzp_test_SZYYs3lDnJ1ZqS';
      keySecret =
        (envKeyId.startsWith('rzp_test_') ? envKeySecret : '') ||
        dbTestKeySecret ||
        dbKeySecret ||
        'rcLXRBXWdPWE3IyQe9q7FTPe';
    } else {
      // Production mode: if env or db provides live key, use it; otherwise fallback safely
      if (dbKeyId && dbKeyId.startsWith('rzp_live_') && dbKeySecret) {
        keyId = dbKeyId;
        keySecret = dbKeySecret;
      } else if (envKeyId && envKeyId.startsWith('rzp_live_') && envKeySecret) {
        keyId = envKeyId;
        keySecret = envKeySecret;
      } else if (dbKeyId && dbKeySecret) {
        keyId = dbKeyId;
        keySecret = dbKeySecret;
      } else if (envKeyId && envKeySecret) {
        keyId = envKeyId;
        keySecret = envKeySecret;
        if (envKeyId.startsWith('rzp_test_')) {
          mode = 'test';
        }
      } else {
        keyId = 'rzp_live_TOLcZZUrGcgCad';
        keySecret = 'l2iC9Y61NpDsaec0FROTkqsr';
      }
    }

    return { keyId, keySecret, mode };
  }

  async createRazorpayOrder(
    userId: string,
    packageId: string,
    audienceRaw?: string,
    platform: 'app' | 'web' = 'app'
  ) {
    const { audience, pkg } = await this.prepareRechargeContext(
      userId,
      packageId,
      'razorpay',
      audienceRaw,
      platform
    );

    const { keyId, keySecret, mode: razorpayMode } = await this.getRazorpayConfig();

    if (!keyId || !keySecret) {
      throw new Error(`Razorpay API keys are not configured on the server for ${razorpayMode} mode`);
    }

    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    const user = await User.findById(userId);
    const usdToInrRate = Number(
      (await this.appSettingService.getSettingValue('usd_to_inr_exchange_rate')) || 95.0
    );
    const inrAmount = Number((Number(pkg.price) * usdToInrRate).toFixed(2));
    const amountInPaise = Math.round(inrAmount * 100);

    if (amountInPaise <= 0) {
      throw new Error('Coin package price must be greater than zero');
    }

    const options = {
      amount: amountInPaise,
      currency: 'INR',
      receipt: `rcg_${userId.toString().slice(-6)}_${Date.now()}`,
      notes: {
        userId: userId.toString(),
        packageId: packageId.toString(),
        packageName: pkg.name,
        coins: String(pkg.coins),
        usdPrice: String(pkg.price),
        exchangeRate: String(usdToInrRate),
        inrAmount: String(inrAmount),
        rechargeAudience: audience,
        environment: razorpayMode,
      },
    };

    let order: any;
    try {
      order = await razorpay.orders.create(options);
    } catch (err: any) {
      const errMsg =
        err?.error?.description ||
        err?.description ||
        err?.message ||
        (typeof err === 'object' ? JSON.stringify(err) : 'Failed to create Razorpay order');
      throw new Error(`Razorpay Error: ${errMsg}`);
    }

    return {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      usdAmount: pkg.price,
      exchangeRate: usdToInrRate,
      inrAmount,
      audience,
      mode: razorpayMode,
      package: {
        id: pkg._id,
        name: pkg.name,
        coins: pkg.coins,
        price: pkg.price,
        currency: 'USD',
        targetAudience: pkg.targetAudience,
      },
      keyId,
      user: {
        name: user?.name || 'User',
        email: user?.email || '',
        phone: user?.mobile || '',
      },
    };
  }

  async verifyRazorpayPayment(
    userId: string,
    packageId: string,
    razorpayOrderId: string,
    razorpayPaymentId: string,
    razorpaySignature: string,
    audienceRaw?: string
  ) {
    const { keyId: razorpayKeyId, keySecret, mode: razorpayMode } = await this.getRazorpayConfig();

    if (!keySecret) throw new Error(`Razorpay secret key is not configured for ${razorpayMode} mode`);

    const generatedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    if (generatedSignature !== razorpaySignature) {
      throw new Error('Invalid Razorpay signature. Payment verification failed.');
    }

    const existing = await CoinHistory.findOne({ transactionId: razorpayPaymentId });
    if (existing) {
      throw new Error('This payment has already been processed');
    }

    let audience = audienceRaw ? this.normalizeAudience(audienceRaw) : undefined;
    try {
      if (razorpayKeyId && keySecret) {
        const razorpay = new Razorpay({ key_id: razorpayKeyId, key_secret: keySecret });
        const order: any = await razorpay.orders.fetch(razorpayOrderId);
        if (order?.notes?.rechargeAudience) {
          audience = this.normalizeAudience(order.notes.rechargeAudience);
        }
      }
    } catch {
      // Fall back to request audience if order fetch fails
    }

    const pkg = await CoinPackage.findById(packageId);
    if (!pkg) throw new Error('Coin package not found');

    if (!audience) {
      audience = pkg.targetAudience === 'seller' ? 'seller' : 'user';
    }

    await this.paymentMethodService.assertPackageAllowedForAudience(
      pkg.targetAudience,
      audience
    );

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const credit = await this.creditRechargeCoins(userId, pkg, audience, session);

      const historyRecord = await CoinHistory.create(
        [
          {
            userId,
            packageId: pkg._id,
            amount: pkg.coins,
            type: 'recharge',
            paymentGateway: 'Razorpay',
            description: `Recharged with ${pkg.name} ($${pkg.price} USD) via Razorpay (${audience})`,
            transactionId: razorpayPaymentId,
          },
        ],
        { session }
      );

      await session.commitTransaction();

      const updatedUser = await User.findById(userId).select('coins beans coinSellerCoins');
      const newBal = credit.wallet === 'coinSellerCoins' ? (updatedUser?.coinSellerCoins || 0) : (updatedUser?.coins || 0);
      try {
        const { ChatService } = require('./ChatService');
        const chatService: any = Container.get(ChatService);
        await chatService.sendSystemMessage(
          userId,
          'Recharge Successful',
          `🎉 Recharge Successful! You have recharged ${pkg.coins} coins via Razorpay. Updated Balance: ${newBal} Coins.`,
          {
            isRecharge: true,
            amount: pkg.coins,
            fromUserId: 0,
            fromUserName: 'Razorpay',
            newBalance: newBal,
            wallet: credit.wallet,
            isCoinseller: credit.wallet === 'coinSellerCoins',
          }
        );
      } catch (err: any) {
        AppLogger.warn(`[CoinService: verifyRazorpayPayment] Failed to send system message: ${err?.message}`);
      }

      return {
        success: true,
        message: 'Payment verified and coins added successfully',
        transactionId: razorpayPaymentId,
        orderId: razorpayOrderId,
        addedCoins: pkg.coins,
        audience,
        wallet: credit.wallet,
        currentCoins: updatedUser?.coins || 0,
        currentCoinSellerCoins: updatedUser?.coinSellerCoins || 0,
        history: historyRecord[0],
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async cashOutBeans(userId: string, amountBeans: number, paymentMethodDetails: string) {
    if (amountBeans <= 0) throw new Error('Cash out amount must be greater than zero');
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');
    if ((user.beans || 0) < amountBeans) {
      throw new Error('Insufficient beans balance for cash out');
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      user.beans = (user.beans || 0) - amountBeans;
      await user.save({ session });

      const record = await CoinHistory.create([
        {
          userId,
          amount: -amountBeans,
          type: 'cash_out',
          description: `Cash out request of ${amountBeans} beans (${paymentMethodDetails})`,
        }
      ], { session });

      await session.commitTransaction();
      return {
        success: true,
        message: 'Cash out request submitted successfully',
        remainingBeans: user.beans,
        transaction: record[0],
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async processReferralReward(referrerUserId: string, referredUserId: string) {
    const AppSetting = mongoose.model('AppSetting');
    const rewardSetting = await AppSetting.findOne({ key: 'invite_reward_coins' });
    const rewardAmount = rewardSetting ? Number(rewardSetting.value) : 2000;

    if (rewardAmount <= 0) return null;

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      await User.findByIdAndUpdate(referrerUserId, { $inc: { coins: rewardAmount } }, { session });
      const record = await CoinHistory.create([
        {
          userId: referrerUserId,
          relatedUserId: referredUserId,
          amount: rewardAmount,
          type: 'referral_reward',
          description: `Invite reward for referring user ${referredUserId}`,
        }
      ], { session });

      await session.commitTransaction();
      return record[0];
    } catch (error) {
      await session.abortTransaction();
      console.error('Failed to process referral reward:', error);
      return null;
    } finally {
      session.endSession();
    }
  }

  private generatePandaPayMd5Sign(data: Record<string, any>, key: string): string {
    const filtered = Object.fromEntries(
      Object.entries(data).filter(([_, v]) => v !== '' && v != null && _ !== 'sign')
    );
    const sorted = Object.keys(filtered).sort().map(k => `${k}=${filtered[k]}`);
    const stringA = sorted.join('&') + `&key=${key}`;
    return crypto.createHash('md5').update(stringA).digest('hex').toUpperCase();
  }

  async createPandaPayOrder(userId: string, packageId: string, audienceRaw?: string) {
    const { audience, pkg } = await this.prepareRechargeContext(
      userId,
      packageId,
      'pandapay',
      audienceRaw
    );

    const gatewayUrl = await this.appSettingService.getSettingValue('payment_gateway_pandapay_gateway_url') || 'https://pandaxpay.sbs';
    const appId = await this.appSettingService.getSettingValue('payment_gateway_pandapay_merchant_id') || 'm_6ae9d055c1172ea450cd1507';
    const key = await this.appSettingService.getSettingValue('payment_gateway_pandapay_secret_key') || 'sk_3235a3fe02192c28a4fb9c5bfdc75dd0bb9a26c2b02a16e4113038f9da5f7913';
    const tradeType = await this.appSettingService.getSettingValue('payment_gateway_pandapay_trade_type') || 'upi';
    const notifyUrl = await this.appSettingService.getSettingValue('payment_gateway_pandapay_notify_url') || 'https://filiva-node.creatamax.in/v1/api/app/coins/pandapay/callback';

    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    const usdToInrRate = Number(
      (await this.appSettingService.getSettingValue('usd_to_inr_exchange_rate')) || 95.0
    );
    const inrAmount = Number((Number(pkg.price) * usdToInrRate).toFixed(2));
    const moneyAmount = Math.round(inrAmount * 100);
    // Encode audience + packageId + numeric userId for callback credit context
    // Format: PANDA_{audience}_{packageId}_{timestamp}_{numericUserId}
    const orderSn = `PANDA_${audience}_${packageId}_${Date.now()}_${user.userId || userId.slice(-6)}`;

    const params: Record<string, any> = {
      app_id: appId,
      trade_type: tradeType,
      order_sn: orderSn,
      money: moneyAmount,
      notify_url: notifyUrl,
    };

    params.sign = this.generatePandaPayMd5Sign(params, key);

    const res = await axios.post(
      `${gatewayUrl}/api/create_order.php`,
      qs.stringify(params),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    if (res.data && res.data.status === 1) {
      return {
        success: true,
        orderSn,
        payUrl: res.data.data.pay_url,
        amount: pkg.price,
        coins: pkg.coins,
        packageId: pkg._id,
        audience,
      };
    } else {
      throw new Error(res.data ? res.data.msg : 'Failed to create PandaPay order');
    }
  }

  async processPandaPayCallback(payload: Record<string, any>) {
    const key = await this.appSettingService.getSettingValue('payment_gateway_pandapay_secret_key') || 'sk_3235a3fe02192c28a4fb9c5bfdc75dd0bb9a26c2b02a16e4113038f9da5f7913';

    const receivedSign = payload.sign;
    const expectedSign = this.generatePandaPayMd5Sign(payload, key);

    if (receivedSign !== expectedSign) {
      throw new Error('Invalid signature from PandaPay webhook');
    }

    if (payload.status == 1 || payload.status === '1' || payload.trade_status === 'SUCCESS') {
      const orderSn = payload.order_sn || payload.out_trade_no;
      const existingHistory = await CoinHistory.findOne({ transactionId: orderSn });
      if (existingHistory) {
        return { success: true, message: 'Already processed' };
      }

      // Parse PANDA_{audience}_{packageId}_{timestamp}_{numericUserId}
      const parts = String(orderSn || '').split('_');
      if (parts.length < 5 || (parts[1] !== 'user' && parts[1] !== 'seller')) {
        return { success: true, message: 'Callback received but order format unrecognized' };
      }

      const audience = parts[1] as RechargeAudience;
      const packageId = parts[2];
      const numericUserId = Number(parts[parts.length - 1]);

      const pkg = await CoinPackage.findById(packageId);
      if (!pkg) {
        return { success: true, message: 'Callback received but package not found' };
      }

      const user = Number.isFinite(numericUserId)
        ? await User.findOne({ userId: numericUserId })
        : null;
      if (!user) {
        return { success: true, message: 'Callback received but user not found' };
      }

      const session = await mongoose.startSession();
      session.startTransaction();
      try {
        const credit = await this.creditRechargeCoins(user._id.toString(), pkg, audience, session);
        await CoinHistory.create([{
          userId: user._id,
          packageId: pkg._id,
          amount: pkg.coins,
          type: 'recharge',
          paymentGateway: 'PandaPay',
          description: `Recharged with ${pkg.name} ($${pkg.price} USD) via PandaPay (${audience})`,
          transactionId: orderSn,
        }], { session });
        await session.commitTransaction();
        return { success: true, message: 'Coins credited', wallet: credit.wallet, audience };
      } catch (error) {
        await session.abortTransaction();
        throw error;
      } finally {
        session.endSession();
      }
    }
    return { success: true, message: 'Callback received' };
  }

  private async getCashfreeConfig() {
    const appId =
      (await this.appSettingService.getSettingValue('payment_gateway_cashfree_app_id')) ||
      config.cashfree.appId ||
      process.env.CASHFREE_APP_ID ||
      '';
    const secretKey =
      (await this.appSettingService.getSettingValue('payment_gateway_cashfree_secret_key')) ||
      config.cashfree.secretKey ||
      process.env.CASHFREE_SECRET_KEY ||
      '';
    const mode =
      (await this.appSettingService.getSettingValue('payment_gateway_cashfree_mode')) ||
      config.cashfree.mode ||
      'production';
    const apiVersion =
      (await this.appSettingService.getSettingValue('payment_gateway_cashfree_api_version')) ||
      config.cashfree.apiVersion ||
      '2023-08-01';
    const notifyUrl =
      (await this.appSettingService.getSettingValue('payment_gateway_cashfree_notify_url')) ||
      'https://filiva-node.creatamax.in/v1/api/app/coins/cashfree/callback';

    const baseUrl =
      String(mode).toLowerCase() === 'sandbox'
        ? 'https://sandbox.cashfree.com/pg'
        : 'https://api.cashfree.com/pg';

    return { appId, secretKey, mode, apiVersion, notifyUrl, baseUrl };
  }

  async createCashfreeOrder(
    userId: string,
    packageId: string,
    audienceRaw?: string,
    platform: 'app' | 'web' = 'app'
  ) {
    const { audience, pkg } = await this.prepareRechargeContext(
      userId,
      packageId,
      'cashfree',
      audienceRaw,
      platform
    );

    const { appId, secretKey, mode, apiVersion, notifyUrl, baseUrl } =
      await this.getCashfreeConfig();

    if (!appId || !secretKey) {
      throw new Error('Cashfree credentials are not configured on server');
    }

    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    const cleanUserPhone = (user.mobile || '').replace(/\D/g, '').slice(-10);
    const customerPhone = /^[6-9]\d{9}$/.test(cleanUserPhone) ? cleanUserPhone : '9876543210';
    const customerName = (user.name || 'Filive User').trim().replace(/[^a-zA-Z0-9\s]/g, '') || 'Filive User';
    const customerEmail =
      user.email && user.email.includes('@')
        ? user.email
        : `user_${user.userId || userId.slice(-6)}@filive.app`;

    // Order ID format: CF_{audience}_{packageId}_{timestamp}_{numericUserId}
    const orderId = `CF_${audience.slice(0, 1).toUpperCase()}_${packageId.toString().slice(-6)}_${Date.now()}_${user.userId || userId.slice(-4)}`;
    const usdToInrRate = Number(
      (await this.appSettingService.getSettingValue('usd_to_inr_exchange_rate')) || 95.0
    );
    const inrAmount = Number((Number(pkg.price) * usdToInrRate).toFixed(2));
    const orderAmount = inrAmount;

    const orderMeta: Record<string, string> = {
      return_url: `https://filive.app/payment-return?order_id={order_id}`,
    };
    if (notifyUrl && typeof notifyUrl === 'string' && notifyUrl.trim().startsWith('http')) {
      orderMeta.notify_url = notifyUrl.trim();
    }

    const payload = {
      order_id: orderId,
      order_amount: orderAmount,
      order_currency: 'INR',
      customer_details: {
        customer_id: String(user.userId || userId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 45) || `u_${userId.slice(-8)}`,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
      },
      order_meta: orderMeta,
      order_note: `Recharge ${pkg.coins} coins ($${pkg.price} USD) (${audience})`,
      order_tags: {
        userId: userId.toString(),
        packageId: packageId.toString(),
        audience,
        usdPrice: String(pkg.price),
        exchangeRate: String(usdToInrRate),
      },
    };

    const headers = {
      'x-client-id': appId,
      'x-client-secret': secretKey,
      'x-api-version': apiVersion,
      'Content-Type': 'application/json',
    };

    try {
      const response = await axios.post(`${baseUrl}/orders`, payload, { headers });
      const data = response.data;

      return {
        success: true,
        orderId: data.order_id || orderId,
        cfOrderId: data.cf_order_id,
        paymentSessionId: data.payment_session_id,
        checkoutUrl: `https://filiva-node.creatamax.in/v1/api/app/coins/cashfree/checkout?session_id=${data.payment_session_id}&order_id=${data.order_id || orderId}&env=${String(mode).toLowerCase()}`,
        orderAmount: data.order_amount || orderAmount,
        orderCurrency: data.order_currency || 'INR',
        environment: String(mode).toUpperCase() === 'SANDBOX' ? 'SANDBOX' : 'PRODUCTION',
        audience,
        package: {
          id: pkg._id,
          name: pkg.name,
          coins: pkg.coins,
          price: pkg.price,
          targetAudience: pkg.targetAudience,
        },
        customerDetails: {
          customerId: payload.customer_details.customer_id,
          customerName,
          customerEmail,
          customerPhone,
        },
      };
    } catch (err: any) {
      const errMsg =
        err.response?.data?.message ||
        err.response?.data?.msg ||
        err.message ||
        'Failed to create Cashfree order';
      throw new Error(`Cashfree error: ${errMsg}`);
    }
  }

  async verifyCashfreePayment(
    userId: string,
    orderId: string,
    packageId?: string,
    audienceRaw?: string
  ) {
    const { appId, secretKey, apiVersion, baseUrl } = await this.getCashfreeConfig();

    if (!appId || !secretKey) {
      throw new Error('Cashfree credentials are not configured on server');
    }

    // Check if already processed
    const existingHistory = await CoinHistory.findOne({
      transactionId: orderId,
      type: 'recharge',
    });

    if (existingHistory) {
      const user = await User.findById(userId).select('coins beans coinSellerCoins');
      return {
        success: true,
        message: 'Payment already processed',
        transactionId: existingHistory.transactionId,
        addedCoins: existingHistory.amount,
        currentCoins: user?.coins || 0,
        currentCoinSellerCoins: user?.coinSellerCoins || 0,
        alreadyProcessed: true,
      };
    }

    // Fetch order from Cashfree
    let cfOrder: any = null;
    try {
      const response = await axios.get(`${baseUrl}/orders/${orderId}`, {
        headers: {
          'x-client-id': appId,
          'x-client-secret': secretKey,
          'x-api-version': apiVersion,
        },
      });
      cfOrder = response.data;
    } catch (err: any) {
      const errMsg =
        err.response?.data?.message ||
        err.response?.data?.msg ||
        err.message ||
        'Unable to verify order with Cashfree';
      throw new Error(`Cashfree order lookup failed: ${errMsg}`);
    }

    if (cfOrder.order_status !== 'PAID') {
      throw new Error(
        `Order is not paid yet. Current status: ${cfOrder.order_status || 'UNKNOWN'}`
      );
    }

    // Resolve audience and package
    let audience = audienceRaw ? this.normalizeAudience(audienceRaw) : undefined;
    let resolvedPackageId = packageId;

    if (cfOrder.order_tags?.audience) {
      audience = this.normalizeAudience(cfOrder.order_tags.audience);
    }
    if (cfOrder.order_tags?.packageId && !resolvedPackageId) {
      resolvedPackageId = cfOrder.order_tags.packageId;
    }

    let pkg = resolvedPackageId ? await CoinPackage.findById(resolvedPackageId) : null;
    if (!pkg) {
      pkg = await CoinPackage.findOne({ price: cfOrder.order_amount, isActive: true });
    }
    if (!pkg) {
      throw new Error('Corresponding coin package not found for this order');
    }

    if (!audience) {
      audience = pkg.targetAudience === 'seller' ? 'seller' : 'user';
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const credit = await this.creditRechargeCoins(userId, pkg, audience, session);

      const historyRecord = await CoinHistory.create(
        [
          {
            userId,
            packageId: pkg._id,
            amount: pkg.coins,
            type: 'recharge',
            paymentGateway: 'Cashfree',
            description: `Recharged with ${pkg.name} ($${pkg.price} USD) via Cashfree (${audience})`,
            transactionId: orderId,
          },
        ],
        { session }
      );

      await session.commitTransaction();

      const updatedUser = await User.findById(userId).select('coins beans coinSellerCoins');

      return {
        success: true,
        message: 'Cashfree payment verified and coins added successfully',
        transactionId: orderId,
        cfOrderId: cfOrder.cf_order_id,
        orderId,
        addedCoins: pkg.coins,
        audience,
        wallet: credit.wallet,
        currentCoins: updatedUser?.coins || 0,
        currentCoinSellerCoins: updatedUser?.coinSellerCoins || 0,
        history: historyRecord[0],
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async processCashfreeCallback(payload: Record<string, any>) {
    const orderData = payload?.data?.order || payload?.order || payload;
    const paymentData = payload?.data?.payment || payload?.payment || {};
    const customerData = payload?.data?.customer_details || payload?.customer_details || {};

    const orderId = orderData?.order_id || payload?.orderId;
    if (!orderId) {
      return { success: false, message: 'No order_id in webhook payload' };
    }

    const isPaid =
      orderData?.order_status === 'PAID' ||
      paymentData?.payment_status === 'SUCCESS' ||
      payload?.type === 'PAYMENT_SUCCESS_WEBHOOK';

    if (!isPaid) {
      return {
        success: true,
        message: `Webhook received for non-paid event: ${payload?.type || orderData?.order_status}`,
      };
    }

    const existingHistory = await CoinHistory.findOne({ transactionId: orderId });
    if (existingHistory) {
      return { success: true, message: 'Order already processed' };
    }

    let targetUserId: string | null = null;
    if (orderData?.order_tags?.userId) {
      targetUserId = orderData.order_tags.userId;
    } else if (customerData?.customer_id) {
      const custId = customerData.customer_id;
      const user = /^[0-9a-fA-F]{24}$/.test(custId)
        ? await User.findById(custId)
        : await User.findOne({ userId: Number(custId) });
      if (user) targetUserId = user._id.toString();
    }

    if (!targetUserId) {
      const parts = String(orderId).split('_');
      const lastPart = parts[parts.length - 1];
      const numericUserId = Number(lastPart);
      if (Number.isFinite(numericUserId)) {
        const user = await User.findOne({ userId: numericUserId });
        if (user) targetUserId = user._id.toString();
      }
    }

    if (!targetUserId) {
      return { success: false, message: 'Could not resolve user for Cashfree order' };
    }

    return this.verifyCashfreePayment(
      targetUserId,
      orderId,
      orderData?.order_tags?.packageId,
      orderData?.order_tags?.audience
    );
  }
}
