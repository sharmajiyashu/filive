import { Service } from 'typedi';
import mongoose from 'mongoose';
import User from '../../models/User';
import Call from '../../models/Call';
import Room from '../../models/Room';
import Block from '../../models/Block';
import Report from '../../models/Report';
import AppSetting from '../../models/AppSetting';
import HostFeedMetric from '../../models/HostFeedMetric';
import HostImpression from '../../models/HostImpression';
import Container from 'typedi';
import { attachUserCountryAndAge } from '../../utils/userLookup';
import AppLogger from '../../api/loaders/logger';

export interface HostRankingConfig {
  weightPerformance: number; // default: 25%
  weightAnswerRate: number; // default: 20%
  weightEngagement: number; // default: 15%
  weightAvailability: number; // default: 15%
  weightDuration: number; // default: 10%
  weightUniqueCallers: number; // default: 10%
  weightCompliance: number; // default: 5%
  newHostPromotionDays: number; // default: 7 days
  explorationSlotPercent: number; // default: 15%
  minCallsSmoothingThreshold: number; // default: 5 calls
  meetRequireSameCountry: boolean; // default: true
}

const DEFAULT_CONFIG: HostRankingConfig = {
  weightPerformance: 25,
  weightAnswerRate: 20,
  weightEngagement: 15,
  weightAvailability: 15,
  weightDuration: 10,
  weightUniqueCallers: 10,
  weightCompliance: 5,
  newHostPromotionDays: 7,
  explorationSlotPercent: 15,
  minCallsSmoothingThreshold: 5,
  meetRequireSameCountry: true,
};

@Service()
export class HostFeedService {
  /**
   * Retrieves host ranking configuration from AppSetting or defaults.
   */
  public async getConfig(): Promise<HostRankingConfig> {
    try {
      const setting = await AppSetting.findOne({ key: 'host_ranking_config' }).lean();
      if (setting && setting.value) {
        const val = typeof setting.value === 'string' ? JSON.parse(setting.value) : setting.value;
        return { ...DEFAULT_CONFIG, ...val };
      }
    } catch (_) {}
    return { ...DEFAULT_CONFIG };
  }

  /**
   * Updates host ranking configuration in AppSetting (Admin).
   */
  public async updateConfig(newConfig: Partial<HostRankingConfig>): Promise<HostRankingConfig> {
    const current = await this.getConfig();
    const updated = { ...current, ...newConfig };
    await AppSetting.findOneAndUpdate(
      { key: 'host_ranking_config' },
      { key: 'host_ranking_config', value: updated, description: 'Configurable host ranking weights and thresholds' },
      { upsert: true, new: true }
    );
    return updated;
  }

  /**
   * Calculates the 100-point call ranking score for a host using the 7 weighted components:
   * 1. Recent successful call performance (25%)
   * 2. Answer / acceptance rate (20%)
   * 3. Last 7 days genuine engagement (15%)
   * 4. Recent availability (15%)
   * 5. Completed call duration and experience (10%)
   * 6. Unique caller interest (10%)
   * 7. Reliability and policy compliance (5%)
   */
  public async calculateHostScore(hostId: string | mongoose.Types.ObjectId): Promise<number> {
    const config = await this.getConfig();
    const hId = typeof hostId === 'string' ? new mongoose.Types.ObjectId(hostId) : hostId;

    const host = await User.findById(hId)
      .select('userId name enableVoiceCall enableVideoCall countryCode newHostEligibleAt lastLoginAt createdAt videoVerificationStatus')
      .lean();

    if (!host) return 50;

    const now = Date.now();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const twentyEightDaysAgo = new Date(now - 28 * 24 * 60 * 60 * 1000);

    const [calls7d, calls28d, reports28d] = await Promise.all([
      Call.find({ receiverId: hId, createdAt: { $gte: sevenDaysAgo } }).select('status duration callerId createdAt').lean(),
      Call.find({ receiverId: hId, createdAt: { $gte: twentyEightDaysAgo } }).select('status duration').lean(),
      Report.countDocuments({ reportedUserId: hId, createdAt: { $gte: twentyEightDaysAgo } }),
    ]);

    const callAttempts7d = calls7d.length;
    const acceptedCalls7d = calls7d.filter((c: any) => c.status === 'accepted' || c.status === 'ended').length;
    const completedCalls7d = calls7d.filter((c: any) => c.status === 'ended' && (c.duration || 0) >= 10).length;
    const missedCalls7d = calls7d.filter((c: any) => c.status === 'missed').length;
    const totalDurationSeconds7d = calls7d
      .filter((c: any) => c.status === 'ended')
      .reduce((acc: number, c: any) => acc + (c.duration || 0), 0);

    const uniqueCallersSet = new Set(calls7d.map((c: any) => c.callerId?.toString()).filter(Boolean));
    const uniqueCallers7d = uniqueCallersSet.size;

    const callAttempts28d = calls28d.length;
    const completedCalls28d = calls28d.filter((c: any) => c.status === 'ended' && (c.duration || 0) >= 10).length;

    // Component 1: Recent successful call performance (25%)
    // Bayesian smoothing: (completed + 2) / (attempts + 3)
    const perfRatio = (completedCalls7d + 2) / (callAttempts7d + 3);
    const callPerformanceScore = Math.min(100, Math.max(0, Number((perfRatio * 100).toFixed(2))));

    // Component 2: Answer / acceptance rate (20%)
    // Bayesian smoothing: (accepted + 2) / (attempts + 3)
    const ansRatio = (acceptedCalls7d + 2) / (callAttempts7d + 3);
    const answerRateScore = Math.min(100, Math.max(0, Number((ansRatio * 100).toFixed(2))));

    // Component 3: Last 7 days genuine engagement (15%)
    // Derived from active call sessions and unique callers
    const engagementBaseline = Math.min(100, (uniqueCallers7d * 8) + (completedCalls7d * 4));
    const engagementScore = Math.min(100, Math.max(30, Number(engagementBaseline.toFixed(2))));

    // Component 4: Recent availability (15%)
    let availabilityScore = 30;
    if (host.lastLoginAt) {
      const msSinceLogin = now - new Date(host.lastLoginAt).getTime();
      const minsSinceLogin = msSinceLogin / (60 * 1000);
      if (minsSinceLogin <= 15) availabilityScore = 100;
      else if (minsSinceLogin <= 60) availabilityScore = 85;
      else if (minsSinceLogin <= 360) availabilityScore = 65;
      else if (minsSinceLogin <= 1440) availabilityScore = 45;
      else if (minsSinceLogin <= 4320) availabilityScore = 25;
      else availabilityScore = 10;
    }

    // Component 5: Completed call duration and experience (10%)
    // Target average duration: 180 seconds (3 mins) for 100 score
    const avgDuration = completedCalls7d > 0 ? totalDurationSeconds7d / completedCalls7d : 45;
    const durationScore = Math.min(100, Math.max(10, Number(((avgDuration / 180) * 100).toFixed(2))));

    // Component 6: Unique caller interest (10%)
    // 10+ unique callers in 7 days = 100 score
    const uniqueCallersScore = Math.min(100, Math.max(20, uniqueCallers7d * 10));

    // Component 7: Reliability and policy compliance (5%)
    // 100 minus penalty for reports (-15 each) and high missed calls
    const missedPenalty = callAttempts7d > 3 && (missedCalls7d / callAttempts7d > 0.4) ? 20 : 0;
    const complianceScore = Math.min(100, Math.max(0, 100 - (reports28d * 15) - missedPenalty));

    // Weighted composite calculation
    const totalWeight =
      config.weightPerformance +
      config.weightAnswerRate +
      config.weightEngagement +
      config.weightAvailability +
      config.weightDuration +
      config.weightUniqueCallers +
      config.weightCompliance;

    const weightedScore =
      (callPerformanceScore * config.weightPerformance +
        answerRateScore * config.weightAnswerRate +
        engagementScore * config.weightEngagement +
        availabilityScore * config.weightAvailability +
        durationScore * config.weightDuration +
        uniqueCallersScore * config.weightUniqueCallers +
        complianceScore * config.weightCompliance) /
      (totalWeight || 100);

    const callRankingScore = Math.min(100, Math.max(0, Number(weightedScore.toFixed(2))));

    // Calculate New Host Promotion Decay (Days 1–7 from newHostEligibleAt)
    let newHostBoost = 0;
    const eligibleAt = host.newHostEligibleAt || host.createdAt;
    if (eligibleAt) {
      const daysSinceEligible = (now - new Date(eligibleAt).getTime()) / (24 * 60 * 60 * 1000);
      if (daysSinceEligible >= 0 && daysSinceEligible <= config.newHostPromotionDays) {
        newHostBoost = Math.max(0, Number((100 * (1 - daysSinceEligible / config.newHostPromotionDays)).toFixed(2)));
      }
    }

    // Persist to HostFeedMetric and cache score on User
    await Promise.all([
      HostFeedMetric.findOneAndUpdate(
        { hostId: hId },
        {
          hostId: hId,
          callRankingScore,
          callPerformanceScore,
          answerRateScore,
          engagementScore,
          availabilityScore,
          durationScore,
          uniqueCallersScore,
          complianceScore,
          callAttempts7d,
          acceptedCalls7d,
          completedCalls7d,
          missedCalls7d,
          totalDurationSeconds7d,
          uniqueCallers7d,
          callAttempts28d,
          completedCalls28d,
          reports28d,
          newHostEligibleAt: eligibleAt,
          newHostBoost,
          lastCalculatedAt: new Date(),
        },
        { upsert: true, new: true }
      ),
      User.findByIdAndUpdate(hId, {
        callRankingScore,
        ...(eligibleAt && !host.newHostEligibleAt ? { newHostEligibleAt: eligibleAt } : {}),
      }),
    ]);

    return callRankingScore;
  }

  /**
   * Resolves online, busy, and live state for a batch of hosts in near real-time.
   */
  public async resolveHostStates(hostObjectIds: mongoose.Types.ObjectId[]) {
    const ringTimeout = new Date(Date.now() - 45 * 1000);
    const staleAcceptedTimeout = new Date(Date.now() - 4 * 60 * 60 * 1000);

    const [activeCalls, activeRooms] = await Promise.all([
      Call.find({
        $or: [
          { callerId: { $in: hostObjectIds }, status: 'accepted', createdAt: { $gte: staleAcceptedTimeout } },
          { receiverId: { $in: hostObjectIds }, status: 'accepted', createdAt: { $gte: staleAcceptedTimeout } },
          { callerId: { $in: hostObjectIds }, status: 'initiated', createdAt: { $gte: ringTimeout } },
          { receiverId: { $in: hostObjectIds }, status: 'initiated', createdAt: { $gte: ringTimeout } },
        ],
      }).select('callerId receiverId status'),
      Room.find({
        hostId: { $in: hostObjectIds },
        status: 'live',
      }).select('hostId status'),
    ]);

    const busySet = new Set<string>();
    const liveSet = new Set<string>();

    activeCalls.forEach((c: any) => {
      if (c.callerId) busySet.add(c.callerId.toString());
      if (c.receiverId) busySet.add(c.receiverId.toString());
    });

    activeRooms.forEach((r: any) => {
      if (r.hostId) liveSet.add(r.hostId.toString());
    });

    let io: any;
    try {
      io = Container.get('socket');
    } catch (_) {}

    return { busySet, liveSet, io };
  }

  /**
   * MEET FEED:
   * - Host must have enableVideoCall = true
   * - Must match caller's country: host.country_code == caller.country_code
   * - Host account active, videoVerification approved, not blocked/banned
   * - Ranked using the 100-point call ranking score with exploration slots
   */
  public async getMeetFeed(params: {
    callerId: string;
    page: number;
    limit: number;
    countryCode?: string;
  }) {
    return this.getCallFeed({
      ...params,
      callType: 'video',
      feedType: 'meet',
    });
  }

  /**
   * TALK FEED:
   * - Same as Meet, but require audio_call_enabled = true (enableVoiceCall = true)
   * - Never include hosts without audio-call eligibility
   * - Ranked using the 100-point call ranking score
   */
  public async getTalkFeed(params: {
    callerId: string;
    page: number;
    limit: number;
    countryCode?: string;
  }) {
    return this.getCallFeed({
      ...params,
      callType: 'voice',
      feedType: 'talk',
    });
  }

  /**
   * Internal reusable engine for Meet & Talk call discovery feeds
   */
  private async getCallFeed(params: {
    callerId: string;
    page: number;
    limit: number;
    callType: 'voice' | 'video';
    countryCode?: string;
    feedType: 'meet' | 'talk';
  }) {
    const { callerId, page = 1, limit = 10, callType, feedType } = params;
    const config = await this.getConfig();

    // 1. Resolve caller details
    const caller = await User.findById(callerId).select('countryCode').lean();
    const effectiveCountry = (params.countryCode || caller?.countryCode || '').trim();

    // 2. Resolve blocked users
    const blockedRelations = await Block.find({
      $or: [{ blockerId: callerId }, { blockedId: callerId }],
    }).select('blockerId blockedId');

    const excludedIds = blockedRelations.map((rel: any) =>
      rel.blockerId.toString() === callerId ? rel.blockedId : rel.blockerId
    );
    excludedIds.push(new mongoose.Types.ObjectId(callerId));

    // 3. Base eligibility query
    const baseQuery: any = {
      _id: { $nin: excludedIds },
      userRole: 'user',
      gender: { $regex: /^female$/i },
      videoVerificationStatus: 'approved',
      isBlocked: false,
      isDeleted: { $ne: true },
    };

    if (callType === 'voice') {
      baseQuery.enableVoiceCall = true;
    } else {
      baseQuery.enableVideoCall = true;
    }

    // Country match constraint: host.country_code == caller.country_code
    if (effectiveCountry) {
      baseQuery.$or = [
        { countryCode: { $regex: new RegExp(`^${effectiveCountry}$`, 'i') } },
        { country: { $regex: new RegExp(`^${effectiveCountry}$`, 'i') } },
      ];
    }

    const totalMatching = await User.countDocuments(baseQuery);

    // If same country yielded fewer hosts than limit, allow expanded national/global top-tier discovery
    let queryToExecute = baseQuery;
    if (totalMatching === 0 && effectiveCountry) {
      const fallbackQuery = { ...baseQuery };
      delete fallbackQuery.$or;
      queryToExecute = fallbackQuery;
    }

    const skip = (page - 1) * limit;

    // Exploration slot allocation: Reserve ~15% slots for new/underexposed eligible hosts
    const explorationCount = Math.max(1, Math.round((limit * config.explorationSlotPercent) / 100));
    const mainCount = limit - explorationCount;

    // Fetch top scored hosts
    const topHosts = await User.find(queryToExecute)
      .select('userId name profileImage email bio isPremium gender country countryId countryCode enableVoiceCall enableVideoCall voiceCallPrice videoCallPrice audioCallChargePerMinute videoCallChargePerMinute dob lastLoginAt createdAt callRankingScore newHostEligibleAt')
      .populate('profileImage')
      .populate('countryId')
      .sort({ callRankingScore: -1, lastLoginAt: -1 })
      .skip(skip)
      .limit(mainCount)
      .lean();

    // Fetch exploration hosts (new hosts or underexposed with high potential)
    const existingIds = new Set(topHosts.map((h: any) => h._id.toString()));
    const explorationQuery = {
      ...queryToExecute,
      _id: { $nin: [...excludedIds, ...Array.from(existingIds).map(id => new mongoose.Types.ObjectId(id))] },
      newHostEligibleAt: { $gte: new Date(Date.now() - config.newHostPromotionDays * 24 * 60 * 60 * 1000) },
    };

    const explorationHosts = await User.find(explorationQuery)
      .select('userId name profileImage email bio isPremium gender country countryId countryCode enableVoiceCall enableVideoCall voiceCallPrice videoCallPrice audioCallChargePerMinute videoCallChargePerMinute dob lastLoginAt createdAt callRankingScore newHostEligibleAt')
      .populate('profileImage')
      .populate('countryId')
      .sort({ createdAt: -1 })
      .limit(explorationCount)
      .lean();

    // Combine without duplicate cards
    const combined = [...topHosts];
    for (const exp of explorationHosts) {
      if (!existingIds.has(exp._id.toString()) && combined.length < limit) {
        combined.push(exp);
        existingIds.add(exp._id.toString());
      }
    }

    // Controlled tie-breaker shuffle for similarly scored hosts (within 3 points)
    const shuffled = this.applyTieBreakerShuffle(combined);

    // Resolve near real-time live, busy, and online states
    const hostIds = shuffled.map((h: any) => h._id);
    const { busySet, liveSet, io } = await this.resolveHostStates(hostIds);

    const formatted = await Promise.all(
      shuffled.map(async (h: any, index: number) => {
        const hostId = h._id.toString();
        const socketOnline = io ? (io.sockets?.adapter?.rooms?.get(`user_${hostId}`)?.size || 0) > 0 : false;
        const recentLogin = h.lastLoginAt ? new Date(h.lastLoginAt).getTime() > Date.now() - 15 * 60 * 1000 : false;
        const isOnline = socketOnline || recentLogin;
        const isBusy = busySet.has(hostId);
        const isLive = liveSet.has(hostId);
        const status = isBusy ? 'busy' : (isLive ? 'live' : (isOnline ? 'online' : 'offline'));

        const voiceCallPrice = Number(h.voiceCallPrice || h.audioCallChargePerMinute || 0);
        const videoCallPrice = Number(h.videoCallPrice || h.videoCallChargePerMinute || 0);

        // Asynchronously log impression
        this.logImpressionAsync(h._id, callerId, feedType, skip + index + 1, effectiveCountry);

        return attachUserCountryAndAge({
          ...h,
          isOnline,
          isBusy,
          isLive,
          status,
          voiceCallPrice,
          videoCallPrice,
          audioCallChargePerMinute: voiceCallPrice,
          videoCallChargePerMinute: videoCallPrice,
          rankingScore: h.callRankingScore || 50,
        });
      })
    );

    const totalCount = await User.countDocuments(queryToExecute);

    return {
      hosts: formatted,
      data: formatted,
      users: formatted,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit) || 1,
        hasMore: page * limit < totalCount,
      },
      total: totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit) || 1,
    };
  }

  /**
   * POPULAR FEED:
   * - Global host discovery across all countries
   * - Rank using recent genuine engagement, unique profile interest, activity and reliability
   * - Do not rank solely by lifetime views, coins or earnings
   */
  public async getPopularFeed(params: {
    callerId?: string;
    page: number;
    limit: number;
    countryCode?: string;
  }) {
    const { callerId, page = 1, limit = 10, countryCode } = params;

    let excludedIds: any[] = [];
    if (callerId) {
      const blocked = await Block.find({
        $or: [{ blockerId: callerId }, { blockedId: callerId }],
      }).select('blockerId blockedId');
      excludedIds = blocked.map((b: any) =>
        b.blockerId.toString() === callerId ? b.blockedId : b.blockerId
      );
      excludedIds.push(new mongoose.Types.ObjectId(callerId));
    }

    const query: any = {
      _id: { $nin: excludedIds },
      userRole: 'user',
      gender: { $regex: /^female$/i },
      videoVerificationStatus: 'approved',
      isBlocked: false,
      isDeleted: { $ne: true },
      $or: [{ enableVoiceCall: true }, { enableVideoCall: true }],
    };

    if (countryCode && countryCode.trim() !== '') {
      query.$and = [
        {
          $or: [
            { countryCode: { $regex: new RegExp(`^${countryCode.trim()}$`, 'i') } },
            { country: { $regex: new RegExp(`^${countryCode.trim()}$`, 'i') } },
          ],
        },
      ];
    }

    const total = await User.countDocuments(query);
    const skip = (page - 1) * limit;

    // Multi-factor popularity rank: Call score (40%) + Recency of login (35%) + Level/Profile engagement (25%)
    const hosts = await User.find(query)
      .select('userId name profileImage email bio isPremium gender country countryId countryCode enableVoiceCall enableVideoCall voiceCallPrice videoCallPrice audioCallChargePerMinute videoCallChargePerMinute dob lastLoginAt createdAt callRankingScore beans wealthCoins charmCoins')
      .populate('profileImage')
      .populate('countryId')
      .sort({ callRankingScore: -1, lastLoginAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const hostIds = hosts.map((h: any) => h._id);
    const { busySet, liveSet, io } = await this.resolveHostStates(hostIds);

    const formatted = await Promise.all(
      hosts.map(async (h: any, index: number) => {
        const hostId = h._id.toString();
        const socketOnline = io ? (io.sockets?.adapter?.rooms?.get(`user_${hostId}`)?.size || 0) > 0 : false;
        const recentLogin = h.lastLoginAt ? new Date(h.lastLoginAt).getTime() > Date.now() - 15 * 60 * 1000 : false;
        const isOnline = socketOnline || recentLogin;
        const isBusy = busySet.has(hostId);
        const isLive = liveSet.has(hostId);
        const status = isBusy ? 'busy' : (isLive ? 'live' : (isOnline ? 'online' : 'offline'));

        if (callerId) {
          this.logImpressionAsync(h._id, callerId, 'popular', skip + index + 1, h.countryCode);
        }

        return attachUserCountryAndAge({
          ...h,
          isOnline,
          isBusy,
          isLive,
          status,
          rankingScore: h.callRankingScore || 50,
        });
      })
    );

    return {
      users: formatted,
      hosts: formatted,
      data: formatted,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
        hasMore: page * limit < total,
      },
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * NEW FEED:
   * - Promote eligible hosts for the first 7 days from "new_host_eligible_at"
   * - Video-only hosts eligible for video discovery
   * - Audio-only hosts eligible for audio discovery
   * - Hosts with both options enabled can be discovered through both call types
   * - Hosts with both options disabled are ineligible
   * - Apply a gradual promotion decay over Days 1–7
   * - Do not reset the promotion period on reinstall or profile edits
   */
  public async getNewFeed(params: {
    callerId?: string;
    page: number;
    limit: number;
    callType?: 'voice' | 'video' | 'both';
    countryCode?: string;
  }) {
    const { callerId, page = 1, limit = 10, callType = 'both', countryCode } = params;
    const config = await this.getConfig();

    const now = Date.now();
    const promotionCutoff = new Date(now - config.newHostPromotionDays * 24 * 60 * 60 * 1000);

    let excludedIds: any[] = [];
    if (callerId) {
      const blocked = await Block.find({
        $or: [{ blockerId: callerId }, { blockedId: callerId }],
      }).select('blockerId blockedId');
      excludedIds = blocked.map((b: any) =>
        b.blockerId.toString() === callerId ? b.blockedId : b.blockerId
      );
      excludedIds.push(new mongoose.Types.ObjectId(callerId));
    }

    const query: any = {
      _id: { $nin: excludedIds },
      userRole: 'user',
      gender: { $regex: /^female$/i },
      videoVerificationStatus: 'approved',
      isBlocked: false,
      isDeleted: { $ne: true },
      // First 7 days from newHostEligibleAt (fallback to createdAt if not set)
      $or: [
        { newHostEligibleAt: { $gte: promotionCutoff } },
        { newHostEligibleAt: { $exists: false }, createdAt: { $gte: promotionCutoff } },
      ],
    };

    // Call eligibility filtering
    if (callType === 'voice') {
      query.enableVoiceCall = true;
    } else if (callType === 'video') {
      query.enableVideoCall = true;
    } else {
      query.$and = [
        {
          $or: [{ enableVoiceCall: true }, { enableVideoCall: true }],
        },
      ];
    }

    if (countryCode && countryCode.trim() !== '') {
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { countryCode: { $regex: new RegExp(`^${countryCode.trim()}$`, 'i') } },
          { country: { $regex: new RegExp(`^${countryCode.trim()}$`, 'i') } },
        ],
      });
    }

    const total = await User.countDocuments(query);
    const skip = (page - 1) * limit;

    // Fetch and sort with Days 1-7 decay boost
    const rawHosts = await User.find(query)
      .select('userId name profileImage email bio isPremium gender country countryId countryCode enableVoiceCall enableVideoCall voiceCallPrice videoCallPrice audioCallChargePerMinute videoCallChargePerMinute dob lastLoginAt createdAt newHostEligibleAt callRankingScore')
      .populate('profileImage')
      .populate('countryId')
      .skip(skip)
      .limit(limit * 2) // Over-fetch to sort by decayed boost
      .lean();

    // Compute decayed promotion boost score: Day 1 highest, decaying to Day 7
    const scoredHosts = rawHosts.map((h: any) => {
      const eligibleTime = new Date(h.newHostEligibleAt || h.createdAt).getTime();
      const daysSince = Math.max(0, (now - eligibleTime) / (24 * 60 * 60 * 1000));
      const decayFactor = Math.max(0, 1 - daysSince / config.newHostPromotionDays);
      const compositeNewScore = (decayFactor * 60) + ((h.callRankingScore || 50) * 0.4);
      return { ...h, compositeNewScore, daysSinceNew: Math.floor(daysSince) + 1 };
    });

    scoredHosts.sort((a, b) => b.compositeNewScore - a.compositeNewScore);
    const pageItems = scoredHosts.slice(0, limit);

    const hostIds = pageItems.map((h: any) => h._id);
    const { busySet, liveSet, io } = await this.resolveHostStates(hostIds);

    const formatted = await Promise.all(
      pageItems.map(async (h: any, index: number) => {
        const hostId = h._id.toString();
        const socketOnline = io ? (io.sockets?.adapter?.rooms?.get(`user_${hostId}`)?.size || 0) > 0 : false;
        const recentLogin = h.lastLoginAt ? new Date(h.lastLoginAt).getTime() > Date.now() - 15 * 60 * 1000 : false;
        const isOnline = socketOnline || recentLogin;
        const isBusy = busySet.has(hostId);
        const isLive = liveSet.has(hostId);
        const status = isBusy ? 'busy' : (isLive ? 'live' : (isOnline ? 'online' : 'offline'));

        if (callerId) {
          this.logImpressionAsync(h._id, callerId, 'new', skip + index + 1, h.countryCode);
        }

        return attachUserCountryAndAge({
          ...h,
          isOnline,
          isBusy,
          isLive,
          status,
          isNewHost: true,
          promotionDay: h.daysSinceNew,
        });
      })
    );

    return {
      hosts: formatted,
      data: formatted,
      users: formatted,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
        hasMore: page * limit < total,
      },
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * LIVE FEED:
   * - Host must be actively live and stream healthy
   * - Remove host from Live feed immediately after going offline
   * - Rank using live engagement, stream quality, recent activity and exploration fairness
   */
  public async getLiveFeed(params: {
    callerId?: string;
    page: number;
    limit: number;
    countryCode?: string;
  }) {
    const { callerId, page = 1, limit = 10, countryCode } = params;

    let excludedIds: any[] = [];
    if (callerId) {
      const blocked = await Block.find({
        $or: [{ blockerId: callerId }, { blockedId: callerId }],
      }).select('blockerId blockedId');
      excludedIds = blocked.map((b: any) =>
        b.blockerId.toString() === callerId ? b.blockedId : b.blockerId
      );
    }

    const query: any = {
      status: 'live',
      roomType: 'livestream',
      ...(excludedIds.length > 0 ? { hostId: { $nin: excludedIds } } : {}),
    };

    let io: any;
    try {
      io = Container.get('socket');
    } catch (_) {}

    // Fetch active rooms
    const activeRooms = await Room.find(query)
      .populate({
        path: 'hostId',
        select: 'userId name profileImage country countryCode gender videoVerificationStatus isBlocked isDeleted lastLoginAt',
        populate: { path: 'profileImage' },
      })
      .populate('roomPhoto')
      .sort({ viewerCount: -1, totalGiftRevenue: -1, createdAt: -1 })
      .lean();

    // Filter strictly healthy streams: host not blocked/deleted, approved video verification, and immediately remove offline
    const healthyRooms = activeRooms.filter((r: any) => {
      const host = r.hostId;
      if (!host || host.isBlocked || host.isDeleted || host.videoVerificationStatus !== 'approved') {
        return false;
      }

      // Country filter if applied
      if (countryCode && countryCode.trim() !== '') {
        const matches =
          (host.countryCode && host.countryCode.toLowerCase() === countryCode.trim().toLowerCase()) ||
          (host.country && host.country.toLowerCase() === countryCode.trim().toLowerCase());
        if (!matches) return false;
      }

      // Check stream health / socket connectivity
      if (io) {
        const roomSockets = io.sockets?.adapter?.rooms?.get(r.channelName)?.size || 0;
        const hostSocket = io.sockets?.adapter?.rooms?.get(`user_${host._id}`)?.size || 0;
        // If neither room socket nor host socket has been active and stream is older than 2 minutes, prune
        if (roomSockets === 0 && hostSocket === 0 && (Date.now() - new Date(r.createdAt).getTime() > 120 * 1000)) {
          // Immediately mark room as ended
          Room.findByIdAndUpdate(r._id, { status: 'ended', endedAt: new Date() }).exec().catch(() => {});
          return false;
        }
      }

      return true;
    });

    // Rank using live engagement (viewers, gifts, comments) + exploration fairness
    healthyRooms.sort((a: any, b: any) => {
      const scoreA = (a.viewerCount || 0) * 3 + ((a.totalGiftRevenue || 0) / 100) * 2 + (a.commentCount || 0);
      const scoreB = (b.viewerCount || 0) * 3 + ((b.totalGiftRevenue || 0) / 100) * 2 + (b.commentCount || 0);
      return scoreB - scoreA;
    });

    const total = healthyRooms.length;
    const skip = (page - 1) * limit;
    const pagedRooms = healthyRooms.slice(skip, skip + limit);

    const formatted = await Promise.all(
      pagedRooms.map(async (r: any, index: number) => {
        if (callerId && r.hostId?._id) {
          this.logImpressionAsync(r.hostId._id, callerId, 'live', skip + index + 1, r.hostId.countryCode);
        }
        return r;
      })
    );

    return {
      streams: formatted,
      data: formatted,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
        hasMore: page * limit < total,
      },
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Applies a controlled shuffle or small random tie-breaker for similarly scored hosts (within 3 points).
   */
  private applyTieBreakerShuffle(items: any[]): any[] {
    if (items.length <= 1) return items;
    const result = [...items];
    for (let i = 0; i < result.length - 1; i++) {
      const scoreCurrent = result[i].callRankingScore || 50;
      const scoreNext = result[i + 1].callRankingScore || 50;
      if (Math.abs(scoreCurrent - scoreNext) <= 3) {
        if (Math.random() > 0.5) {
          const temp = result[i];
          result[i] = result[i + 1];
          result[i + 1] = temp;
        }
      }
    }
    return result;
  }

  /**
   * Asynchronously logs an impression for feed conversion and host fairness analytics.
   */
  private logImpressionAsync(
    hostId: mongoose.Types.ObjectId,
    userId: string,
    feedType: 'live' | 'popular' | 'meet' | 'talk' | 'new',
    rankingPosition: number,
    countryCode?: string
  ) {
    setImmediate(async () => {
      try {
        await HostImpression.create({
          hostId,
          userId: userId ? new mongoose.Types.ObjectId(userId) : undefined,
          feedType,
          rankingPosition,
          countryCode,
        });
      } catch (_) {}
    });
  }

  /**
   * Background batch recalculation for all active approved hosts.
   */
  public async recalculateAllHostScores(): Promise<{ count: number }> {
    const hosts = await User.find({
      userRole: 'user',
      gender: { $regex: /^female$/i },
      videoVerificationStatus: 'approved',
      isBlocked: false,
      isDeleted: { $ne: true },
    })
      .select('_id')
      .lean();

    AppLogger.info(`🔄 Recalculating host ranking scores for ${hosts.length} approved hosts...`);
    let count = 0;
    for (const h of hosts) {
      try {
        await this.calculateHostScore(h._id);
        count++;
      } catch (e) {
        AppLogger.error(`Error calculating score for host ${h._id}:`, e);
      }
    }
    AppLogger.info(`✅ Finished recalculating ${count} host ranking scores.`);
    return { count };
  }
}
