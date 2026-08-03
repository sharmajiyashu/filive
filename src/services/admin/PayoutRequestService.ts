import { Service } from 'typedi';
import mongoose from 'mongoose';
import PayoutRequest, { IPayoutFieldValue } from '../../models/PayoutRequest';
import PayoutMethod from '../../models/PayoutMethod';
import User from '../../models/User';
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

    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User profile not found');
    }

    const method = await PayoutMethod.findById(data.payoutMethodId).populate('media');
    if (!method || !method.isActive) {
      throw new Error('Payout method not found or currently inactive');
    }

    // Amount validation against min/max limits
    const reqAmount = Number(data.amount);
    if (isNaN(reqAmount) || reqAmount <= 0) {
      throw new Error('Please enter a valid payout amount');
    }
    if (method.minAmount && reqAmount < method.minAmount) {
      throw new Error(`Minimum payout amount for ${method.name} is ${method.minAmount}`);
    }
    if (method.maxAmount && reqAmount > method.maxAmount) {
      throw new Error(`Maximum payout amount for ${method.name} is ${method.maxAmount}`);
    }

    // Dynamic field validation against defined payout method fields
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

    // Extract media URL if populated
    const mediaUrl = (method.media as any)?.url || (method.media as any)?.path || '';

    const payoutRequest = await PayoutRequest.create({
      user: new mongoose.Types.ObjectId(userId),
      payoutMethod: new mongoose.Types.ObjectId(data.payoutMethodId),
      payoutMethodSnapshot: {
        name: method.name,
        mediaUrl: mediaUrl,
        countryCode: method.countries ? method.countries[0] : '',
      },
      fieldValues: fieldValues,
      amount: reqAmount,
      currency: data.currency || 'USD',
      coins: data.coins || 0,
      status: 'pending',
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

    payoutRequest.status = data.status;
    if (data.adminNote !== undefined) payoutRequest.adminNote = data.adminNote;
    if (data.transactionId !== undefined) payoutRequest.transactionId = data.transactionId;
    payoutRequest.processedAt = new Date();
    payoutRequest.processedBy = new mongoose.Types.ObjectId(adminId);

    await payoutRequest.save();

    return await PayoutRequest.findById(requestId)
      .populate('user', 'name email phone profileImage')
      .populate('payoutMethod');
  }
}
