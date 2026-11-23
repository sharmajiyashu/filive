import { Service } from 'typedi';
import mongoose from 'mongoose';
import Container from 'typedi';
import Room from '../../models/Room';
import User from '../../models/User';
import Follow from '../../models/Follow';
import CoinHistory from '../../models/CoinHistory';
import { isHostInRoom } from '../../utils/roomPresence';
import AppLogger from '../../api/loaders/logger';

interface RoomGiftRecord {
  senderId: string;
  amount: number;
  timestamp: number;
}

interface RoomActivityRecord {
  userId: string;
  timestamp: number;
}

export interface PartyRoomScoreBreakdown {
  activeUsersScore: number;       // Max: 30
  giftingScore: number;           // Max: 30
  engagementScore: number;        // Max: 15
  retentionScore: number;         // Max: 10
  hostActivityScore: number;      // Max: 5
  freshnessScore: number;         // Max: 5
  personalizationScore: number;   // Max: 5
  totalScore: number;             // Max: 100
}

interface CachedRankScore {
  score: number;
  breakdown: PartyRoomScoreBreakdown;
  calculatedAt: number;
}

@Service()
export class PartyRoomRankingService {
  // In-memory rolling event logs per channelName
  private recentGifts: Map<string, RoomGiftRecord[]> = new Map();
  private recentComments: Map<string, RoomActivityRecord[]> = new Map();
  private recentJoins: Map<string, RoomActivityRecord[]> = new Map();

  // Cached calculated ranking scores for stability and speed
  private scoreCache: Map<string, CachedRankScore> = new Map();

  private readonly CACHE_TTL_MS = 30 * 1000;            // 30 seconds stability
  private readonly GIFT_WINDOW_MS = 10 * 60 * 1000;     // 10-minute rolling window for gifts
  private readonly ENGAGEMENT_WINDOW_MS = 10 * 60 * 1000;// 10-minute rolling window for chat
  private readonly JOIN_WINDOW_MS = 15 * 60 * 1000;     // 15-minute rolling window for unique joins

  /**
   * Records a gift sent in a party room in the rolling 10-minute window
   */
  public recordGift(channelName: string, senderId: string, amount: number) {
    if (!channelName || !senderId || amount <= 0) return;
    const cleanChannel = channelName.replace(/^(live_)+/, '');
    const now = Date.now();

    const list = this.recentGifts.get(cleanChannel) || [];
    list.push({ senderId, amount, timestamp: now });
    this.recentGifts.set(cleanChannel, list);

    // Invalidate cache immediately on fresh gift so active gifting rooms rise
    this.scoreCache.delete(cleanChannel);
  }

  /**
   * Records a chat comment/reaction in the rolling 10-minute window
   */
  public recordComment(channelName: string, userId: string) {
    if (!channelName || !userId) return;
    const cleanChannel = channelName.replace(/^(live_)+/, '');
    const now = Date.now();

    const list = this.recentComments.get(cleanChannel) || [];
    list.push({ userId, timestamp: now });
    this.recentComments.set(cleanChannel, list);
  }

  /**
   * Records a user joining the room in the rolling window
   */
  public recordJoin(channelName: string, userId: string) {
    if (!channelName || !userId) return;
    const cleanChannel = channelName.replace(/^(live_)+/, '');
    const now = Date.now();

    const list = this.recentJoins.get(cleanChannel) || [];
    list.push({ userId, timestamp: now });
    this.recentJoins.set(cleanChannel, list);
  }

  /**
   * Evaluates Show / Hide rules for a party room (Item 10)
   * Hide if:
   * - Room not live
   * - Host banned / blocked / deleted
   * - Room empty AND host offline and inactive
   */
  public shouldShowRoom(room: any, host: any, io: any): boolean {
    if (!room || room.status !== 'live') return false;

    // Safety checks on host
    if (host) {
      if (host.isBanned || host.isBlocked || host.isDeleted || host.status === 'banned') {
        return false;
      }
    }

    const chName = room.channelName || '';
    const cleanChannel = chName.replace(/^(live_)+/, '');

    const roomSockets = io ? (
      (io.sockets?.adapter?.rooms?.get(`room_${chName}`)?.size || 0) +
      (io.sockets?.adapter?.rooms?.get(`live_${chName}`)?.size || 0) +
      (io.sockets?.adapter?.rooms?.get(chName)?.size || 0) +
      (io.sockets?.adapter?.rooms?.get(`room_${cleanChannel}`)?.size || 0) +
      (io.sockets?.adapter?.rooms?.get(`live_${cleanChannel}`)?.size || 0) +
      (io.sockets?.adapter?.rooms?.get(cleanChannel)?.size || 0)
    ) : 0;

    const seatedCount = (room.seats || []).filter((s: any) => s.userId).length;
    const activeParticipants = Math.max(roomSockets, seatedCount, room.viewerCount || 0);

    const hostIdStr = (host?._id || room.hostId)?._id?.toString() || (host?._id || room.hostId)?.toString();
    const isHostPresent = isHostInRoom(hostIdStr, chName, io);

    // Hide if room is completely empty AND host is offline/inactive
    if (activeParticipants === 0 && !isHostPresent) {
      return false;
    }

    return true;
  }

  /**
   * Calculates the 100-Point Party Room Ranking Score
   */
  public async calculateRoomScore(
    room: any,
    host: any,
    io: any,
    requestingUserId?: string,
    followedHostIds?: Set<string>,
    requestingUserCountry?: string
  ): Promise<{ score: number; breakdown: PartyRoomScoreBreakdown }> {
    const chName = room.channelName || '';
    const cleanChannel = chName.replace(/^(live_)+/, '');
    const now = Date.now();

    // Check cache (per room + user personalization key)
    const cacheKey = `${cleanChannel}_${requestingUserId || 'guest'}`;
    const cached = this.scoreCache.get(cacheKey);
    if (cached && (now - cached.calculatedAt) < this.CACHE_TTL_MS) {
      return { score: cached.score, breakdown: cached.breakdown };
    }

    const hostIdStr = (host?._id || room.hostId)?._id?.toString() || (host?._id || room.hostId)?.toString() || '';

    // ─────────────────────────────────────────────────────────────
    // 1. ACTIVE USERS IN ROOM – 30 POINTS
    // ─────────────────────────────────────────────────────────────
    // Current active participants: 20 points
    const roomSockets = io ? (
      (io.sockets?.adapter?.rooms?.get(`room_${chName}`)?.size || 0) +
      (io.sockets?.adapter?.rooms?.get(`live_${chName}`)?.size || 0) +
      (io.sockets?.adapter?.rooms?.get(chName)?.size || 0) +
      (io.sockets?.adapter?.rooms?.get(`room_${cleanChannel}`)?.size || 0) +
      (io.sockets?.adapter?.rooms?.get(`live_${cleanChannel}`)?.size || 0) +
      (io.sockets?.adapter?.rooms?.get(cleanChannel)?.size || 0)
    ) : 0;
    const seatedCount = (room.seats || []).filter((s: any) => s.userId).length;
    const currentParticipants = Math.max(roomSockets, seatedCount, room.viewerCount || 0);

    let currentUsersPoints = 0;
    if (currentParticipants >= 20) {
      currentUsersPoints = 20;
    } else if (currentParticipants >= 12) {
      currentUsersPoints = 17;
    } else if (currentParticipants >= 7) {
      currentUsersPoints = 14;
    } else if (currentParticipants >= 4) {
      currentUsersPoints = 11;
    } else if (currentParticipants >= 2) {
      currentUsersPoints = 8;
    } else if (currentParticipants === 1) {
      currentUsersPoints = 5;
    }

    // Recent unique users joined: 10 points
    const rawJoins = this.recentJoins.get(cleanChannel) || [];
    const validJoins = rawJoins.filter(j => (now - j.timestamp) <= this.JOIN_WINDOW_MS);
    this.recentJoins.set(cleanChannel, validJoins);

    const uniqueJoinedSet = new Set(validJoins.map(j => j.userId));
    // If room has seated occupants, they are also confirmed unique joiners
    (room.seats || []).forEach((s: any) => {
      const uid = s.userId?._id?.toString() || s.userId?.toString();
      if (uid) uniqueJoinedSet.add(uid);
    });
    const uniqueJoinedCount = uniqueJoinedSet.size;

    let recentJoinsPoints = 0;
    if (uniqueJoinedCount >= 10) {
      recentJoinsPoints = 10;
    } else if (uniqueJoinedCount >= 6) {
      recentJoinsPoints = 8;
    } else if (uniqueJoinedCount >= 3) {
      recentJoinsPoints = 6;
    } else if (uniqueJoinedCount >= 1) {
      recentJoinsPoints = 3;
    }

    const activeUsersScore = Math.min(30, currentUsersPoints + recentJoinsPoints);

    // ─────────────────────────────────────────────────────────────
    // 2. RECENT GIFTING ACTIVITY – 30 POINTS (Rolling 10-Minute Window)
    // ─────────────────────────────────────────────────────────────
    const rawGifts = this.recentGifts.get(cleanChannel) || [];
    let validGifts = rawGifts.filter(g => (now - g.timestamp) <= this.GIFT_WINDOW_MS);

    // Fallback: If in-memory gifts list is empty, query CoinHistory for rolling 10m window
    if (validGifts.length === 0) {
      try {
        const tenMinAgo = new Date(now - this.GIFT_WINDOW_MS);
        const dbGifts = await CoinHistory.find({
          createdAt: { $gte: tenMinAgo },
          type: 'gift_sent',
          $or: [
            { channelName: chName },
            { channelName: cleanChannel },
            { channelName: `party_${room.roomId}` },
            { relatedUserId: hostIdStr }
          ]
        }).select('userId amount createdAt').lean();

        if (dbGifts.length > 0) {
          validGifts = dbGifts.map(g => ({
            senderId: g.userId?.toString() || '',
            amount: Math.abs(g.amount || 0),
            timestamp: new Date(g.createdAt).getTime()
          }));
          this.recentGifts.set(cleanChannel, validGifts);
        }
      } catch (_) {}
    } else {
      this.recentGifts.set(cleanChannel, validGifts);
    }

    const recentGiftsCoinValue = validGifts.reduce((acc, g) => acc + (g.amount || 0), 0);
    const uniqueGiftersCount = new Set(validGifts.map(g => g.senderId).filter(Boolean)).size;
    const giftFrequencyCount = validGifts.length;

    // Recent gifts Coins value: 15 points
    let giftValuePoints = 0;
    if (recentGiftsCoinValue >= 30000) {
      giftValuePoints = 15;
    } else if (recentGiftsCoinValue >= 10000) {
      giftValuePoints = 12;
    } else if (recentGiftsCoinValue >= 2500) {
      giftValuePoints = 9;
    } else if (recentGiftsCoinValue >= 500) {
      giftValuePoints = 6;
    } else if (recentGiftsCoinValue > 0) {
      giftValuePoints = 3;
    }

    // Unique users gifting in the room: 10 points
    let uniqueGiftersPoints = 0;
    if (uniqueGiftersCount >= 4) {
      uniqueGiftersPoints = 10;
    } else if (uniqueGiftersCount >= 3) {
      uniqueGiftersPoints = 8;
    } else if (uniqueGiftersCount >= 2) {
      uniqueGiftersPoints = 6;
    } else if (uniqueGiftersCount === 1) {
      uniqueGiftersPoints = 4;
    }

    // Recent gift frequency: 5 points
    let giftFrequencyPoints = 0;
    if (giftFrequencyCount >= 10) {
      giftFrequencyPoints = 5;
    } else if (giftFrequencyCount >= 6) {
      giftFrequencyPoints = 4;
    } else if (giftFrequencyCount >= 3) {
      giftFrequencyPoints = 3;
    } else if (giftFrequencyCount >= 1) {
      giftFrequencyPoints = 2;
    }

    const giftingScore = Math.min(30, giftValuePoints + uniqueGiftersPoints + giftFrequencyPoints);

    // ─────────────────────────────────────────────────────────────
    // 3. ROOM ENGAGEMENT – 15 POINTS
    // ─────────────────────────────────────────────────────────────
    const rawComments = this.recentComments.get(cleanChannel) || [];
    const validComments = rawComments.filter(c => (now - c.timestamp) <= this.ENGAGEMENT_WINDOW_MS);
    this.recentComments.set(cleanChannel, validComments);

    const userCommentCounts: Record<string, number> = {};
    validComments.forEach(c => {
      userCommentCounts[c.userId] = (userCommentCounts[c.userId] || 0) + 1;
    });

    const uniqueChatParticipants = Object.keys(userCommentCounts).length;

    // Capped messages per user to eliminate spam gaming (max 5 per user)
    const effectiveMessageCount = Object.values(userCommentCounts).reduce(
      (acc, count) => acc + Math.min(count, 5),
      0
    );

    // Unique active chat participants: 5 points
    let chatParticipantsPoints = 0;
    if (uniqueChatParticipants >= 4) {
      chatParticipantsPoints = 5;
    } else if (uniqueChatParticipants >= 2) {
      chatParticipantsPoints = 3.5;
    } else if (uniqueChatParticipants >= 1) {
      chatParticipantsPoints = 2;
    }

    // Recent messages/reactions: 5 points
    let messagesPoints = 0;
    if (effectiveMessageCount >= 12) {
      messagesPoints = 5;
    } else if (effectiveMessageCount >= 6) {
      messagesPoints = 3.5;
    } else if (effectiveMessageCount >= 1) {
      messagesPoints = 2;
    }

    // Room interactions such as mic activity: 5 points
    let micActivityPoints = 0;
    if (seatedCount >= 3) {
      micActivityPoints = 5;
    } else if (seatedCount >= 2) {
      micActivityPoints = 3.5;
    } else if (seatedCount >= 1) {
      micActivityPoints = 2;
    }

    const engagementScore = Math.min(15, chatParticipantsPoints + messagesPoints + micActivityPoints);

    // ─────────────────────────────────────────────────────────────
    // 4. USER RETENTION – 10 POINTS
    // ─────────────────────────────────────────────────────────────
    const startedAt = room.startedAt ? new Date(room.startedAt).getTime() : (room.createdAt ? new Date(room.createdAt).getTime() : now);
    const roomAgeMinutes = Math.max(0, (now - startedAt) / (60 * 1000));

    let retentionScore = 0;
    if (roomAgeMinutes < 3) {
      // Just opened: neutral exploration score
      retentionScore = 6;
    } else if (currentParticipants >= 3 && roomAgeMinutes >= 20) {
      retentionScore = 10;
    } else if (currentParticipants >= 2 && roomAgeMinutes >= 10) {
      retentionScore = 8;
    } else if (currentParticipants >= 1 && roomAgeMinutes >= 5) {
      retentionScore = 6;
    } else if (currentParticipants === 0) {
      retentionScore = 1; // High drop-off / zero stay
    } else {
      retentionScore = 4;
    }

    // ─────────────────────────────────────────────────────────────
    // 5. HOST ACTIVITY – 5 POINTS
    // ─────────────────────────────────────────────────────────────
    const isHostPresentInRoom = isHostInRoom(hostIdStr, chName, io);
    const isHostOnSeat = (room.seats || []).some(
      (s: any) => (s.userId?._id?.toString() || s.userId?.toString()) === hostIdStr
    );

    let hostActivityScore = 0;
    if (isHostPresentInRoom && isHostOnSeat) {
      hostActivityScore = 5;
    } else if (isHostPresentInRoom) {
      hostActivityScore = 4;
    } else if (host?.isOnline) {
      hostActivityScore = 2;
    } else {
      hostActivityScore = 0;
    }

    // ─────────────────────────────────────────────────────────────
    // 6. ROOM FRESHNESS – 5 POINTS (Exploration slot / new rooms)
    // ─────────────────────────────────────────────────────────────
    let freshnessScore = 0;
    if (roomAgeMinutes <= 20) {
      freshnessScore = 5;
    } else if (roomAgeMinutes <= 45) {
      freshnessScore = 3.5;
    } else if (roomAgeMinutes <= 90) {
      freshnessScore = 2;
    } else {
      freshnessScore = 1;
    }

    // ─────────────────────────────────────────────────────────────
    // 7. USER PERSONALIZATION – 5 POINTS
    // ─────────────────────────────────────────────────────────────
    let personalizationScore = 0;
    if (requestingUserId) {
      const isFollowing = followedHostIds && hostIdStr ? followedHostIds.has(hostIdStr) : false;
      if (isFollowing) {
        personalizationScore += 3;
      }
      const hostCountry = (host?.country || (host?.countryId as any)?.code || (host?.countryId as any)?.name || '').toString().toLowerCase();
      if (requestingUserCountry && hostCountry && hostCountry === requestingUserCountry.toLowerCase()) {
        personalizationScore += 2;
      }
    }
    personalizationScore = Math.min(5, personalizationScore);

    // ─────────────────────────────────────────────────────────────
    // TOTAL RANKING SCORE (0 – 100 POINTS)
    // ─────────────────────────────────────────────────────────────
    const rawTotal = (
      activeUsersScore +
      giftingScore +
      engagementScore +
      retentionScore +
      hostActivityScore +
      freshnessScore +
      personalizationScore
    );
    const totalScore = Math.min(100, Math.max(0, Number(rawTotal.toFixed(1))));

    const breakdown: PartyRoomScoreBreakdown = {
      activeUsersScore: Number(activeUsersScore.toFixed(1)),
      giftingScore: Number(giftingScore.toFixed(1)),
      engagementScore: Number(engagementScore.toFixed(1)),
      retentionScore: Number(retentionScore.toFixed(1)),
      hostActivityScore: Number(hostActivityScore.toFixed(1)),
      freshnessScore: Number(freshnessScore.toFixed(1)),
      personalizationScore: Number(personalizationScore.toFixed(1)),
      totalScore
    };

    // Cache result
    this.scoreCache.set(cacheKey, {
      score: totalScore,
      breakdown,
      calculatedAt: now
    });

    return { score: totalScore, breakdown };
  }
}
