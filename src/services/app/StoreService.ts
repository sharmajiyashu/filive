import { Service } from 'typedi';
import StoreItem, { IStoreItemPrice } from '../../models/StoreItem';
import UserStoreItem from '../../models/UserStoreItem';
import User from '../../models/User';
import mongoose from 'mongoose';
import { addDays, addMonths, addYears } from 'date-fns';

@Service()
export class StoreService {
  constructor() {}

  // ----------------------------------------------------
  // ADMIN APIS
  // ----------------------------------------------------

  public async createStoreItem(data: {
    name: string;
    type: 'entity' | 'frame' | 'chat_bubble' | 'theme' | 'ride';
    media: string;
    priceOptions: IStoreItemPrice[];
  }) {
    return await StoreItem.create({
      name: data.name,
      type: data.type,
      media: new mongoose.Types.ObjectId(data.media),
      priceOptions: data.priceOptions,
    });
  }

  public async updateStoreItem(id: string, data: any) {
    if (data.media) data.media = new mongoose.Types.ObjectId(data.media);
    const item = await StoreItem.findByIdAndUpdate(id, data, { new: true });
    if (!item) throw new Error('Store item not found');
    return item;
  }

  public async getAdminStoreItems(page: number = 1, limit: number = 20, type?: string) {
    const skip = (page - 1) * limit;
    const query: any = {};
    if (type) {
      query.type = type;
    }
    const items = await StoreItem.find(query).populate('media').skip(skip).limit(limit).sort({ createdAt: -1 });
    const total = await StoreItem.countDocuments(query);
    return {
      data: items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  public async deleteStoreItem(id: string) {
    const item = await StoreItem.findByIdAndDelete(id);
    if (!item) throw new Error('Store item not found');
    return true;
  }

  // ----------------------------------------------------
  // APP (USER) APIS
  // ----------------------------------------------------

  public async getStoreItems(type?: string, page: number = 1, limit: number = 20) {
    const query: any = { isActive: true };
    if (type) query.type = type;
    
    const skip = (page - 1) * limit;
    const items = await StoreItem.find(query).populate('media').skip(skip).limit(limit);
    const total = await StoreItem.countDocuments(query);
    return {
      data: items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  public async purchaseStoreItem(
    userId: string,
    storeItemId: string,
    validityIndex: number,
    quantity: number = 1
  ) {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    const purchaseQuantity = Number(quantity);
    if (!Number.isInteger(purchaseQuantity) || purchaseQuantity < 1) {
      throw new Error('quantity must be a positive integer');
    }

    const item = await StoreItem.findById(storeItemId);
    if (!item || !item.isActive) throw new Error('Store item not available');

    const priceOption = item.priceOptions[validityIndex];
    if (!priceOption) throw new Error('Invalid price option');

    const totalCoins = priceOption.coins * purchaseQuantity;
    if (user.coins < totalCoins) {
      throw new Error('Insufficient coins');
    }

    user.coins -= totalCoins;
    await user.save();

    let expiresAt = new Date();
    if (priceOption.validityType === 'days') {
      expiresAt = addDays(expiresAt, priceOption.validity);
    } else if (priceOption.validityType === 'month') {
      expiresAt = addMonths(expiresAt, priceOption.validity);
    } else if (priceOption.validityType === 'year') {
      expiresAt = addYears(expiresAt, priceOption.validity);
    }

    const purchasedItems = [];
    for (let i = 0; i < purchaseQuantity; i++) {
      const userStoreItem = await UserStoreItem.create({
        userId: new mongoose.Types.ObjectId(userId),
        storeItemId: new mongoose.Types.ObjectId(storeItemId),
        expiresAt,
      });
      purchasedItems.push(userStoreItem);
    }

    return {
      quantity: purchaseQuantity,
      totalCoinsSpent: totalCoins,
      items: purchasedItems,
      item: purchasedItems[0],
    };
  }

  public async getUserPurchasedItems(userId: string, type?: string, page: number = 1, limit: number = 20) {
    const query: any = { 
      userId: new mongoose.Types.ObjectId(userId),
      expiresAt: { $gt: new Date() } // Only active ones
    };

    const skip = (page - 1) * limit;
    
    // We need to populate storeItemId to filter by type if requested
    let items = await UserStoreItem.find(query).populate({
      path: 'storeItemId',
      populate: { path: 'media' }
    });

    if (type) {
      items = items.filter((item: any) => item.storeItemId && item.storeItemId.type === type);
    }

    // Paginate in memory if filtered, otherwise normal pagination could be tricky with population filtering.
    // For simplicity, we paginate the populated/filtered array.
    const paginatedItems = items.slice(skip, skip + limit);

    return {
      data: paginatedItems,
      total: items.length,
      page,
      limit,
      totalPages: Math.ceil(items.length / limit)
    };
  }

  public async toggleItemInUse(userId: string, userStoreItemId: string, useStatus: boolean) {
    const userStoreItem = await UserStoreItem.findOne({
      _id: userStoreItemId,
      userId,
      expiresAt: { $gt: new Date() }
    }).populate('storeItemId');

    if (!userStoreItem) {
      throw new Error('Purchased item not found or expired');
    }

    const itemType = (userStoreItem.storeItemId as any).type;

    if (useStatus) {
      // Un-equip other items of the same type
      const otherItems = await UserStoreItem.find({ userId, inUse: true }).populate('storeItemId');
      for (const other of otherItems) {
        if ((other.storeItemId as any).type === itemType) {
          other.inUse = false;
          await other.save();
        }
      }
    }

    userStoreItem.inUse = useStatus;
    await userStoreItem.save();

    // Update user profile fields
    const user = await User.findById(userId);
    if (user) {
      const activeFieldMap: any = {
        'entity': 'activeEntity',
        'frame': 'activeFrame',
        'chat_bubble': 'activeChatBubble',
        'theme': 'activeTheme',
        'ride': 'activeRide'
      };
      
      const field = activeFieldMap[itemType];
      if (field) {
        (user as any)[field] = useStatus ? userStoreItem.storeItemId._id : undefined;
        await user.save();
      }
    }

    return userStoreItem;
  }
}
