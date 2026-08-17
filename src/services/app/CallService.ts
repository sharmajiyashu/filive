import { Service, Inject, Container } from 'typedi';
import mongoose from 'mongoose';
import Call from '../../models/Call';
import User from '../../models/User';
import CoinHistory from '../../models/CoinHistory';
import config from '../../config';
import { RtcTokenBuilder, RtcRole } from 'agora-token';
import AppLogger from '../../api/loaders/logger';
import { AppSettingService } from '../common/AppSettingService';
import { assertUsersNotBlocked } from '../../utils/blockCheck';
import { resolveCountryUserFilter } from '../../utils/countryFilter';

@Service()
export class CallService {
  @Inject()
  private appSettingService!: AppSettingService;

  constructor() { }

  public formatDisplayCallId(callId: string): string {
    const hex = (callId || '').toString().replace(/[^a-fA-F0-9]/g, '').slice(-7).toUpperCase();
    return hex ? `Call #${hex}` : 'Call #------';
  }

  private formatDuration(seconds: number): string {
    const secs = Math.max(0, Math.floor(seconds || 0));
    const hours = Math.floor(secs / 3600);
    const minutes = Math.floor((secs % 3600) / 60);
    const remaining = secs % 60;
    const pad = (num: number) => num.toString().padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(remaining)}`;
  }

  private participantId(value: any): string {
    return (value?._id || value)?.toString();
  }

  public profileImageUrl(image: any): string | null {
    if (!image) return null;
    if (typeof image === 'string') {
      return image.startsWith('http') ? image : null;
    }
    return image.url || image.secure_url || null;
  }

  public toPublicCallUser(user: any) {
    if (!user) return null;
    const id = user._id || user.id || null;
    const profileImage = user.profileImage && typeof user.profileImage === 'object' && user.profileImage.url
      ? user.profileImage
      : (user.profileImage ?? null);
    return {
      id,
      userId: user.userId ?? null,
      name: user.name ?? null,
      profileImage,
      profileImageUrl: this.profileImageUrl(user.profileImage)
    };
  }

  public async getHostCallEarnRates(hostUserId: string) {
    const host = await User.findById(hostUserId)
      .select('voiceCallPrice videoCallPrice audioCallChargePerMinute videoCallChargePerMinute');
    const feePercent = Number(await this.appSettingService.getSettingValue('call_platform_fee_percent') ?? 10);
    const voicePrice = Number(host?.voiceCallPrice || host?.audioCallChargePerMinute || 0);
    const videoPrice = Number(host?.videoCallPrice || host?.videoCallChargePerMinute || 0);
    const hostEarnPerMin = (price: number) => Math.max(0, price - Math.round((price * feePercent) / 100));

    return {
      voiceCallPrice: voicePrice,
      videoCallPrice: videoPrice,
      voiceEarnPerMin: hostEarnPerMin(voicePrice),
      videoEarnPerMin: hostEarnPerMin(videoPrice),
      platformFeePercent: feePercent,
      unit: 'beans'
    };
  }

  public async buildCallScreenPayload(call: any, viewerUserId: string) {
    const callerId = this.participantId(call.callerId);
    const receiverId = this.participantId(call.receiverId);
    const isCaller = callerId === viewerUserId.toString();
    const role = isCaller ? 'caller' : 'host';
    const callType = call.callType;

    const [caller, receiver, rates] = await Promise.all([
      User.findById(callerId).select('name userId profileImage').populate('profileImage'),
      User.findById(receiverId).select('name userId profileImage voiceCallPrice videoCallPrice audioCallChargePerMinute videoCallChargePerMinute').populate('profileImage'),
      this.getHostCallEarnRates(receiverId)
    ]);

    const currentCallPrice = callType === 'voice' ? rates.voiceCallPrice : rates.videoCallPrice;
    const currentEarnPerMin = callType === 'voice' ? rates.voiceEarnPerMin : rates.videoEarnPerMin;
    const callerUser = this.toPublicCallUser(caller);
    const receiverUser = this.toPublicCallUser(receiver);

    return {
      callId: call._id,
      displayCallId: this.formatDisplayCallId(call._id.toString()),
      roomId: call.roomId || null,
      callType,
      status: call.status,
      role,
      payRatePerMin: currentCallPrice,
      payRateLabel: `Pay ${currentCallPrice} Coins/min`,
      voiceCallPrice: rates.voiceCallPrice,
      videoCallPrice: rates.videoCallPrice,
      currentCallPrice,
      currency: 'Coins',
      caller: callerUser,
      receiver: receiverUser,
      otherUser: isCaller ? receiverUser : callerUser,
      voiceEarnPerMin: rates.voiceEarnPerMin,
      videoEarnPerMin: rates.videoEarnPerMin,
      currentEarnPerMin,
      hostEarning: {
        voicePerMin: rates.voiceEarnPerMin,
        videoPerMin: rates.videoEarnPerMin,
        currentPerMin: currentEarnPerMin,
        voiceCallPrice: rates.voiceCallPrice,
        videoCallPrice: rates.videoCallPrice,
        platformFeePercent: rates.platformFeePercent,
        unit: 'beans'
      },
      agoraToken: isCaller ? (call.callerAgoraToken || call.agoraToken || null) : (call.receiverAgoraToken || call.agoraToken || null),
      callerAgoraToken: call.callerAgoraToken || null,
      receiverAgoraToken: call.receiverAgoraToken || null
    };
  }

  public async buildAfterCallSummary(call: any, viewerUserId: string) {
    const callerId = this.participantId(call.callerId);
    const receiverId = this.participantId(call.receiverId);
    const isCaller = callerId === viewerUserId.toString();
    const role = isCaller ? 'caller' : 'host';

    const [caller, host] = await Promise.all([
      User.findById(callerId).select('name profileImage coins').populate('profileImage'),
      User.findById(receiverId).select('name profileImage beans').populate('profileImage')
    ]);

    const other = isCaller ? host : caller;
    const summary: any = {
      role,
      callId: call._id,
      displayCallId: this.formatDisplayCallId(call._id.toString()),
      roomId: call.roomId || null,
      callType: call.callType,
      status: call.status,
      duration: call.duration || 0,
      durationFormatted: this.formatDuration(call.duration || 0),
      endedAt: call.endedAt || null,
      otherUser: other
        ? {
            id: other._id,
            name: other.name ?? null,
            profileImage: other.profileImage ?? null
          }
        : null
    };

    if (isCaller) {
      summary.coinsSpent = call.coinsDeducted || 0;
      summary.remainingCoins = caller?.coins || 0;
    } else {
      summary.beansIncome = call.coinsEarned || 0;
      summary.beansBalance = host?.beans || 0;
    }

    return summary;
  }

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

    await assertUsersNotBlocked(callerId, receiverId);

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

    // 3. Check if caller or receiver is already in a call (busy status)
    if (await this.isUserBusy(callerId)) {
      throw new Error('You are already in another call');
    }
    if (await this.isUserBusy(receiverId)) {
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
      matchType: 'direct',
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
        select: 'name profileImage dob voiceCallPrice videoCallPrice audioCallChargePerMinute videoCallChargePerMinute',
        populate: { path: 'profileImage' }
      });

    return populatedCall || call;
  }

  /**
   * Returns true if the user is in an initiated or accepted call.
   */
  public async isUserBusy(userId: string): Promise<boolean> {
    const activeCall = await Call.findOne({
      $or: [
        { callerId: userId, status: { $in: ['initiated', 'accepted'] } },
        { receiverId: userId, status: { $in: ['initiated', 'accepted'] } },
      ],
    }).select('_id');
    return !!activeCall;
  }

  /**
   * Creates an already-accepted random match call with Agora tokens (no ring / accept step).
   */
  public async createInstantMatchedCall(callerId: string, receiverId: string, callType: 'voice' | 'video') {
    AppLogger.info(`[CallService: createInstantMatchedCall] callerId=${callerId}, receiverId=${receiverId}, callType=${callType}`);

    if (!mongoose.Types.ObjectId.isValid(callerId) || !mongoose.Types.ObjectId.isValid(receiverId)) {
      throw new Error('Invalid caller or receiver ID');
    }

    if (callerId === receiverId) {
      throw new Error('You cannot call yourself');
    }

    const caller = await User.findById(callerId);
    if (!caller) throw new Error('Caller profile not found');

    const receiver = await User.findById(receiverId);
    if (!receiver) throw new Error('Receiver profile not found');

    const rate = callType === 'voice' ? receiver.voiceCallPrice || 0 : receiver.videoCallPrice || 0;
    const isCallEnabled = callType === 'voice' ? receiver.enableVoiceCall : receiver.enableVideoCall;

    if (!isCallEnabled) {
      throw new Error(`Receiver does not have ${callType} calling enabled`);
    }

    if (caller.coins < rate) {
      throw new Error(`Insufficient coins to start call. You need at least ${rate} coins.`);
    }

    if (await this.isUserBusy(callerId)) {
      throw new Error('You are already in another call');
    }
    if (await this.isUserBusy(receiverId)) {
      throw new Error('User is busy on another call');
    }

    const callId = new mongoose.Types.ObjectId();
    const roomId = `call_${callId.toString()}`;

    const appId = config.agora.appId;
    const appCertificate = config.agora.appCertificate;
    const expirationTimeInSeconds = 7200;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;
    const uid = 0;

    const callerToken = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      roomId,
      uid,
      RtcRole.PUBLISHER,
      privilegeExpiredTs,
      privilegeExpiredTs
    );

    const receiverToken = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      roomId,
      uid,
      RtcRole.PUBLISHER,
      privilegeExpiredTs,
      privilegeExpiredTs
    );

    const startedAt = new Date();
    await Call.create({
      _id: callId,
      callerId: new mongoose.Types.ObjectId(callerId),
      receiverId: new mongoose.Types.ObjectId(receiverId),
      callType,
      status: 'accepted',
      matchType: 'random',
      roomId,
      agoraToken: receiverToken,
      callerAgoraToken: callerToken,
      receiverAgoraToken: receiverToken,
      coinsDeducted: 0,
      duration: 0,
      startedAt,
    });

    const populatedCall = await Call.findById(callId)
      .populate({
        path: 'callerId',
        select: 'name profileImage coins voiceCallPrice videoCallPrice',
        populate: { path: 'profileImage' }
      })
      .populate({
        path: 'receiverId',
        select: 'name profileImage dob voiceCallPrice videoCallPrice audioCallChargePerMinute videoCallChargePerMinute',
        populate: { path: 'profileImage' }
      });

    return populatedCall;
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

    call.status = 'accepted';
    call.startedAt = new Date();
    call.agoraToken = receiverToken; // backward compatibility
    call.callerAgoraToken = callerToken;
    call.receiverAgoraToken = receiverToken;
    await call.save();

    const populatedCall = await Call.findById(call._id)
      .populate({
        path: 'callerId',
        select: 'name userId profileImage coins',
        populate: { path: 'profileImage' }
      })
      .populate({
        path: 'receiverId',
        select: 'name userId profileImage dob voiceCallPrice videoCallPrice audioCallChargePerMinute videoCallChargePerMinute',
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

        // Calculate platform fee and receiver's earnings
        const platformFeePercent = await this.appSettingService.getSettingValue('call_platform_fee_percent') ?? 10;
        const platformFee = Math.round((actualCost * platformFeePercent) / 100);
        const coinsEarned = Math.max(0, actualCost - platformFee);

        caller.coins = Math.max(0, (caller.coins || 0) - actualCost);
        caller.wealthCoins = (caller.wealthCoins || 0) + actualCost;
        await caller.save();

        receiver.beans = (receiver.beans || 0) + coinsEarned;
        receiver.charmCoins = (receiver.charmCoins || 0) + coinsEarned;
        await receiver.save();

        call.coinsDeducted = actualCost;
        call.coinsEarned = coinsEarned;
        call.platformFee = platformFee;

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
          amount: coinsEarned,
          type: 'call_income',
          description: `Earned ${coinsEarned} beans from ${call.callType} call duration of ${minutes} min(s) (Platform Fee: ${platformFee})`,
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
    const data = await Promise.all(calls.map(call => this.buildAfterCallSummary(call, userId)));

    return {
      data,
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

  public async getAfterCallView(userId: string, callId: string) {
    const call = await this.getCallDetails(userId, callId);
    return this.buildAfterCallSummary(call, userId);
  }

  /**
   * Fetches hosts who have enabled voice call or video call, excluding blocked users and with optional country filter.
   */
  public async getCallingHosts(page: number = 1, limit: number = 10, currentUserId: string, callType?: 'voice' | 'video', country?: string) {
    let query: any = {
      userRole: 'user',
      gender: 'Female',
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

    const countryFilter = await resolveCountryUserFilter(country);
    if (countryFilter) {
      query.$and = query.$and || [];
      query.$and.push(countryFilter);
    }

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

    const hosts = await User.find(query)
      .select('userId name profileImage email bio isPremium gender country countryId enableVoiceCall enableVideoCall voiceCallPrice videoCallPrice lastLoginAt')
      .populate('profileImage')
      .populate('countryId');

    let io: any;
    try {
      io = Container.get('socket');
    } catch (e) { }

    const formattedHosts = hosts.map((h: any) => {
      const hObj = h.toObject ? h.toObject() : h;
      const hostId = hObj._id?.toString();
      const socketOnline = (io && hostId) ? (io.sockets?.adapter?.rooms?.get(`user_${hostId}`)?.size || 0) > 0 : false;
      const recentLogin = hObj.lastLoginAt ? new Date(hObj.lastLoginAt).getTime() > Date.now() - 15 * 60 * 1000 : false;
      const isOnline = socketOnline || recentLogin;
      return {
        ...hObj,
        isOnline,
        status: isOnline ? 'online' : 'offline',
      };
    });

    formattedHosts.sort((a, b) => {
      if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
      return Math.random() - 0.5;
    });

    const total = formattedHosts.length;
    const skip = (page - 1) * limit;
    const paged = formattedHosts.slice(skip, skip + limit);

    return {
      data: paged,
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
