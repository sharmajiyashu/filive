import { Service, Container } from 'typedi';
import mongoose from 'mongoose';
import PayoutRequest, { IPayoutFieldValue } from '../../models/PayoutRequest';
import PayoutMethod from '../../models/PayoutMethod';
import User from '../../models/User';
import CoinHistory from '../../models/CoinHistory';
import Country from '../../models/Country';
import { AppSettingService } from '../common/AppSettingService';
import AppLogger from '../../api/loaders/logger';

@Service()
export class PayoutRequestService {
  /**
   * Submit a new Payout Request (App API for User)
   */
  public async createPayoutRequest(
    userId: string,
    data: {
      payoutMethodId: string;
      fieldValues: IPayoutFieldValue[];
      amount: number;
      currency?: string;
      coins?: number;
    }
  ) {
    AppLogger.info(`[PayoutRequestService: createPayoutRequest] User: ${userId}, Method: ${data.payoutMethodId}`);

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error('Invalid user ID');
    }
    if (!mongoose.Types.ObjectId.isValid(data.payoutMethodId)) {
      throw new Error('Invalid payout method ID');
    }

    const appSettingService = Container.get(AppSettingService);

    // 1. Check Cash Out Master Switch & Schedule
    const cashoutEnabled = Boolean((await appSettingService.getSettingValue('cashout_enabled')) ?? true);
    if (!cashoutEnabled) {
      const disabledMsg = (await appSettingService.getSettingValue('cashout_disabled_message')) ||
        'Beans cash out is currently disabled by administrator.';
      throw new Error(disabledMsg);
    }

    const rawAllowedDays = (await appSettingService.getSettingValue('cashout_allowed_days')) || [
      'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
    ];
    const allowedDays: string[] = Array.isArray(rawAllowedDays)
      ? rawAllowedDays.map((d: string) => String(d).trim().toLowerCase())
      : ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

    const currentDay = new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: 'Asia/Kolkata' }).toLowerCase();
    if (!allowedDays.includes(currentDay)) {
      const formattedDays = allowedDays.map((d: string) => d.charAt(0).toUpperCase() + d.slice(1)).join(', ');
      throw new Error(`Beans cash out is not available today (${currentDay.toUpperCase()}). Allowed withdrawal days: ${formattedDays}`);
    }

    // 2. Validate User & Beans Balance
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User profile not found');
    }

    const beansToDebit = Number(data.coins || 0);
    if (isNaN(beansToDebit) || beansToDebit <= 0) {
      throw new Error('Please specify a valid amount of beans to withdraw');
    }

    const currentBeans = user.beans || 0;
    if (currentBeans < beansToDebit) {
      throw new Error(`Insufficient beans balance. You currently have ${currentBeans} beans, but requested ${beansToDebit} beans.`);
    }

    // 3. Validate Payout Method
    const method = await PayoutMethod.findById(data.payoutMethodId).populate('media');
    if (!method || !method.isActive) {
      throw new Error('Payout method not found or currently inactive');
    }

    // 4. Dynamic field validation against defined payout method fields
    let fieldValues = data.fieldValues || [];
    if (typeof fieldValues === 'string') {
      try {
        fieldValues = JSON.parse(fieldValues);
      } catch (e) {
        fieldValues = [];
      }
    }

    for (const reqField of method.fields) {
      if (reqField.required) {
        const userSubmittedVal = fieldValues.find(
          (fv) => fv.fieldName === reqField.fieldName || fv.fieldLabel === reqField.fieldLabel
        );
        if (!userSubmittedVal || !userSubmittedVal.value || userSubmittedVal.value.trim() === '') {
          throw new Error(`Field '${reqField.fieldLabel}' is required`);
        }
      }
    }

    // 5. Currency & Fee Calculations
    const beansPerUsd = Number((await appSettingService.getSettingValue('beans_per_usd')) || 10000);
    const usdToInrRate = Number((await appSettingService.getSettingValue('usd_to_inr_exchange_rate')) || 95.0);
    const currency = (data.currency || 'INR').toUpperCase();

    let rate = 1.0;
    if (currency === 'INR') {
      rate = usdToInrRate;
    } else if (currency === 'USD') {
      rate = 1.0;
    } else {
      const countryDoc = await Country.findOne({ currencyCode: currency, isActive: true });
      rate = countryDoc && countryDoc.exchangeRate ? Number(countryDoc.exchangeRate) : usdToInrRate;
    }

    const usdGross = beansToDebit / beansPerUsd;
    const grossAmount = Number((usdGross * rate).toFixed(2));

    let feeAmount = 0;
    let feePercent = 0;

    if (method.feeType === 'fixed') {
      const fixedFeeInUsd = Number(method.feeValue || 0);
      const fixedFeeInCurrency = currency === 'USD' ? fixedFeeInUsd : Number((fixedFeeInUsd * rate).toFixed(2));
      feeAmount = Math.min(grossAmount, fixedFeeInCurrency);
      feePercent = grossAmount > 0 ? Number(((feeAmount / grossAmount) * 100).toFixed(2)) : 0;
    } else {
      feePercent = Number(method.feeValue !== undefined ? method.feeValue : (method.feePercent || 0));
      feeAmount = Number(((grossAmount * feePercent) / 100).toFixed(2));
    }

    const netAmount = Number(Math.max(0, grossAmount - feeAmount).toFixed(2));

    // Amount validation against min/max limits (evaluated on gross or net)
    if (method.minAmount && grossAmount < method.minAmount) {
      throw new Error(`Minimum payout amount for ${method.name} is ${method.minAmount} ${currency}`);
    }
    if (method.maxAmount && grossAmount > method.maxAmount) {
      throw new Error(`Maximum payout amount for ${method.name} is ${method.maxAmount} ${currency}`);
    }

    // 6. Atomic Debit from User Balance
    const updatedUser = await User.findOneAndUpdate(
      { _id: user._id, beans: { $gte: beansToDebit } },
      { $inc: { beans: -beansToDebit } },
      { new: true }
    );

    if (!updatedUser) {
      throw new Error('Insufficient beans balance. Transaction could not be completed.');
    }

    // Extract media URL if populated
    const mediaUrl = (method.media as any)?.url || (method.media as any)?.path || '';

    // 7. Create PayoutRequest Document
    const payoutRequest = await PayoutRequest.create({
      user: new mongoose.Types.ObjectId(userId),
      payoutMethod: new mongoose.Types.ObjectId(data.payoutMethodId),
      payoutMethodSnapshot: {
        name: method.name,
        mediaUrl: mediaUrl,
        countryCode: method.countries ? method.countries[0] : '',
      },
      fieldValues: fieldValues,
      amount: netAmount,
      grossAmount: grossAmount,
      feeAmount: feeAmount,
      feePercent: feePercent,
      currency: currency,
      coins: beansToDebit,
      status: 'pending',
    });

    // 8. Create CoinHistory Record for Cash Out
    await CoinHistory.create({
      userId: new mongoose.Types.ObjectId(userId),
      amount: -beansToDebit,
      type: 'cash_out',
      wallet: 'beans',
      description: `Cash out via ${method.name} (${netAmount} ${currency}, Fee: ${feeAmount} ${currency})`,
      transactionId: payoutRequest._id.toString(),
    });

    return payoutRequest;
  }

  /**
   * Get user's payout requests history (App API)
   */
  public async getUserPayoutRequests(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const query = { user: new mongoose.Types.ObjectId(userId) };

    const requests = await PayoutRequest.find(query)
      .populate('payoutMethod')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await PayoutRequest.countDocuments(query);
    return {
      data: requests,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get all Payout Requests for Admin Panel
   */
  public async getAdminPayoutRequests(
    page: number = 1,
    limit: number = 20,
    status?: string,
    search?: string
  ) {
    const skip = (page - 1) * limit;
    const query: any = {};

    if (status && status !== 'all') {
      query.status = status;
    }

    if (search) {
      // Find matching users first if searching by user name or email
      const matchingUsers = await User.find({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } },
        ],
      }).select('_id');

      const userIds = matchingUsers.map((u) => u._id);

      query.$or = [
        { user: { $in: userIds } },
        { transactionId: { $regex: search, $options: 'i' } },
        { 'payoutMethodSnapshot.name': { $regex: search, $options: 'i' } },
      ];
    }

    const requests = await PayoutRequest.find(query)
      .populate({
        path: 'user',
        select: 'name email phone profileImage coins country',
        populate: { path: 'profileImage' },
      })
      .populate({
        path: 'payoutMethod',
        populate: { path: 'media' },
      })
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await PayoutRequest.countDocuments(query);
    return {
      data: requests,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Process/Update status of a Payout Request (Admin API)
   */
  public async updatePayoutRequestStatus(
    requestId: string,
    adminId: string,
    data: {
      status: 'approved' | 'rejected' | 'processing';
      adminNote?: string;
      transactionId?: string;
    }
  ) {
    AppLogger.info(`[PayoutRequestService: updateStatus] Request ID: ${requestId}, New Status: ${data.status}`);

    const payoutRequest = await PayoutRequest.findById(requestId);
    if (!payoutRequest) {
      throw new Error('Payout request not found');
    }

    if (payoutRequest.status === 'approved' && data.status === 'rejected') {
      throw new Error('Cannot reject an already approved payout request');
    }

    const previousStatus = payoutRequest.status;
    payoutRequest.status = data.status;
    if (data.adminNote !== undefined) payoutRequest.adminNote = data.adminNote;
    if (data.transactionId !== undefined) payoutRequest.transactionId = data.transactionId;
    payoutRequest.processedAt = new Date();
    payoutRequest.processedBy = new mongoose.Types.ObjectId(adminId);

    await payoutRequest.save();

    // If status transitioned to 'rejected' from another status, refund the debited beans to user
    if (previousStatus !== 'rejected' && data.status === 'rejected' && (payoutRequest.coins || 0) > 0) {
      await User.findByIdAndUpdate(payoutRequest.user, {
        $inc: { beans: payoutRequest.coins },
      });

      await CoinHistory.create({
        userId: payoutRequest.user,
        amount: payoutRequest.coins,
        type: 'cash_out',
        wallet: 'beans',
        description: `Cash out rejected (${data.adminNote || 'Refunded to wallet'})`,
        transactionId: payoutRequest._id.toString(),
      });

      AppLogger.info(`[PayoutRequestService] Refunded ${payoutRequest.coins} beans to user ${payoutRequest.user} upon rejection`);
    }

    return await PayoutRequest.findById(requestId)
      .populate('user', 'name email phone profileImage')
      .populate('payoutMethod');
  }
}
