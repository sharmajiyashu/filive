import { Service, Inject } from 'typedi';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import qs from 'querystring';
import axios from 'axios';
import config from '../../config';
import CoinPackage from '../../models/CoinPackage';
import CoinHistory from '../../models/CoinHistory';
import User from '../../models/User';
import Country from '../../models/Country';
import { calculateLocalPrice } from '../../utils/pricing';
import mongoose from 'mongoose';
import { AppSettingService } from '../common/AppSettingService';

@Service()
export class CoinService {
  constructor(
    @Inject() private appSettingService: AppSettingService
  ) { }
  async getPackages(countryId?: string) {
    const packages = await CoinPackage.find({ isActive: true }).sort({ coins: 1 });

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
    const user = await User.findById(userId).select('coins beans');
    if (!user) throw new Error('User not found');
    return {
      coins: user.coins || 0,
      beans: user.beans || 0
    };
  }

  async getBeansWallet(userId: string) {
    const user = await User.findById(userId).select('beans');
    if (!user) throw new Error('User not found');

    // Total Beans balance
    const totalBeans = user.beans || 0;

    // Calculate withdrawable beans and pending/to-be-confirmed beans
    // For now, withdrawableBeans is current total beans, and beansToBeConfirmed is calculated from active pending requests or default split
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

    // Filter history entries relevant to Beans
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

  async recharge(userId: string, packageId: string, transactionId: string) {
    const pkg = await CoinPackage.findById(packageId);
    if (!pkg) throw new Error('Package not found');

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      await User.findByIdAndUpdate(userId, { $inc: { coins: pkg.coins, wealthCoins: pkg.coins } }, { session });

      await CoinHistory.create([{
        userId,
        amount: pkg.coins,
        type: 'recharge',
        description: `Recharged with ${pkg.name}`,
        transactionId
      }], { session });

      await session.commitTransaction();
      return { success: true, coins: pkg.coins };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async createRazorpayOrder(userId: string, packageId: string) {
    const isEnabled = await this.appSettingService.getSettingValue('payment_gateway_razorpay_enabled');
    if (isEnabled === false) {
      throw new Error('Razorpay payment gateway is currently disabled by administrator');
    }

    const pkg = await CoinPackage.findById(packageId);
    if (!pkg) throw new Error('Coin package not found');

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

    // Razorpay amount is in paise (1 INR = 100 paise)
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
      },
    };

    const order = await razorpay.orders.create(options);

    return {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      package: {
        id: pkg._id,
        name: pkg.name,
        coins: pkg.coins,
        price: pkg.price,
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
    razorpaySignature: string
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

    const pkg = await CoinPackage.findById(packageId);
    if (!pkg) throw new Error('Coin package not found');

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      await User.findByIdAndUpdate(
        userId,
        { $inc: { coins: pkg.coins, wealthCoins: pkg.coins } },
        { session }
      );

      const historyRecord = await CoinHistory.create(
        [
          {
            userId,
            packageId: pkg._id,
            amount: pkg.coins,
            type: 'recharge',
            description: `Recharged with ${pkg.name} via Razorpay`,
            transactionId: razorpayPaymentId,
          },
        ],
        { session }
      );

      await session.commitTransaction();

      const updatedUser = await User.findById(userId).select('coins beans');

      return {
        success: true,
        message: 'Payment verified and coins added successfully',
        transactionId: razorpayPaymentId,
        orderId: razorpayOrderId,
        addedCoins: pkg.coins,
        currentCoins: updatedUser?.coins || 0,
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

  /**
   * PandaPay MD5 Signature Generation
   */
  private generatePandaPayMd5Sign(data: Record<string, any>, key: string): string {
    const filtered = Object.fromEntries(
      Object.entries(data).filter(([_, v]) => v !== '' && v != null && _ !== 'sign')
    );
    const sorted = Object.keys(filtered).sort().map(k => `${k}=${filtered[k]}`);
    const stringA = sorted.join('&') + `&key=${key}`;
    return crypto.createHash('md5').update(stringA).digest('hex').toUpperCase();
  }

  /**
   * Create PandaPay Order
   */
  async createPandaPayOrder(userId: string, packageId: string) {
    const isPandaPayEnabled = await this.appSettingService.getSettingValue('payment_gateway_pandapay_enabled');
    if (isPandaPayEnabled === false) {
      throw new Error('PandaPay payment gateway is currently disabled by administrator');
    }

    const gatewayUrl = await this.appSettingService.getSettingValue('payment_gateway_pandapay_gateway_url') || 'https://pandaxpay.sbs';
    const appId = await this.appSettingService.getSettingValue('payment_gateway_pandapay_merchant_id') || 'm_6ae9d055c1172ea450cd1507';
    const key = await this.appSettingService.getSettingValue('payment_gateway_pandapay_secret_key') || 'sk_3235a3fe02192c28a4fb9c5bfdc75dd0bb9a26c2b02a16e4113038f9da5f7913';
    const tradeType = await this.appSettingService.getSettingValue('payment_gateway_pandapay_trade_type') || 'upi';
    const notifyUrl = await this.appSettingService.getSettingValue('payment_gateway_pandapay_notify_url') || 'https://filiva-node.creatamax.in/v1/api/app/coins/pandapay/callback';

    const pkg = await CoinPackage.findById(packageId);
    if (!pkg) throw new Error('Coin package not found');

    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    // Amount in cents / paisa format (e.g. 5050 = 50.50 INR)
    const moneyAmount = Math.round(pkg.price * 100);
    const orderSn = `PANDA_${Date.now()}_${user.userId || userId.slice(-6)}`;

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
      };
    } else {
      throw new Error(res.data ? res.data.msg : 'Failed to create PandaPay order');
    }
  }

  /**
   * Verify and process PandaPay Callback / Webhook Notification
   */
  async processPandaPayCallback(payload: Record<string, any>) {
    const key = await this.appSettingService.getSettingValue('payment_gateway_pandapay_secret_key') || 'sk_3235a3fe02192c28a4fb9c5bfdc75dd0bb9a26c2b02a16e4113038f9da5f7913';

    const receivedSign = payload.sign;
    const expectedSign = this.generatePandaPayMd5Sign(payload, key);

    if (receivedSign !== expectedSign) {
      throw new Error('Invalid signature from PandaPay webhook');
    }

    if (payload.status == 1 || payload.status === '1' || payload.trade_status === 'SUCCESS') {
      const orderSn = payload.order_sn || payload.out_trade_no;
      // Extract userId or find from existing history transaction
      const existingHistory = await CoinHistory.findOne({ transactionId: orderSn });
      if (existingHistory) {
        return { success: true, message: 'Already processed' };
      }
    }
    return { success: true, message: 'Callback received' };
  }
}
