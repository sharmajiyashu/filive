import { Service, Inject } from 'typedi';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import User from '../../models/User';
import config from '../../config';
import AppLogger from '../../api/loaders/logger';
import { CallService } from './CallService';
import { attachUserCountryAndAge } from '../../utils/userLookup';

export type RandomCallType = 'voice' | 'video';

interface QueuedCaller {
  userId: string;
  callType: RandomCallType;
  socketId: string;
  joinedAt: number;
  timeoutId: NodeJS.Timeout;
}

interface AvailableHost {
  userId: string;
  callTypes: RandomCallType[];
  socketId: string;
}

export interface BroadcastSession {
  sessionId: string;
  callerId: string;
  callType: RandomCallType;
  socketId: string;
  candidateHostIds: Set<string>;
  respondedRejectHostIds: Set<string>;
  claimedHostId?: string;
  createdAt: number;
  expiresAt: number;
}

const SEARCH_TIMEOUT_MS = 60_000;

@Service()
export class RandomMatchService {
  @Inject()
  private callService!: CallService;

  private callerQueues: Record<RandomCallType, QueuedCaller[]> = {
    voice: [],
    video: [],
  };

  /** userId → queued callType */
  private callerIndex = new Map<string, RandomCallType>();

  /** userId → availability */
  private availableHosts = new Map<string, AvailableHost>();

  /** Persist host opt-in so they can re-enter the pool after a match ends */
  private hostPreferences = new Map<string, AvailableHost>();

  /** sessionId → active broadcast session */
  private activeBroadcastSessions = new Map<string, BroadcastSession>();

  /** callerId → sessionId */
  private callerToBroadcastSession = new Map<string, string>();

  public isCallerQueued(userId: string): boolean {
    return this.callerIndex.has(userId);
  }

  public isHostAvailable(userId: string): boolean {
    return this.availableHosts.has(userId);
  }

  /**
   * Caller joins home-screen random match queue for voice or video.
   */
  public async joinRandomMatch(
    callerId: string,
    callType: RandomCallType,
    socketId: string,
    io: Server
  ): Promise<void> {
    AppLogger.info(`[RandomMatchService: joinRandomMatch] callerId=${callerId}, callType=${callType}`);

    if (callType !== 'voice' && callType !== 'video') {
      throw new Error('callType must be voice or video');
    }

    if (this.callerIndex.has(callerId)) {
      this.removeCallerFromQueue(callerId, this.callerIndex.get(callerId)!);
    }

    if (this.availableHosts.has(callerId)) {
      this.availableHosts.delete(callerId);
    }

    if (await this.callService.isUserBusy(callerId)) {
      AppLogger.info(`[RandomMatchService: joinRandomMatch] Caller ${callerId} had hanging active call. Auto-ending it.`);
      await this.callService.endUserActiveCalls(callerId, 'new_random_match');
    }

    const caller = await User.findById(callerId).select('coins');
    if (!caller) throw new Error('Caller profile not found');

    const queued: QueuedCaller = {
      userId: callerId,
      callType,
      socketId,
      joinedAt: Date.now(),
      timeoutId: setTimeout(() => {
        this.handleSearchTimeout(callerId, callType, io);
      }, SEARCH_TIMEOUT_MS),
    };

    this.callerQueues[callType].push(queued);
    this.callerIndex.set(callerId, callType);

    io.to(`user_${callerId}`).emit('random_match_searching', {
      callType,
      timeoutMs: SEARCH_TIMEOUT_MS,
      success: true,
      type: 'random_match_searching'
    });

    const matched = await this.tryMatchCaller(queued, io);
    if (!matched) {
      AppLogger.info(`[RandomMatchService: joinRandomMatch] No host yet. callerId=${callerId} waiting`);
    }
  }

  /**
   * Caller leaves the search queue (home leave / cancel).
   */
  public async leaveRandomMatch(callerId: string, io?: Server): Promise<boolean> {
    const callType = this.callerIndex.get(callerId);
    if (callType) {
      this.removeCallerFromQueue(callerId, callType);
    }

    // Dismiss active broadcast session for this caller across all candidate hosts
    const sessionId = this.callerToBroadcastSession.get(callerId);
    if (sessionId) {
      const session = this.activeBroadcastSessions.get(sessionId);
      if (session && io) {
        for (const hostId of session.candidateHostIds) {
          io.to(`user_${hostId}`).emit('call_cancelled', {
            callId: sessionId,
            sessionId,
            reason: 'caller_cancelled',
            message: 'Caller cancelled search',
            success: false,
            type: 'call_cancelled',
          });
          io.to(`user_${hostId}`).emit('random_call_dismiss', {
            callId: sessionId,
            sessionId,
            reason: 'caller_cancelled',
            success: false,
          });
        }
      }
      this.activeBroadcastSessions.delete(sessionId);
      this.callerToBroadcastSession.delete(callerId);
    }

    await this.callService.endUserActiveCalls(callerId, 'cancelled_random_match');

    if (io) {
      io.to(`user_${callerId}`).emit('random_match_left', {
        callType: callType || null,
        success: true,
        type: 'random_match_left'
      });
    }

    AppLogger.info(`[RandomMatchService: leaveRandomMatch] callerId=${callerId}, callType=${callType}`);
    return true;
  }

  /**
   * Host opts in/out of receiving auto-connected random calls.
   */
  public async setHostAvailability(
    hostId: string,
    available: boolean,
    callTypes: RandomCallType[] | undefined,
    socketId: string,
    io: Server
  ): Promise<void> {
    AppLogger.info(
      `[RandomMatchService: setHostAvailability] hostId=${hostId}, available=${available}, callTypes=${JSON.stringify(callTypes)}`
    );

    if (!available) {
      this.availableHosts.delete(hostId);
      this.hostPreferences.delete(hostId);
      io.to(`user_${hostId}`).emit('random_call_availability_updated', {
        available: false,
        callTypes: [],
      });
      return;
    }

    if (this.callerIndex.has(hostId)) {
      throw new Error('Leave random match search before becoming available as a host');
    }

    const host = await User.findById(hostId).select(
      'gender enableVoiceCall enableVideoCall voiceCallPrice videoCallPrice videoVerificationStatus'
    );
    if (!host) throw new Error('Host profile not found');

    if (host.videoVerificationStatus !== 'approved') {
      throw new Error('Host must have approved video verification to accept calls');
    }

    if ((host.gender || '').toLowerCase() !== 'female') {
      throw new Error('Only female hosts can enable random call availability');
    }

    const requestedTypes: RandomCallType[] =
      callTypes && callTypes.length > 0
        ? callTypes.filter((t): t is RandomCallType => t === 'voice' || t === 'video')
        : (['voice', 'video'] as RandomCallType[]);

    if (requestedTypes.length === 0) {
      throw new Error('At least one callType is required');
    }

    const enabledTypes = requestedTypes.filter((t) =>
      t === 'voice' ? host.enableVoiceCall : host.enableVideoCall
    );

    if (enabledTypes.length === 0) {
      throw new Error('Enable voice/video calling on your profile before becoming available');
    }

    if (await this.callService.isUserBusy(hostId)) {
      throw new Error('You are already in another call');
    }

    const hostEntry: AvailableHost = {
      userId: hostId,
      callTypes: enabledTypes,
      socketId,
    };
    this.availableHosts.set(hostId, hostEntry);
    this.hostPreferences.set(hostId, hostEntry);

    io.to(`user_${hostId}`).emit('random_call_availability_updated', {
      available: true,
      callTypes: enabledTypes,
    });

    // Prefer matching waiting callers (FIFO) as soon as host opts in
    for (const callType of enabledTypes) {
      const matched = await this.tryMatchWaitingCallerForHost(hostId, callType, io);
      if (matched) break;
    }
  }

  /**
   * Cleanup when socket disconnects.
   */
  public handleDisconnect(userId: string): void {
    this.leaveRandomMatch(userId);
    this.availableHosts.delete(userId);
    this.hostPreferences.delete(userId);
  }

  public async getAvailableHostProfiles(callType?: RandomCallType, currentUserId?: string) {
    const activeHostIds = this.getAvailableHostIds(callType).filter((id) => id !== currentUserId);

    const query: any = {
      gender: { $regex: /^female$/i },
      videoVerificationStatus: 'approved',
      status: { $ne: 'banned' },
      isBanned: { $ne: true },
    };
    if (currentUserId && mongoose.Types.ObjectId.isValid(currentUserId)) {
      query._id = { $ne: new mongoose.Types.ObjectId(currentUserId) };
    }
    if (callType === 'video') {
      query.enableVideoCall = true;
    } else if (callType === 'voice') {
      query.enableVoiceCall = true;
    } else {
      query.$or = [{ enableVideoCall: true }, { enableVoiceCall: true }];
    }

    // 1. Fetch active socket hosts first if any
    let activeHosts: any[] = [];
    if (activeHostIds.length > 0) {
      activeHosts = await User.find({ _id: { $in: activeHostIds }, ...query })
        .select('userId name profileImage gender country countryId nationality enableVoiceCall enableVideoCall voiceCallPrice videoCallPrice audioCallChargePerMinute videoCallChargePerMinute dob lastLoginAt createdAt')
        .populate('profileImage')
        .populate('countryId');
    }

    // 2. Fallback / supplement with real verified female hosts from DB
    const fetchedIds = activeHosts.map((h: any) => h._id.toString());
    const excludeIds = [...fetchedIds];
    if (currentUserId) excludeIds.push(currentUserId);

    const neededCount = Math.max(0, 20 - activeHosts.length);
    let fallbackHosts: any[] = [];
    if (neededCount > 0) {
      const validExcludeObjectIds = excludeIds
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id));

      fallbackHosts = await User.find({
        ...query,
        _id: { $nin: validExcludeObjectIds },
      })
        .select('userId name profileImage gender country countryId nationality enableVoiceCall enableVideoCall voiceCallPrice videoCallPrice audioCallChargePerMinute videoCallChargePerMinute dob lastLoginAt createdAt')
        .populate('profileImage')
        .populate('countryId')
        .sort({ lastLoginAt: -1, createdAt: -1 })
        .limit(neededCount);
    }

    const allRawHosts = [...activeHosts, ...fallbackHosts];

    const formattedHosts = await Promise.all(
      allRawHosts.map(async (h: any) => {
        const obj = h.toObject ? h.toObject() : h;
        const voiceCallPrice = Number(obj.voiceCallPrice || obj.audioCallChargePerMinute || 0);
        const videoCallPrice = Number(obj.videoCallPrice || obj.videoCallChargePerMinute || 0);
        const currentRate = callType === 'voice' ? voiceCallPrice : (callType === 'video' ? videoCallPrice : (videoCallPrice || voiceCallPrice));
        const isOnline = activeHostIds.includes(obj._id.toString());
        return attachUserCountryAndAge({
          ...obj,
          voiceCallPrice,
          videoCallPrice,
          audioCallPrice: voiceCallPrice,
          audioCallChargePerMinute: voiceCallPrice,
          videoCallChargePerMinute: videoCallPrice,
          voiceRatePerMinute: voiceCallPrice,
          videoRatePerMinute: videoCallPrice,
          ratePerMinute: currentRate,
          isOnline,
          status: isOnline ? 'online' : 'available',
        });
      })
    );

    return { data: formattedHosts, total: formattedHosts.length };
  }

  public getAvailableHostIds(callType?: RandomCallType): string[] {
    const ids: string[] = [];
    for (const [hostId, entry] of this.availableHosts.entries()) {
      if (!callType || entry.callTypes.includes(callType)) {
        ids.push(hostId);
      }
    }
    return ids;
  }

  public async restoreHostIfNeeded(hostId: string, io?: Server): Promise<boolean> {
    const pref = this.hostPreferences.get(hostId);
    if (!pref) return false;
    if (this.availableHosts.has(hostId)) return true;
    if (this.callerIndex.has(hostId)) return false;
    if (await this.callService.isUserBusy(hostId)) return false;

    this.availableHosts.set(hostId, pref);

    if (io) {
      io.to(`user_${hostId}`).emit('random_call_availability_updated', {
        available: true,
        callTypes: pref.callTypes,
      });
      for (const callType of pref.callTypes) {
        const matched = await this.tryMatchWaitingCallerForHost(hostId, callType, io);
        if (matched) break;
      }
    }

    return true;
  }

  public isBroadcastSession(callId: string): boolean {
    if (!callId) return false;
    const str = callId.toString().trim();
    return this.activeBroadcastSessions.has(str) || str.startsWith('rnd_');
  }

  public isHostRinging(hostId: string): boolean {
    for (const session of this.activeBroadcastSessions.values()) {
      if (session.candidateHostIds.has(hostId) && !session.claimedHostId) {
        return true;
      }
    }
    return false;
  }

  public getActiveBroadcastSession(sessionId: string): BroadcastSession | undefined {
    return this.activeBroadcastSessions.get(sessionId.toString().trim());
  }

  private handleSearchTimeout(callerId: string, callType: RandomCallType, io: Server): void {
    if (this.callerIndex.get(callerId) !== callType) return;

    this.removeCallerFromQueue(callerId, callType, false);

    const sessionId = this.callerToBroadcastSession.get(callerId);
    if (sessionId) {
      const session = this.activeBroadcastSessions.get(sessionId);
      if (session) {
        for (const hostId of session.candidateHostIds) {
          io.to(`user_${hostId}`).emit('call_missed', {
            callId: sessionId,
            sessionId,
            reason: 'timeout',
            success: false,
            type: 'call_missed',
          });
          io.to(`user_${hostId}`).emit('call_cancelled', {
            callId: sessionId,
            sessionId,
            reason: 'timeout',
            success: false,
            type: 'call_cancelled',
          });
          io.to(`user_${hostId}`).emit('random_call_dismiss', {
            callId: sessionId,
            sessionId,
            reason: 'timeout',
            success: false,
          });
        }
      }
      this.activeBroadcastSessions.delete(sessionId);
      this.callerToBroadcastSession.delete(callerId);
    }

    io.to(`user_${callerId}`).emit('random_match_timeout', {
      callType,
      reason: 'no_host_found',
      success: false,
      type: 'random_match_timeout'
    });

    AppLogger.info(`[RandomMatchService: handleSearchTimeout] callerId=${callerId}, callType=${callType}`);
  }

  private removeCallerFromQueue(callerId: string, callType: RandomCallType, clearTimeoutFlag = true): void {
    const queue = this.callerQueues[callType];
    const idx = queue.findIndex((c) => c.userId === callerId);
    if (idx >= 0) {
      const [removed] = queue.splice(idx, 1);
      if (clearTimeoutFlag && removed?.timeoutId) {
        clearTimeout(removed.timeoutId);
      }
    }
    this.callerIndex.delete(callerId);
  }

  /**
   * Broadcast incoming call popup to online female hosts with Accept/Reject buttons.
   * As soon as any host accepts, the popup automatically dismisses from all other hosts.
   */
  public async broadcastRandomCallToHosts(caller: QueuedCaller, io: Server): Promise<boolean> {
    if (this.callerIndex.get(caller.userId) !== caller.callType) return false;

    // Check if caller already has an active broadcast session
    const existingSessionId = this.callerToBroadcastSession.get(caller.userId);
    if (existingSessionId && this.activeBroadcastSessions.has(existingSessionId)) {
      return true;
    }

    // 1. Gather all candidate female host IDs:
    // a. Hosts in availableHosts pool
    const availableIds = this.getAvailableHostIds(caller.callType);
    // b. Active online female hosts via active socket connection
    const onlineCandidateIds = await this.findOnlineHostCandidates(caller.userId, caller.callType, io);

    // Combine distinct host IDs
    const allCandidateIds = Array.from(new Set([...availableIds, ...onlineCandidateIds]));

    // Filter eligible hosts
    const eligibleHostIds: string[] = [];
    for (const hostId of allCandidateIds) {
      if (hostId === caller.userId) continue;
      if (this.isHostRinging(hostId)) continue;
      const eligible = await this.isHostEligibleForCaller(caller.userId, hostId, caller.callType);
      if (eligible) {
        eligibleHostIds.push(hostId);
      }
    }

    if (eligibleHostIds.length === 0) {
      return false;
    }

    // Pick candidate hosts (up to 15 hosts)
    const targetHosts = eligibleHostIds.sort(() => Math.random() - 0.5).slice(0, 15);

    const sessionId = `rnd_${Date.now()}_${caller.userId}`;
    const session: BroadcastSession = {
      sessionId,
      callerId: caller.userId,
      callType: caller.callType,
      socketId: caller.socketId,
      candidateHostIds: new Set(targetHosts),
      respondedRejectHostIds: new Set(),
      createdAt: Date.now(),
      expiresAt: Date.now() + SEARCH_TIMEOUT_MS,
    };

    this.activeBroadcastSessions.set(sessionId, session);
    this.callerToBroadcastSession.set(caller.userId, sessionId);

    // Fetch caller public profile
    const callerDoc = await User.findById(caller.userId)
      .select('name userId profileImage gender dob country countryId coins')
      .populate('profileImage')
      .populate('countryId');
    const callerPublic = await this.callService.toPublicCallUser(callerDoc);

    // Broadcast incoming_call to each candidate host
    for (const hostId of targetHosts) {
      try {
        const hostRates = await this.callService.getHostCallEarnRates(hostId);
        const currentCallPrice = caller.callType === 'voice' ? hostRates.voiceCallPrice : hostRates.videoCallPrice;
        const currentEarnPerMin = caller.callType === 'voice' ? hostRates.voiceEarnPerMin : hostRates.videoEarnPerMin;

        const hostPayload = {
          callId: sessionId,
          _id: sessionId,
          displayCallId: sessionId.slice(-8),
          roomId: `room_${sessionId}`,
          callType: caller.callType,
          status: 'ringing',
          role: 'host',
          viewerWallet: 'beans',
          payRatePerMin: currentCallPrice,
          payRateLabel: `Pay ${currentCallPrice} Coins/min`,
          voiceCallPrice: hostRates.voiceCallPrice,
          videoCallPrice: hostRates.videoCallPrice,
          currentCallPrice,
          currency: 'Coins',
          caller: callerPublic,
          otherUser: callerPublic,
          country: callerPublic?.country || null,
          countryId: callerPublic?.countryId || null,
          countryDetail: callerPublic?.countryDetail || null,
          voiceEarnPerMin: hostRates.voiceEarnPerMin,
          videoEarnPerMin: hostRates.videoEarnPerMin,
          currentEarnPerMin,
          hostEarning: {
            voicePerMin: hostRates.voiceEarnPerMin,
            videoPerMin: hostRates.videoEarnPerMin,
            currentPerMin: currentEarnPerMin,
            voiceCallPrice: hostRates.voiceCallPrice,
            videoCallPrice: hostRates.videoCallPrice,
            platformFeePercent: hostRates.platformFeePercent,
            unit: 'beans',
          },
          isRandomMatch: true,
          matchType: 'random',
          success: true,
          type: 'incoming_call',
        };

        io.to(`user_${hostId}`).emit('incoming_call', hostPayload);
        io.to(`user_${hostId}`).emit('random_call_incoming', hostPayload);
      } catch (err: any) {
        AppLogger.warn(`[RandomMatchService] Failed to send invite to host ${hostId}: ${err.message}`);
      }
    }

    AppLogger.info(
      `[RandomMatchService: broadcastRandomCallToHosts] Broadcasted sessionId=${sessionId} to ${targetHosts.length} hosts for caller=${caller.userId} (${caller.callType})`
    );

    return true;
  }

  /**
   * Host accepts the random call invite.
   * Atomically claims match, dismisses popup from all other hosts, and establishes call.
   */
  public async acceptRandomCall(
    hostId: string,
    sessionId: string,
    io: Server
  ): Promise<{ success: boolean; message?: string; data?: any; call?: any }> {
    AppLogger.info(`[RandomMatchService: acceptRandomCall] hostId=${hostId}, sessionId=${sessionId}`);

    const session = this.activeBroadcastSessions.get(sessionId);
    if (!session) {
      return { success: false, message: 'This call is no longer available or has expired.' };
    }

    if (session.claimedHostId) {
      return { success: false, message: 'Call already accepted by another host' };
    }

    if (session.callerId === hostId) {
      return { success: false, message: 'Caller cannot accept their own call.' };
    }

    if (this.callerIndex.get(session.callerId) !== session.callType) {
      this.activeBroadcastSessions.delete(sessionId);
      this.callerToBroadcastSession.delete(session.callerId);
      return { success: false, message: 'Caller has cancelled the search.' };
    }

    if (await this.callService.isUserBusy(hostId)) {
      return { success: false, message: 'You are currently in another call.' };
    }
    if (await this.callService.isUserBusy(session.callerId)) {
      return { success: false, message: 'Caller is already in another call.' };
    }

    // Atomic claim by this host
    session.claimedHostId = hostId;

    // Immediately dismiss popup from all OTHER candidate hosts
    const otherHostIds = [...session.candidateHostIds].filter((id) => id !== hostId);
    for (const otherId of otherHostIds) {
      io.to(`user_${otherId}`).emit('call_cancelled', {
        callId: sessionId,
        sessionId,
        reason: 'taken_by_another_host',
        message: 'Call was accepted by another host',
        success: false,
        type: 'call_cancelled',
      });
      io.to(`user_${otherId}`).emit('random_call_dismiss', {
        callId: sessionId,
        sessionId,
        reason: 'taken_by_another_host',
        success: false,
      });
    }

    // Establish the instant matched call
    const isAvailableHost = this.availableHosts.has(hostId);
    let call: any = null;
    try {
      call = await this.callService.createInstantMatchedCall(
        session.callerId,
        hostId,
        session.callType,
        !isAvailableHost
      );
    } catch (e: any) {
      AppLogger.error(`[RandomMatchService: acceptRandomCall] Failed to create call: ${e.message}`);
      session.claimedHostId = undefined;
      return { success: false, message: e.message || 'Failed to start call' };
    }

    if (!call) {
      session.claimedHostId = undefined;
      return { success: false, message: 'Failed to create call session.' };
    }

    // Remove caller from search queue & clean up broadcast session
    this.removeCallerFromQueue(session.callerId, session.callType);
    if (isAvailableHost) {
      this.availableHosts.delete(hostId);
    }
    this.activeBroadcastSessions.delete(sessionId);
    this.callerToBroadcastSession.delete(session.callerId);

    // Build payload for both caller and host
    const callerPayload = await this.callService.buildCallScreenPayload(call, session.callerId);
    const hostPayload = await this.callService.buildCallScreenPayload(call, hostId);

    const common = {
      agoraAppId: config.agora.appId,
      matchType: 'random' as const,
      startedAt: call.startedAt,
    };

    // Emit random_match_found to caller
    io.to(`user_${session.callerId}`).emit('random_match_found', {
      ...callerPayload,
      ...common,
      peer: callerPayload.otherUser,
      success: true,
      type: 'random_match_found',
    });

    // Emit call_accepted to accepting host
    io.to(`user_${hostId}`).emit('call_accepted', {
      ...hostPayload,
      ...common,
      peer: hostPayload.otherUser,
      success: true,
      type: 'call_accepted',
    });

    AppLogger.info(
      `[RandomMatchService: acceptRandomCall] Matched & connected caller=${session.callerId} and host=${hostId} callId=${call._id}`
    );

    return {
      success: true,
      call,
      data: hostPayload,
    };
  }

  /**
   * Host rejects the random call invite.
   */
  public async rejectRandomCall(
    hostId: string,
    sessionId: string,
    io: Server
  ): Promise<{ success: boolean }> {
    AppLogger.info(`[RandomMatchService: rejectRandomCall] hostId=${hostId}, sessionId=${sessionId}`);

    const session = this.activeBroadcastSessions.get(sessionId);
    if (!session) {
      return { success: true };
    }

    session.respondedRejectHostIds.add(hostId);
    session.candidateHostIds.delete(hostId);

    // If all candidate hosts rejected and call is not claimed, try to find other online hosts
    if (session.candidateHostIds.size === 0 && !session.claimedHostId) {
      const moreHosts = await this.findOnlineHostCandidates(session.callerId, session.callType, io);
      const remainingCandidates = moreHosts.filter(
        (id) => !session.respondedRejectHostIds.has(id) && !this.isHostRinging(id) && id !== session.callerId
      );

      if (remainingCandidates.length > 0) {
        const callerDoc = await User.findById(session.callerId)
          .select('name userId profileImage gender dob country countryId coins')
          .populate('profileImage')
          .populate('countryId');
        const callerPublic = await this.callService.toPublicCallUser(callerDoc);

        for (const newHostId of remainingCandidates.slice(0, 10)) {
          const eligible = await this.isHostEligibleForCaller(session.callerId, newHostId, session.callType);
          if (!eligible) continue;

          session.candidateHostIds.add(newHostId);
          const hostRates = await this.callService.getHostCallEarnRates(newHostId);
          const currentCallPrice = session.callType === 'voice' ? hostRates.voiceCallPrice : hostRates.videoCallPrice;
          const currentEarnPerMin = session.callType === 'voice' ? hostRates.voiceEarnPerMin : hostRates.videoEarnPerMin;

          const hostPayload = {
            callId: sessionId,
            _id: sessionId,
            displayCallId: sessionId.slice(-8),
            roomId: `room_${sessionId}`,
            callType: session.callType,
            status: 'ringing',
            role: 'host',
            viewerWallet: 'beans',
            payRatePerMin: currentCallPrice,
            payRateLabel: `Pay ${currentCallPrice} Coins/min`,
            voiceCallPrice: hostRates.voiceCallPrice,
            videoCallPrice: hostRates.videoCallPrice,
            currentCallPrice,
            currency: 'Coins',
            caller: callerPublic,
            otherUser: callerPublic,
            country: callerPublic?.country || null,
            countryId: callerPublic?.countryId || null,
            voiceEarnPerMin: hostRates.voiceEarnPerMin,
            videoEarnPerMin: hostRates.videoEarnPerMin,
            currentEarnPerMin,
            hostEarning: {
              voicePerMin: hostRates.voiceEarnPerMin,
              videoPerMin: hostRates.videoEarnPerMin,
              currentPerMin: currentEarnPerMin,
              voiceCallPrice: hostRates.voiceCallPrice,
              videoCallPrice: hostRates.videoCallPrice,
              platformFeePercent: hostRates.platformFeePercent,
              unit: 'beans',
            },
            isRandomMatch: true,
            matchType: 'random',
            success: true,
            type: 'incoming_call',
          };
          io.to(`user_${newHostId}`).emit('incoming_call', hostPayload);
          io.to(`user_${newHostId}`).emit('random_call_incoming', hostPayload);
        }
      }
    }

    return { success: true };
  }

  private async tryMatchCaller(caller: QueuedCaller, io: Server): Promise<boolean> {
    return await this.broadcastRandomCallToHosts(caller, io);
  }

  private async tryMatchWaitingCallerForHost(
    hostId: string,
    callType: RandomCallType,
    io: Server
  ): Promise<boolean> {
    const queue = this.callerQueues[callType];
    for (const caller of queue) {
      if (!this.callerIndex.has(caller.userId)) continue;
      const broadcasted = await this.broadcastRandomCallToHosts(caller, io);
      if (broadcasted) return true;
    }
    return false;
  }

  private async tryMatchTwoQueuedUsers(
    userAId: string,
    userBId: string,
    callType: RandomCallType,
    io: Server
  ): Promise<boolean> {
    if (!this.callerIndex.has(userAId) || !this.callerIndex.has(userBId)) return false;
    if (userAId === userBId) return false;

    if (await this.areUsersBlocked(userAId, userBId)) return false;
    await this.callService.endUserActiveCalls(userAId, 'random_match_pairing');
    await this.callService.endUserActiveCalls(userBId, 'random_match_pairing');

    const [userA, userB] = await Promise.all([
      User.findById(userAId).select('gender coins enableVoiceCall enableVideoCall voiceCallPrice videoCallPrice'),
      User.findById(userBId).select('gender coins enableVoiceCall enableVideoCall voiceCallPrice videoCallPrice')
    ]);

    if (!userA || !userB) return false;

    let callerId = userAId;
    let hostId = userBId;

    const aCanHost = callType === 'voice' ? !!userA.enableVoiceCall : !!userA.enableVideoCall;
    const bCanHost = callType === 'voice' ? !!userB.enableVoiceCall : !!userB.enableVideoCall;
    const aRate = callType === 'voice' ? userA.voiceCallPrice || 0 : userA.videoCallPrice || 0;
    const bRate = callType === 'voice' ? userB.voiceCallPrice || 0 : userB.videoCallPrice || 0;

    const isAFemale = (userA.gender || '').toLowerCase() === 'female';
    const isBFemale = (userB.gender || '').toLowerCase() === 'female';

    // Prefer female host with calling enabled
    if (isAFemale && aCanHost && (userB.coins || 0) >= aRate) {
      callerId = userBId;
      hostId = userAId;
    } else if (isBFemale && bCanHost && (userA.coins || 0) >= bRate) {
      callerId = userAId;
      hostId = userBId;
    } else if (aCanHost && (userB.coins || 0) >= aRate) {
      callerId = userBId;
      hostId = userAId;
    } else if (bCanHost && (userA.coins || 0) >= bRate) {
      callerId = userAId;
      hostId = userBId;
    } else {
      callerId = userAId;
      hostId = userBId;
    }

    try {
      await this.finalizeMatchedQueuedUsers(callerId, hostId, callType, io);
      return true;
    } catch (err: any) {
      AppLogger.warn(`[RandomMatchService: tryMatchTwoQueuedUsers] Failed caller=${callerId} host=${hostId}: ${err.message}`);
      return false;
    }
  }

  private async findOnlineHostCandidates(
    callerId: string,
    callType: RandomCallType,
    io: Server
  ): Promise<string[]> {
    try {
      const query: any = {
        _id: { $ne: new mongoose.Types.ObjectId(callerId) },
        gender: { $regex: /^female$/i },
        status: { $ne: 'banned' },
        isBanned: { $ne: true },
        videoVerificationStatus: 'approved',
      };
      if (callType === 'voice') {
        query.enableVoiceCall = true;
      } else {
        query.enableVideoCall = true;
      }

      const hosts = await User.find(query)
        .select('_id')
        .limit(50);

      const onlineHostIds: string[] = [];
      for (const host of hosts) {
        const idStr = host._id.toString();
        const room = io.sockets.adapter.rooms.get(`user_${idStr}`);
        if (room && room.size > 0) {
          const busy = await this.callService.isUserBusy(idStr);
          if (!busy) {
            onlineHostIds.push(idStr);
          }
        }
      }
      return onlineHostIds.sort(() => Math.random() - 0.5);
    } catch (e: any) {
      AppLogger.error(`[RandomMatchService: findOnlineHostCandidates] Error: ${e.message}`);
      return [];
    }
  }

  private async isHostEligibleForCaller(
    callerId: string,
    hostId: string,
    callType: RandomCallType
  ): Promise<boolean> {
    const host = await User.findById(hostId).select(
      'gender enableVoiceCall enableVideoCall voiceCallPrice videoCallPrice'
    );
    if (!host || (host.gender || '').toLowerCase() !== 'female') {
      this.availableHosts.delete(hostId);
      return false;
    }

    const enabled = callType === 'voice' ? host.enableVoiceCall : host.enableVideoCall;
    if (!enabled) return false;

    if (await this.callService.isUserBusy(hostId)) return false;
    if (await this.callService.isUserBusy(callerId)) return false;

    if (await this.areUsersBlocked(callerId, hostId)) return false;

    const caller = await User.findById(callerId).select('coins');
    if (!caller) return false;

    const rate = callType === 'voice' ? host.voiceCallPrice || 0 : host.videoCallPrice || 0;
    if ((caller.coins || 0) < rate) return false;

    return true;
  }

  private async areUsersBlocked(userA: string, userB: string): Promise<boolean> {
    try {
      const Block = mongoose.model('Block');
      const relation = await Block.findOne({
        $or: [
          { blockerId: userA, blockedId: userB },
          { blockerId: userB, blockedId: userA },
        ],
      }).select('_id');
      return !!relation;
    } catch {
      return false;
    }
  }

  private async finalizeMatchedQueuedUsers(
    callerId: string,
    hostId: string,
    callType: RandomCallType,
    io: Server
  ): Promise<void> {
    const call = await this.callService.createInstantMatchedCall(callerId, hostId, callType, true);
    if (!call) {
      throw new Error('Failed to create matched call');
    }

    this.removeCallerFromQueue(callerId, callType);
    this.removeCallerFromQueue(hostId, callType);

    const callerPayload = await this.callService.buildCallScreenPayload(call, callerId);
    const hostPayload = await this.callService.buildCallScreenPayload(call, hostId);

    const common = {
      agoraAppId: config.agora.appId,
      matchType: 'random' as const,
      startedAt: call.startedAt,
    };

    io.to(`user_${callerId}`).emit('random_match_found', {
      ...callerPayload,
      ...common,
      peer: callerPayload.otherUser,
      success: true,
      type: 'random_match_found'
    });

    io.to(`user_${hostId}`).emit('random_match_found', {
      ...hostPayload,
      ...common,
      peer: hostPayload.otherUser,
      success: true,
      type: 'random_match_found'
    });

    AppLogger.info(
      `[RandomMatchService: finalizeMatchedQueuedUsers] Matched queued users caller=${callerId} host=${hostId} callId=${call._id} type=${callType}`
    );
  }

  private async finalizeMatch(
    callerId: string,
    hostId: string,
    callType: RandomCallType,
    io: Server,
    isAvailableHost: boolean = true
  ): Promise<void> {
    const wasQueued = this.callerIndex.get(callerId) === callType;
    if (!wasQueued) {
      throw new Error('Caller is no longer searching');
    }
    if (isAvailableHost && !this.availableHosts.has(hostId)) {
      throw new Error('Host is no longer available');
    }

    const call = await this.callService.createInstantMatchedCall(callerId, hostId, callType, !isAvailableHost);
    if (!call) {
      throw new Error('Failed to create matched call');
    }

    this.removeCallerFromQueue(callerId, callType);
    if (isAvailableHost) {
      this.availableHosts.delete(hostId);
    }

    const callerPayload = await this.callService.buildCallScreenPayload(call, callerId);
    const hostPayload = await this.callService.buildCallScreenPayload(call, hostId);

    const common = {
      agoraAppId: config.agora.appId,
      matchType: 'random' as const,
      startedAt: call.startedAt,
    };

    io.to(`user_${callerId}`).emit('random_match_found', {
      ...callerPayload,
      ...common,
      peer: callerPayload.otherUser,
      success: true,
      type: 'random_match_found'
    });

    io.to(`user_${hostId}`).emit('random_match_found', {
      ...hostPayload,
      ...common,
      peer: hostPayload.otherUser,
      success: true,
      type: 'random_match_found'
    });

    AppLogger.info(
      `[RandomMatchService: finalizeMatch] Matched caller=${callerId} host=${hostId} callId=${call._id} type=${callType}`
    );
  }
}
