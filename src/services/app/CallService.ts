import { Service } from 'typedi';
import mongoose from 'mongoose';
import Call from '../../models/Call';
import User from '../../models/User';
import CoinHistory from '../../models/CoinHistory';
import config from '../../config';
import { RtcTokenBuilder, RtcRole } from 'agora-token';
import AppLogger from '../../api/loaders/logger';

@Service()
export class CallService {
  constructor() { }

  /**
   * Initiates a new call request between caller and receiver
   */
  public async initiateCall(callerId: string, receiverId: string, callType: 'voice' | 'video') {
    AppLogger.info(`[CallService: initiateCall] callerId=${callerId}, receiverId=${receiverId}, callType=${callType}`);

    if (!mongoose.Types.ObjectId.isValid(callerId) || !mongoose.Types.ObjectId.isValid(receiverId)) {
      throw new Error('Invalid caller or receiver ID');
    }

    if (callerId === receiverId) {
      throw new Error('You cannot call yourself');
    }

    // 1. Fetch caller & receiver profiles
    const caller = await User.findById(callerId);
    if (!caller) throw new Error('Caller profile not found');

    const receiver = await User.findById(receiverId);
    if (!receiver) throw new Error('Receiver profile not found');

    // 2. Validate availability and call price
    const rate = callType === 'voice' ? receiver.voiceCallPrice || 0 : receiver.videoCallPrice || 0;
    const isCallEnabled = callType === 'voice' ? receiver.enableVoiceCall : receiver.enableVideoCall;

    if (!isCallEnabled) {
      throw new Error(`Receiver does not have ${callType} calling enabled`);
    }

    if (caller.coins < rate) {
      throw new Error(`Insufficient coins to start call. You need at least ${rate} coins.`);
    }

    // 3. Check if receiver is already in a call (busy status)
    const activeReceiverCall = await Call.findOne({
      $or: [
        { callerId: receiverId, status: { $in: ['initiated', 'accepted'] } },
        { receiverId: receiverId, status: { $in: ['initiated', 'accepted'] } },
      ],
    });

    if (activeReceiverCall) {
      throw new Error('User is busy on another call');
    }

    // 4. Create Call entry
    const callId = new mongoose.Types.ObjectId();
    const roomId = `call_${callId.toString()}`;
    const call = await Call.create({
      _id: callId,
      callerId: new mongoose.Types.ObjectId(callerId),
      receiverId: new mongoose.Types.ObjectId(receiverId),
      callType,
      status: 'initiated',
      roomId,
      coinsDeducted: 0,
      duration: 0,
    });

    // Populate profiles for response
    const populatedCall = await Call.findById(call._id)
      .populate({
        path: 'callerId',
        select: 'name profileImage coins',
        populate: { path: 'profileImage' }
      })
      .populate({
        path: 'receiverId',
        select: 'name profileImage dob audioCallChargePerMinute videoCallChargePerMinute',
        populate: { path: 'profileImage' }
      });

    return populatedCall || call;
  }

  /**
   * Accepts an incoming call and generates a ZegoCloud Token
   */
  public async acceptCall(receiverId: string, callId: string) {
    AppLogger.info(`[CallService: acceptCall] receiverId=${receiverId}, callId=${callId}`);

    const call = await Call.findById(callId);
    if (!call) throw new Error('Call session not found');

    if (call.receiverId.toString() !== receiverId) {
      throw new Error('Unauthorized to accept this call');
    }

    if (call.status !== 'initiated') {
      throw new Error(`Call cannot be accepted in status: ${call.status}`);
    }

    // Fetch caller & receiver profiles to get their numeric userIds and string accounts
    const caller = await User.findById(call.callerId);
    const receiver = await User.findById(call.receiverId);
    if (!caller || !receiver) {
      throw new Error('User profiles not found');
    }

    // Generate Agora RTC tokens (expire in 2 hours)
    const appId = config.agora.appId;
    const appCertificate = config.agora.appCertificate;
    const expirationTimeInSeconds = 7200;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    // 1. Generate Tokens using numeric UIDs (e.g. caller.userId, receiver.userId) - changed to 0 for wildcard matching
    const callerUid = 0;
    const receiverUid = 0;

    const callerToken = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      call.roomId,
      callerUid,
      RtcRole.PUBLISHER,
      privilegeExpiredTs,
      privilegeExpiredTs
    );

    const receiverToken = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      call.roomId,
      receiverUid,
      RtcRole.PUBLISHER,
      privilegeExpiredTs,
      privilegeExpiredTs
    );

    // 2. Generate Tokens using string User Accounts (e.g. caller._id, receiver._id)
    const callerAccountToken = RtcTokenBuilder.buildTokenWithUserAccount(
      appId,
      appCertificate,
      call.roomId,
      caller._id.toString(),
      RtcRole.PUBLISHER,
      privilegeExpiredTs,
      privilegeExpiredTs
    );

    const receiverAccountToken = RtcTokenBuilder.buildTokenWithUserAccount(
      appId,
      appCertificate,
      call.roomId,
      receiver._id.toString(),
      RtcRole.PUBLISHER,
      privilegeExpiredTs,
      privilegeExpiredTs
    );

    call.status = 'accepted';
    call.startedAt = new Date();
    call.agoraToken = receiverToken; // backward compatibility
    call.callerAgoraToken = callerToken;
    call.receiverAgoraToken = receiverToken;
    call.callerAgoraAccountToken = callerAccountToken;
    call.receiverAgoraAccountToken = receiverAccountToken;
    await call.save();

    const populatedCall = await Call.findById(call._id)
      .populate({
        path: 'callerId',
        select: 'name profileImage coins',
        populate: { path: 'profileImage' }
      })
      .populate({
        path: 'receiverId',
        select: 'name profileImage dob audioCallChargePerMinute videoCallChargePerMinute',
        populate: { path: 'profileImage' }
      });

    return populatedCall || call;
  }

  /**
   * Rejects an incoming call request
   */
  public async rejectCall(receiverId: string, callId: string) {
    AppLogger.info(`[CallService: rejectCall] receiverId=${receiverId}, callId=${callId}`);

    const call = await Call.findById(callId);
    if (!call) throw new Error('Call session not found');

    if (call.receiverId.toString() !== receiverId) {
      throw new Error('Unauthorized to reject this call');
    }

    if (call.status !== 'initiated') {
      throw new Error(`Call cannot be rejected in status: ${call.status}`);
    }

    call.status = 'rejected';
    call.endedAt = new Date();
    await call.save();

    return call;
  }

  /**
   * Ends an active call session and performs billing calculations
   */
  public async endCall(userId: string, callId: string) {
    AppLogger.info(`[CallService: endCall] userId=${userId}, callId=${callId}`);

    const call = await Call.findById(callId);
    if (!call) throw new Error('Call session not found');

    // Verify user is participant in call
    if (call.callerId.toString() !== userId && call.receiverId.toString() !== userId) {
      throw new Error('Unauthorized to end this call');
    }

    // If call was still in 'initiated' status (caller cancelled or receiver declined before accepting)
    if (call.status === 'initiated') {
      // Caller cancelled the call before receiver answered
      if (userId === call.callerId.toString()) {
        call.status = 'cancelled';
      } else {
        // Receiver explicitly ended the incoming call (treated as rejected)
        call.status = 'rejected';
      }
      call.endedAt = new Date();
      await call.save();
      return call;
    }

    if (call.status !== 'accepted') {
      return call; // already ended/rejected
    }

    call.endedAt = new Date();
    call.status = 'ended';

    // Calculate call duration in seconds
    const start = call.startedAt ? call.startedAt.getTime() : call.createdAt.getTime();
    const duration = Math.max(0, Math.floor((call.endedAt.getTime() - start) / 1000));
    call.duration = duration;

    // Billing calculation (cost per minute)
    const receiver = await User.findById(call.receiverId);
    const caller = await User.findById(call.callerId);

    if (receiver && caller) {
      const rate = call.callType === 'voice' ? receiver.voiceCallPrice || 0 : receiver.videoCallPrice || 0;

      // Calculate total cost (charge per started minute)
      const minutes = Math.ceil(duration / 60);
      const cost = minutes * rate;

      if (cost > 0) {
        // Cap the cost to caller's current balance to avoid negative balance
        const actualCost = Math.min(caller.coins || 0, cost);

        caller.coins = Math.max(0, (caller.coins || 0) - actualCost);
        caller.wealthCoins = (caller.wealthCoins || 0) + actualCost;
        await caller.save();

        receiver.coins = (receiver.coins || 0) + actualCost;
        receiver.charmCoins = (receiver.charmCoins || 0) + actualCost;
        await receiver.save();

        call.coinsDeducted = actualCost;

        // Record coin transaction logs
        await CoinHistory.create({
          userId: caller._id,
          relatedUserId: receiver._id,
          amount: -actualCost,
          type: 'transfer',
          description: `Paid for ${call.callType} call duration of ${minutes} min(s)`,
          channelName: call.roomId,
        });

        await CoinHistory.create({
          userId: receiver._id,
          relatedUserId: caller._id,
          amount: actualCost,
          type: 'charm_received',
          description: `Earned from ${call.callType} call duration of ${minutes} min(s)`,
          channelName: call.roomId,
        });

        AppLogger.info(`[CallService: endCall] Billed ${actualCost} coins for callId=${callId}. Duration=${duration}s`);
      }
    }

    await call.save();

    const populatedCall = await Call.findById(call._id)
      .populate({
        path: 'callerId',
        select: 'name profileImage coins',
        populate: { path: 'profileImage' }
      })
      .populate({
        path: 'receiverId',
        select: 'name profileImage dob audioCallChargePerMinute videoCallChargePerMinute',
        populate: { path: 'profileImage' }
      });

    return populatedCall || call;
  }

  /**
   * Fetches call history of a user with pagination
   */
  public async getCallHistory(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const query = {
      $or: [
        { callerId: new mongoose.Types.ObjectId(userId) },
        { receiverId: new mongoose.Types.ObjectId(userId) },
      ],
    };

    const calls = await Call.find(query)
      .populate({
        path: 'callerId',
        select: 'name profileImage isPremium gender',
        populate: { path: 'profileImage' }
      })
      .populate({
        path: 'receiverId',
        select: 'name profileImage isPremium gender dob audioCallChargePerMinute videoCallChargePerMinute',
        populate: { path: 'profileImage' }
      })
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await Call.countDocuments(query);

    return {
      data: calls,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Fetches specific call details
   */
  public async getCallDetails(userId: string, callId: string) {
    const call = await Call.findById(callId)
      .populate({
        path: 'callerId',
        select: 'name profileImage coins',
        populate: { path: 'profileImage' }
      })
      .populate({
        path: 'receiverId',
        select: 'name profileImage dob audioCallChargePerMinute videoCallChargePerMinute',
        populate: { path: 'profileImage' }
      });

    if (!call) throw new Error('Call session not found');

    if (call.callerId._id.toString() !== userId && call.receiverId._id.toString() !== userId) {
      throw new Error('Unauthorized access to call details');
    }

    return call;
  }

  /**
   * Fetches hosts who have enabled voice call or video call, excluding blocked users.
   */
  public async getCallingHosts(page: number = 1, limit: number = 10, currentUserId: string, callType?: 'voice' | 'video') {
    let query: any = {
      userRole: 'user'
    };

    if (callType === 'voice') {
      query.enableVoiceCall = true;
    } else if (callType === 'video') {
      query.enableVideoCall = true;
    } else {
      query.$or = [
        { enableVoiceCall: true },
        { enableVideoCall: true }
      ];
    }

    // Exclude blocked users
    const Block = mongoose.model('Block');
    const blockedRelations = await Block.find({
      $or: [
        { blockerId: currentUserId },
        { blockedId: currentUserId }
      ]
    });

    const excludedUserIds = blockedRelations.map((rel: any) =>
      rel.blockerId.toString() === currentUserId ? rel.blockedId : rel.blockerId
    );

    const ninIds = [...excludedUserIds, new mongoose.Types.ObjectId(currentUserId)];
    query._id = { $nin: ninIds };

    const skip = (page - 1) * limit;
    const hosts = await User.find(query)
      .select('name profileImage email bio isPremium gender country enableVoiceCall enableVideoCall voiceCallPrice videoCallPrice')
      .populate('profileImage')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await User.countDocuments(query);

    return {
      data: hosts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Handles automatically cutting/timing out a call if not answered
   */
  public async handleCallTimeout(callId: string) {
    AppLogger.info(`[CallService: handleCallTimeout] callId=${callId}`);
    const call = await Call.findById(callId);
    if (!call) return null;

    if (call.status === 'initiated') {
      call.status = 'missed';
      call.endedAt = new Date();
      await call.save();

      const populatedCall = await Call.findById(call._id)
        .populate({
          path: 'callerId',
          select: 'name profileImage coins',
          populate: { path: 'profileImage' }
        })
        .populate({
          path: 'receiverId',
          select: 'name profileImage dob audioCallChargePerMinute videoCallChargePerMinute',
          populate: { path: 'profileImage' }
        });

      return populatedCall || call;
    }
    return null;
  }
}
