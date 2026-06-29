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
  public async sendGift(senderId: string, channelName: string, giftId: string) {
    AppLogger.info(`[GiftService: sendGift] Entered. senderId=${senderId}, channelName=${channelName}, giftId=${giftId}`);
    
    if (!mongoose.Types.ObjectId.isValid(senderId) || !mongoose.Types.ObjectId.isValid(giftId)) {
      throw new Error('Invalid sender or gift ID');
    }

    // 1. Find live room
    const liveStream = await LiveStream.findOne({ channelName, status: 'live' });
    if (!liveStream) {
      throw new Error('Active room/livestream not found');
    }

    const hostId = liveStream.hostId.toString();
    if (senderId === hostId) {
      throw new Error('You cannot send a gift to yourself');
    }

    // Check if sender is blocked in this room
    if (liveStream.blockedUsers && liveStream.blockedUsers.some(uid => uid.toString() === senderId)) {
      throw new Error('You are blocked from sending gifts in this room');
    }

    // 2. Find Gift details
    const gift = await Gift.findById(giftId).populate('media');
    if (!gift || !gift.isActive) {
      throw new Error('Gift not found or inactive');
    }

    const price = gift.price;

    // 3. Find sender and receiver (host)
    const sender = await User.findById(senderId);
    if (!sender) {
      throw new Error('Sender profile not found');
    }

    const host = await User.findById(hostId);
    if (!host) {
      throw new Error('Host profile not found');
    }

    // 4. Verify sender balance
    const currentCoins = sender.coins || 0;
    if (currentCoins < price) {
      throw new Error('Insufficient coins to purchase and send this gift');
    }

    // 5. Perform balance updates
    // Sender: deduct coins, add wealthCoins
    sender.coins = currentCoins - price;
    sender.wealthCoins = (sender.wealthCoins || 0) + price;
    await sender.save();

    // Host: add coins, add charmCoins
    host.coins = (host.coins || 0) + price;
    host.charmCoins = (host.charmCoins || 0) + price;
    await host.save();

    // 6. Record Coin History for both users
    await CoinHistory.create({
      userId: new mongoose.Types.ObjectId(senderId),
      relatedUserId: new mongoose.Types.ObjectId(hostId),
      amount: -price,
      type: 'transfer',
      description: `Sent gift '${gift.name}' during live stream`,
    });

    await CoinHistory.create({
      userId: new mongoose.Types.ObjectId(hostId),
      relatedUserId: new mongoose.Types.ObjectId(senderId),
      amount: price,
      type: 'charm_received',
      description: `Received gift '${gift.name}' from viewer`,
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
        id: host._id,
        name: host.name,
        coins: host.coins,
        charmCoins: host.charmCoins,
      }
    };
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
