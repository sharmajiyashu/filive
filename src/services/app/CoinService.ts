import { Service, Inject } from 'typedi';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import qs from 'querystring';
import axios from 'axios';
import config from '../../config';
import CoinPackage, { ICoinPackage } from '../../models/CoinPackage';
import CoinHistory from '../../models/CoinHistory';
import User from '../../models/User';
import Country from '../../models/Country';
import { calculateLocalPrice } from '../../utils/pricing';
import mongoose from 'mongoose';
import { AppSettingService } from '../common/AppSettingService';
import { PaymentMethodService } from './PaymentMethodService';
import { PaymentGatewayKey } from '../../models/PaymentMethod';

type RechargeAudience = 'user' | 'seller';

@Service()
export class CoinService {
  constructor(
    @Inject() private appSettingService: AppSettingService,
    @Inject() private paymentMethodService: PaymentMethodService
  ) { }

  async getPackages(countryId?: string, audience: RechargeAudience = 'user') {
    const packages = await CoinPackage.find({
      isActive: true,
      targetAudience: { $in: [audience, 'all'] },
    }).sort({ coins: 1 });

    if (!countryId) {
      return packages.map(pkg => ({
        ...pkg.toObject(),
        localPrice: pkg.price,
        currencyCode: 'USD',
        currencySymbol: '$'
      }));
    }

    const country = await Country.findById(countryId);
    if (!country) {
      return packages.map(pkg => ({
        ...pkg.toObject(),
        localPrice: pkg.price,
        currencyCode: 'USD',
        currencySymbol: '$'
      }));
    }

    return packages.map(pkg => ({
      ...pkg.toObject(),
      localPrice: calculateLocalPrice(pkg.price, country.exchangeRate),
      currencyCode: country.currencyCode,
      currencySymbol: country.currencySymbol
    }));
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

    const totalBeans = user.beans || 0;
    const withdrawableBeans = totalBeans;
    const beansToBeConfirmed = 0;

    return {
      totalBeans,
      withdrawableBeans,
      beansToBeConfirmed,
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

  async getBeansHistory(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const query = {
      userId,
      type: { $in: ['charm_received', 'coins_to_beans', 'beans_to_coins', 'cash_out', 'call_income', 'agency_commission'] }
    };

    const [history, total] = await Promise.all([
      CoinHistory.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      CoinHistory.countDocuments(query)
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

  private normalizeAudience(audience?: string): RechargeAudience {
    return audience === 'seller' ? 'seller' : 'user';
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
      if (!user.isCoinseller) {
        throw new Error('Only coin sellers can recharge seller packages');
      }
      await User.findByIdAndUpdate(
        userId,
        { $inc: { coinSellerCoins: pkg.coins } },
        { session }
      );
      return { wallet: 'coinSellerCoins' as const };
    }

    await User.findByIdAndUpdate(
      userId,
      { $inc: { coins: pkg.coins, wealthCoins: pkg.coins } },
      { session }
    );
    return { wallet: 'coins' as const };
  }

  private async prepareRechargeContext(
    userId: string,
    packageId: string,
    gateway: PaymentGatewayKey,
    audienceRaw?: string
  ) {
    const audience = this.normalizeAudience(audienceRaw);
    const pkg = await CoinPackage.findById(packageId);
    if (!pkg) throw new Error('Coin package not found');
    if (!pkg.isActive) throw new Error('Coin package is not active');

    await this.paymentMethodService.assertPackageAllowedForAudience(
      pkg.targetAudience,
      audience
    );

    if (audience === 'seller') {
      const user = await User.findById(userId).select('isCoinseller');
      if (!user) throw new Error('User not found');
      if (!user.isCoinseller) {
        throw new Error('Only coin sellers can use seller recharge');
      }
    }

    await this.paymentMethodService.assertPaymentGatewayAllowed(
      userId,
      gateway,
      audience
    );

    return { audience, pkg };
  }

  async recharge(
    userId: string,
    packageId: string,
    transactionId: string,
    audienceRaw?: string
  ) {
    const audience = this.normalizeAudience(audienceRaw);
    const pkg = await CoinPackage.findById(packageId);
    if (!pkg) throw new Error('Package not found');

    await this.paymentMethodService.assertPackageAllowedForAudience(
      pkg.targetAudience,
      audience
    );

    if (audience === 'seller') {
      const user = await User.findById(userId).select('isCoinseller');
      if (!user?.isCoinseller) {
        throw new Error('Only coin sellers can recharge seller packages');
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
      return { success: true, coins: pkg.coins, wallet: credit.wallet, audience };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async createRazorpayOrder(userId: string, packageId: string, audienceRaw?: string) {
    const { audience, pkg } = await this.prepareRechargeContext(
      userId,
      packageId,
      'razorpay',
      audienceRaw
    );

    const keyId = (await this.appSettingService.getSettingValue('payment_gateway_razorpay_key_id')) || config.razorpay.keyId || 'rzp_live_TOLcZZUrGcgCad';
    const keySecret = (await this.appSettingService.getSettingValue('payment_gateway_razorpay_key_secret')) || config.razorpay.keySecret || 'l2iC9Y61NpDsaec0FROTkqsr';

    if (!keyId || !keySecret) {
      throw new Error('Razorpay API keys are not configured on the server');
    }

    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    const user = await User.findById(userId);
    const amountInPaise = Math.round(pkg.price * 100);

    const options = {
      amount: amountInPaise,
      currency: 'INR',
      receipt: `rcg_${userId.toString().slice(-6)}_${Date.now()}`,
      notes: {
        userId: userId.toString(),
        packageId: packageId.toString(),
        packageName: pkg.name,
        coins: pkg.coins,
        rechargeAudience: audience,
      },
    };

    const order = await razorpay.orders.create(options);

    return {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      audience,
      package: {
        id: pkg._id,
        name: pkg.name,
        coins: pkg.coins,
        price: pkg.price,
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
    const keySecret = (await this.appSettingService.getSettingValue('payment_gateway_razorpay_key_secret')) || config.razorpay.keySecret || 'l2iC9Y61NpDsaec0FROTkqsr';
    if (!keySecret) throw new Error('Razorpay secret key is not configured');

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

    let audience = this.normalizeAudience(audienceRaw);
    try {
      const razorpayKeyId = (await this.appSettingService.getSettingValue('payment_gateway_razorpay_key_id')) || config.razorpay.keyId;
      const razorpayKeySecret = keySecret;
      if (razorpayKeyId && razorpayKeySecret) {
        const razorpay = new Razorpay({ key_id: razorpayKeyId, key_secret: razorpayKeySecret });
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
            description: `Recharged with ${pkg.name} via Razorpay (${audience})`,
            transactionId: razorpayPaymentId,
          },
        ],
        { session }
      );

      await session.commitTransaction();

      const updatedUser = await User.findById(userId).select('coins beans coinSellerCoins');

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

    const moneyAmount = Math.round(pkg.price * 100);
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
          description: `Recharged with ${pkg.name} via PandaPay (${audience})`,
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
}
