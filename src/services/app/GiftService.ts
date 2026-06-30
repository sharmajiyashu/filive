import { Service } from 'typedi';
import mongoose from 'mongoose';
import Gift from '../../models/Gift';
import GiftType from '../../models/GiftType';
import User from '../../models/User';
import CoinHistory from '../../models/CoinHistory';
import LiveStream from '../../models/LiveStream';
import AppLogger from '../../api/loaders/logger';

@Service()
export class GiftService {
  constructor() {}

  // ----------------------------------------------------
  // ADMIN APIS
  // ----------------------------------------------------

  public async createGift(data: {
    name: string;
    type: string;
    price: number;
    media: string;
  }) {
    AppLogger.info(`[GiftService: createGift] Creating gift: ${data.name}`);
    return await Gift.create({
      name: data.name,
      type: new mongoose.Types.ObjectId(data.type),
      price: data.price,
      media: new mongoose.Types.ObjectId(data.media),
      isActive: true,
    });
  }

  public async updateGift(id: string, data: any) {
    AppLogger.info(`[GiftService: updateGift] Updating gift ID: ${id}`);
    if (data.media) {
      data.media = new mongoose.Types.ObjectId(data.media);
    }
    if (data.type) {
      data.type = new mongoose.Types.ObjectId(data.type);
    }
    const gift = await Gift.findByIdAndUpdate(id, data, { new: true });
    if (!gift) throw new Error('Gift not found');
    return gift;
  }

  public async getAdminGifts(page: number = 1, limit: number = 20, type?: string) {
    const skip = (page - 1) * limit;
    const query: any = {};
    if (type) {
      query.type = new mongoose.Types.ObjectId(type);
    }
    const gifts = await Gift.find(query)
      .populate('media')
      .populate('type')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await Gift.countDocuments(query);
    return {
      data: gifts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  public async deleteGift(id: string) {
    AppLogger.info(`[GiftService: deleteGift] Deleting gift ID: ${id}`);
    const gift = await Gift.findByIdAndDelete(id);
    if (!gift) throw new Error('Gift not found');
    return true;
  }

  // ----------------------------------------------------
  // APP APIS
  // ----------------------------------------------------

  public async getActiveGifts(type?: string) {
    const query: any = { isActive: true };
    if (type) {
      query.type = new mongoose.Types.ObjectId(type);
    }
    return await Gift.find(query).populate('media').populate('type').sort({ price: 1 });
  }

  /**
   * Processes sending a gift in a room/livestream
   */
  public async sendGift(
    senderId: string,
    channelName: string,
    giftId: string,
    receiverId: string,
    contextType?: 'live_stream' | 'party_room' | 'audio_call' | 'video_call'
  ) {
    AppLogger.info(`[GiftService: sendGift] Entered. senderId=${senderId}, channelName=${channelName}, giftId=${giftId}, receiverId=${receiverId}, contextType=${contextType}`);
    
    if (!mongoose.Types.ObjectId.isValid(senderId) || !mongoose.Types.ObjectId.isValid(giftId) || !mongoose.Types.ObjectId.isValid(receiverId)) {
      throw new Error('Invalid sender, receiver, or gift ID');
    }

    if (senderId === receiverId) {
      throw new Error('Self-gifting is not allowed');
    }

    // 1. Determine room & context
    let liveStream = null;
    let resolvedContext = contextType;

    if (channelName) {
      liveStream = await LiveStream.findOne({ channelName, status: 'live' });
      if (liveStream) {
        if (!resolvedContext) {
          resolvedContext = liveStream.roomType === 'party_room' ? 'party_room' : 'live_stream';
        }
      }
    }

    // 2. Perform room validation based on room type/rules
    if (resolvedContext === 'live_stream') {
      if (!liveStream) {
        throw new Error('Active room/livestream not found');
      }
      const hostId = liveStream.hostId.toString();
      
      // Audience can send only to host. Host cannot send to self (already checked by self-gifting).
      if (senderId !== hostId) {
        if (receiverId !== hostId) {
          throw new Error('Audience can send gifts only to the Live Host');
        }
      }

      // Check block status
      if (liveStream.blockedUsers && liveStream.blockedUsers.some(uid => uid.toString() === senderId)) {
        throw new Error('You are blocked from sending gifts in this room');
      }
    } else if (resolvedContext === 'party_room') {
      if (!liveStream) {
        throw new Error('Active party room not found');
      }
      const hostId = liveStream.hostId.toString();

      const isUserSeated = (uid: string) => {
        return liveStream.seats && liveStream.seats.some(seat => seat.userId && seat.userId.toString() === uid);
      };

      const isHost = senderId === hostId;
      const isSeated = isUserSeated(senderId);

      if (isHost) {
        // Host can send gifts to any user sitting on a seat
        if (!isUserSeated(receiverId)) {
          throw new Error('Host can only send gifts to users sitting on a seat');
        }
      } else if (isSeated) {
        // Seated user can send gifts to Host and other seated users
        if (receiverId !== hostId && !isUserSeated(receiverId)) {
          throw new Error('Seated users can only send gifts to the Host or other seated users');
        }
      } else {
        // Audience can send gifts to Host and seated users
        if (receiverId !== hostId && !isUserSeated(receiverId)) {
          throw new Error('Audience can only send gifts to the Host or users sitting on a seat');
        }
      }

      // Check block status
      if (liveStream.blockedUsers && liveStream.blockedUsers.some(uid => uid.toString() === senderId)) {
        throw new Error('You are blocked from sending gifts in this room');
      }
    }

    // 3. Find Gift details
    const gift = await Gift.findById(giftId).populate('media');
    if (!gift || !gift.isActive) {
      throw new Error('Gift not found or inactive');
    }

    const price = gift.price;

    // 4. Find sender and receiver
    const sender = await User.findById(senderId);
    if (!sender) {
      throw new Error('Sender profile not found');
    }

    const receiver = await User.findById(receiverId);
    if (!receiver) {
      throw new Error('Receiver profile not found');
    }

    // 5. Verify sender balance
    const currentCoins = sender.coins || 0;
    if (currentCoins < price) {
      throw new Error('Insufficient coins to purchase and send this gift');
    }

    // 6. Perform balance updates
    sender.coins = currentCoins - price;
    sender.wealthCoins = (sender.wealthCoins || 0) + price;
    await sender.save();

    receiver.coins = (receiver.coins || 0) + price;
    receiver.charmCoins = (receiver.charmCoins || 0) + price;
    await receiver.save();

    // 7. Record Coin History for both users
    await CoinHistory.create({
      userId: new mongoose.Types.ObjectId(senderId),
      relatedUserId: new mongoose.Types.ObjectId(receiverId),
      amount: -price,
      type: 'transfer',
      description: `Sent gift '${gift.name}' during ${resolvedContext || 'live stream'}`,
      channelName: channelName || undefined
    });

    await CoinHistory.create({
      userId: new mongoose.Types.ObjectId(receiverId),
      relatedUserId: new mongoose.Types.ObjectId(senderId),
      amount: price,
      type: 'charm_received',
      description: `Received gift '${gift.name}' from viewer`,
      channelName: channelName || undefined
    });

    AppLogger.info(`[GiftService: sendGift] Transfer complete. Gift '${gift.name}' sent. Price=${price}`);

    return {
      gift,
      sender: {
        id: sender._id,
        name: sender.name,
        coins: sender.coins,
        wealthCoins: sender.wealthCoins,
      },
      host: {
        id: receiver._id,
        name: receiver.name,
        coins: receiver.coins,
        charmCoins: receiver.charmCoins,
      },
      receiver: {
        id: receiver._id,
        name: receiver.name,
        coins: receiver.coins,
        charmCoins: receiver.charmCoins,
      }
    };
  }

  /**
   * Retrieves unique users whom the sender has sent gifts to in a specific room
   */
  public async getGiftedUsersInRoom(userId: string, channelName: string) {
    AppLogger.info(`[GiftService: getGiftedUsersInRoom] Entered. userId=${userId}, channelName=${channelName}`);
    
    const historyEntries = await CoinHistory.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          type: 'transfer',
          channelName: channelName
        }
      },
      {
        $group: {
          _id: '$relatedUserId',
          totalCoins: { $sum: { $abs: '$amount' } },
          giftsCount: { $sum: 1 }
        }
      }
    ]);

    const result = [];
    for (const entry of historyEntries) {
      if (entry._id) {
        const user = await User.findById(entry._id)
          .select('name profileImage bio isPremium gender country')
          .populate('profileImage');
        if (user) {
          result.push({
            user,
            totalCoins: entry.totalCoins,
            giftsCount: entry.giftsCount
          });
        }
      }
    }

    return result;
  }

  /**
   * Gets list of eligible gift receivers based on context-aware rules
   */
  public async getEligibleReceivers(userId: string, channelName: string) {
    AppLogger.info(`[GiftService: getEligibleReceivers] Entered. userId=${userId}, channelName=${channelName}`);
    
    const liveStream = await LiveStream.findOne({ channelName, status: 'live' });
    if (!liveStream) {
      throw new Error('Active room/livestream not found');
    }

    const hostId = liveStream.hostId.toString();
    const roomType = liveStream.roomType || 'livestream';
    const result: any[] = [];

    const addUserToList = async (uid: string, role: string) => {
      if (uid === userId) return; // Self-gifting is not allowed
      
      // Avoid duplicate entries in the result list
      if (result.some(entry => entry.user._id.toString() === uid)) return;

      const user = await User.findById(uid)
        .select('name profileImage bio isPremium gender country')
        .populate('profileImage');
      if (user) {
        result.push({
          user,
          role
        });
      }
    };

    if (roomType === 'livestream') {
      if (userId !== hostId) {
        // Audience can gift only host
        await addUserToList(hostId, 'host');
      } else {
        // Host can gift audience/viewers
        for (const viewerId of liveStream.viewers) {
          await addUserToList(viewerId.toString(), 'audience');
        }
      }
    } else if (roomType === 'party_room') {
      const isUserSeated = (uid: string) => {
        return liveStream.seats && liveStream.seats.some(seat => seat.userId && seat.userId.toString() === uid);
      };

      const isHost = userId === hostId;
      const isSeated = isUserSeated(userId);

      if (isHost) {
        // Host can send to any user sitting on a seat
        if (liveStream.seats) {
          for (const seat of liveStream.seats) {
            if (seat.userId) {
              await addUserToList(seat.userId.toString(), 'seat');
            }
          }
        }
      } else if (isSeated) {
        // Seated user can send to host and other seated users
        await addUserToList(hostId, 'host');
        if (liveStream.seats) {
          for (const seat of liveStream.seats) {
            if (seat.userId) {
              await addUserToList(seat.userId.toString(), 'seat');
            }
          }
        }
      } else {
        // Audience can send to host and seated users
        await addUserToList(hostId, 'host');
        if (liveStream.seats) {
          for (const seat of liveStream.seats) {
            if (seat.userId) {
              await addUserToList(seat.userId.toString(), 'seat');
            }
          }
        }
      }
    }

    return result;
  }

  // ----------------------------------------------------
  // GIFT TYPE APIS
  // ----------------------------------------------------

  public async createGiftType(data: { name: string }) {
    AppLogger.info(`[GiftService: createGiftType] Creating gift type: ${data.name}`);
    return await GiftType.create({ name: data.name, isActive: true });
  }

  public async updateGiftType(id: string, data: { name?: string; isActive?: boolean }) {
    AppLogger.info(`[GiftService: updateGiftType] Updating gift type ID: ${id}`);
    const giftType = await GiftType.findByIdAndUpdate(id, data, { new: true });
    if (!giftType) throw new Error('Gift type not found');
    return giftType;
  }

  public async getGiftTypes() {
    return await GiftType.find({ isActive: true }).sort({ name: 1 });
  }

  public async getAdminGiftTypes() {
    return await GiftType.find().sort({ createdAt: -1 });
  }

  public async deleteGiftType(id: string) {
    AppLogger.info(`[GiftService: deleteGiftType] Deleting gift type ID: ${id}`);
    const giftType = await GiftType.findByIdAndDelete(id);
    if (!giftType) throw new Error('Gift type not found');
    return true;
  }
}
