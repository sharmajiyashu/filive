import { Service, Inject } from 'typedi';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import User from '../../models/User';
import config from '../../config';
import AppLogger from '../../api/loaders/logger';
import { CallService } from './CallService';

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
      throw new Error('You are already searching for a random match');
    }

    if (this.availableHosts.has(callerId)) {
      throw new Error('Turn off random call availability before searching as a caller');
    }

    if (await this.callService.isUserBusy(callerId)) {
      throw new Error('You are already in another call');
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
    });

    const matched = await this.tryMatchCaller(queued, io);
    if (!matched) {
      AppLogger.info(`[RandomMatchService: joinRandomMatch] No host yet. callerId=${callerId} waiting`);
    }
  }

  /**
   * Caller leaves the search queue (home leave / cancel).
   */
  public leaveRandomMatch(callerId: string, io?: Server): boolean {
    const callType = this.callerIndex.get(callerId);
    if (!callType) return false;

    this.removeCallerFromQueue(callerId, callType);

    if (io) {
      io.to(`user_${callerId}`).emit('random_match_left', { callType });
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
      'gender enableVoiceCall enableVideoCall voiceCallPrice videoCallPrice'
    );
    if (!host) throw new Error('Host profile not found');

    if (host.gender !== 'Female') {
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
    const hostIds = this.getAvailableHostIds(callType).filter((id) => id !== currentUserId);
    if (hostIds.length === 0) {
      return { data: [], total: 0 };
    }

    const hosts = await User.find({ _id: { $in: hostIds }, gender: 'Female' })
      .select('userId name profileImage gender country countryId enableVoiceCall enableVideoCall voiceCallPrice videoCallPrice lastLoginAt')
      .populate('profileImage')
      .populate('countryId');

    const shuffled = hosts
      .map((h: any) => {
        const obj = h.toObject ? h.toObject() : h;
        return { ...obj, isOnline: true, status: 'online' };
      })
      .sort(() => Math.random() - 0.5);

    return { data: shuffled, total: shuffled.length };
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

  private handleSearchTimeout(callerId: string, callType: RandomCallType, io: Server): void {
    if (this.callerIndex.get(callerId) !== callType) return;

    this.removeCallerFromQueue(callerId, callType, false);

    io.to(`user_${callerId}`).emit('random_match_timeout', {
      callType,
      reason: 'no_host_found',
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

  private async tryMatchCaller(caller: QueuedCaller, io: Server): Promise<boolean> {
    if (this.callerIndex.get(caller.userId) !== caller.callType) return false;

    const hostIds = [...this.availableHosts.keys()];
    // Shuffle for random pick
    for (let i = hostIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [hostIds[i], hostIds[j]] = [hostIds[j], hostIds[i]];
    }

    for (const hostId of hostIds) {
      const hostEntry = this.availableHosts.get(hostId);
      if (!hostEntry || !hostEntry.callTypes.includes(caller.callType)) continue;
      if (hostId === caller.userId) continue;

      const eligible = await this.isHostEligibleForCaller(caller.userId, hostId, caller.callType);
      if (!eligible) continue;

      try {
        await this.finalizeMatch(caller.userId, hostId, caller.callType, io);
        return true;
      } catch (err: any) {
        AppLogger.warn(
          `[RandomMatchService: tryMatchCaller] Match failed caller=${caller.userId} host=${hostId}: ${err.message}`
        );
        // Try next host
      }
    }

    return false;
  }

  private async tryMatchWaitingCallerForHost(
    hostId: string,
    callType: RandomCallType,
    io: Server
  ): Promise<boolean> {
    const queue = this.callerQueues[callType];
    // FIFO copy of ids (queue mutates on success)
    const waitingIds = queue.map((c) => c.userId);

    for (const callerId of waitingIds) {
      if (!this.callerIndex.has(callerId)) continue;
      if (!this.availableHosts.has(hostId)) return false;

      const eligible = await this.isHostEligibleForCaller(callerId, hostId, callType);
      if (!eligible) continue;

      try {
        await this.finalizeMatch(callerId, hostId, callType, io);
        return true;
      } catch (err: any) {
        AppLogger.warn(
          `[RandomMatchService: tryMatchWaitingCallerForHost] Match failed caller=${callerId} host=${hostId}: ${err.message}`
        );
      }
    }

    return false;
  }

  private async isHostEligibleForCaller(
    callerId: string,
    hostId: string,
    callType: RandomCallType
  ): Promise<boolean> {
    const host = await User.findById(hostId).select(
      'gender enableVoiceCall enableVideoCall voiceCallPrice videoCallPrice'
    );
    if (!host || host.gender !== 'Female') {
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

  private async finalizeMatch(
    callerId: string,
    hostId: string,
    callType: RandomCallType,
    io: Server
  ): Promise<void> {
    const wasQueued = this.callerIndex.get(callerId) === callType;
    if (!wasQueued) {
      throw new Error('Caller is no longer searching');
    }
    if (!this.availableHosts.has(hostId)) {
      throw new Error('Host is no longer available');
    }

    // Create call first so a failed attempt keeps both parties in queue/availability
    const call = await this.callService.createInstantMatchedCall(callerId, hostId, callType);
    if (!call) {
      throw new Error('Failed to create matched call');
    }

    this.removeCallerFromQueue(callerId, callType);
    this.availableHosts.delete(hostId);
    // hostPreferences kept so the host re-enters the pool after the call ends

    const callerObj = call.callerId as any;
    const receiverObj = call.receiverId as any;

    const basePeer = (user: any) => ({
      id: user?._id?.toString?.() || user?._id || user,
      name: user?.name || null,
      profileImage: user?.profileImage || null,
      voiceCallPrice: user?.voiceCallPrice ?? null,
      videoCallPrice: user?.videoCallPrice ?? null,
    });

    const common = {
      callId: call._id,
      callType: call.callType,
      roomId: call.roomId,
      agoraAppId: config.agora.appId,
      matchType: 'random' as const,
      startedAt: call.startedAt,
    };

    io.to(`user_${callerId}`).emit('random_match_found', {
      ...common,
      agoraToken: call.callerAgoraToken,
      peer: basePeer(receiverObj),
      role: 'caller',
    });

    io.to(`user_${hostId}`).emit('random_match_found', {
      ...common,
      agoraToken: call.receiverAgoraToken,
      peer: basePeer(callerObj),
      role: 'host',
    });

    AppLogger.info(
      `[RandomMatchService: finalizeMatch] Matched caller=${callerId} host=${hostId} callId=${call._id} type=${callType}`
    );
  }
}
