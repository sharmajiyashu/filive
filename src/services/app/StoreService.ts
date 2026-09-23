import { Service } from 'typedi';
import StoreItem, { IStoreItemPrice } from '../../models/StoreItem';
import UserStoreItem from '../../models/UserStoreItem';
import User from '../../models/User';
import mongoose from 'mongoose';
import { addDays, addMonths, addYears } from 'date-fns';
import { clearExpiredActiveStoreItems, formatStoreItem, ACTIVE_STORE_FIELD_BY_TYPE } from '../../utils/activeStorePopulate';

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
    const created = await StoreItem.create({
      name: data.name,
      type: data.type,
      media: new mongoose.Types.ObjectId(data.media),
      priceOptions: data.priceOptions,
    });
    const populated = await StoreItem.findById(created._id).populate('media');
    return formatStoreItem(populated || created);
  }

  public async updateStoreItem(id: string, data: any) {
    if (data.media) data.media = new mongoose.Types.ObjectId(data.media);
    const item = await StoreItem.findByIdAndUpdate(id, data, { new: true }).populate('media');
    if (!item) throw new Error('Store item not found');
    return formatStoreItem(item);
  }

  public async getAdminStoreItems(page: number = 1, limit: number = 20, type?: string) {
    const skip = (page - 1) * limit;
    const query: any = {};
    if (type) {
      query.type = type;
    }
    const items = await StoreItem.find(query).populate('media').skip(skip).limit(limit).sort({ createdAt: -1 });
    const total = await StoreItem.countDocuments(query);
    const formatted = items.map(item => formatStoreItem(item));
    return {
      data: formatted,
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
    const formatted = items.map(item => formatStoreItem(item));
    return {
      data: formatted,
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

    const item = await StoreItem.findById(storeItemId).populate('media');
    if (!item || !item.isActive) throw new Error('Store item not available');

    const priceOption = item.priceOptions[validityIndex];
    if (!priceOption) throw new Error('Invalid price option');

    const totalCoins = priceOption.coins * purchaseQuantity;
    if (user.coins < totalCoins) {
      throw new Error('Insufficient coins');
    }

    user.coins -= totalCoins;
    await user.save();

    const now = new Date();
    const stackedItem = await this.extendOrCreatePurchase(
      userId,
      storeItemId,
      priceOption,
      purchaseQuantity,
      now
    );

    // Auto-equip the newly purchased item so it immediately shows in livestreams & profile
    await this.toggleItemInUse(userId, stackedItem._id.toString(), true);

    const populated = await UserStoreItem.findById(stackedItem._id).populate({
      path: 'storeItemId',
      populate: { path: 'media' }
    });
    const purchasedItem = populated || stackedItem;
    const formattedStoreItem = formatStoreItem((purchasedItem as any).storeItemId || item);
    const remainingMs = Math.max(0, purchasedItem.expiresAt.getTime() - now.getTime());
    const remainingDays = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));

    const purchasedItemObj = purchasedItem.toObject ? purchasedItem.toObject() : purchasedItem;

    const formattedPurchasedItem = {
      ...purchasedItemObj,
      storeItemId: formattedStoreItem,
      storeItem: formattedStoreItem,
      type: formattedStoreItem?.type || item.type,
      path: formattedStoreItem?.path || '',
      url: formattedStoreItem?.url || '',
      inUse: true,
      remainingMs,
      remainingDays,
    };

    return {
      quantity: purchaseQuantity,
      totalCoinsSpent: totalCoins,
      type: formattedStoreItem?.type || item.type,
      path: formattedStoreItem?.path || '',
      url: formattedStoreItem?.url || '',
      items: [formattedPurchasedItem],
      item: formattedPurchasedItem,
      expiresAt: purchasedItem.expiresAt,
      remainingMs,
      remainingDays,
    };
  }

  private addValidity(base: Date, priceOption: IStoreItemPrice, quantity: number): Date {
    const amount = priceOption.validity * quantity;
    if (priceOption.validityType === 'month') {
      return addMonths(base, amount);
    }
    if (priceOption.validityType === 'year') {
      return addYears(base, amount);
    }
    return addDays(base, amount);
  }

  private async mergeDuplicateActiveItems(userId: string, storeItemId: string) {
    const now = new Date();
    const activeItems = await UserStoreItem.find({
      userId: new mongoose.Types.ObjectId(userId),
      storeItemId: new mongoose.Types.ObjectId(storeItemId),
      expiresAt: { $gt: now },
    }).sort({ inUse: -1, expiresAt: -1, purchasedAt: -1 });

    if (activeItems.length <= 1) {
      return activeItems[0] || null;
    }

    const totalRemainingMs = activeItems.reduce((sum, item) => {
      return sum + Math.max(0, item.expiresAt.getTime() - now.getTime());
    }, 0);

    const keep = activeItems[0];
    keep.expiresAt = new Date(now.getTime() + totalRemainingMs);
    await keep.save();

    const duplicateIds = activeItems.slice(1).map((item) => item._id);
    await UserStoreItem.deleteMany({ _id: { $in: duplicateIds } });
    return keep;
  }

  private async extendOrCreatePurchase(
    userId: string,
    storeItemId: string,
    priceOption: IStoreItemPrice,
    quantity: number,
    now: Date
  ) {
    await this.mergeDuplicateActiveItems(userId, storeItemId);

    const existing = await UserStoreItem.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      storeItemId: new mongoose.Types.ObjectId(storeItemId),
      expiresAt: { $gt: now },
    }).sort({ expiresAt: -1 });

    if (existing) {
      const base = existing.expiresAt.getTime() > now.getTime() ? existing.expiresAt : now;
      existing.expiresAt = this.addValidity(base, priceOption, quantity);
      await existing.save();
      return existing;
    }

    return UserStoreItem.create({
      userId: new mongoose.Types.ObjectId(userId),
      storeItemId: new mongoose.Types.ObjectId(storeItemId),
      expiresAt: this.addValidity(now, priceOption, quantity),
      inUse: true,
    });
  }

  public async getUserPurchasedItems(userId: string, type?: string, page: number = 1, limit: number = 20) {
    await clearExpiredActiveStoreItems(userId);
    const query: any = { 
      userId: new mongoose.Types.ObjectId(userId),
      expiresAt: { $gt: new Date() } // Only active ones
    };

    const skip = (page - 1) * limit;

    const activeItems = await UserStoreItem.find(query).select('storeItemId');
    const uniqueStoreItemIds = [...new Set(activeItems.map((item) => item.storeItemId.toString()))];
    for (const storeItemId of uniqueStoreItemIds) {
      await this.mergeDuplicateActiveItems(userId, storeItemId);
    }

    let items = await UserStoreItem.find(query).populate({
      path: 'storeItemId',
      populate: { path: 'media' }
    });

    if (type) {
      items = items.filter((item: any) => item.storeItemId && item.storeItemId.type === type);
    }

    const now = new Date();
    const paginatedItems = items.slice(skip, skip + limit).map((item: any) => {
      const obj = item.toObject ? item.toObject() : item;
      const formattedStoreItem = formatStoreItem(obj.storeItemId);
      const remainingMs = Math.max(0, new Date(obj.expiresAt).getTime() - now.getTime());
      return {
        ...obj,
        storeItemId: formattedStoreItem,
        storeItem: formattedStoreItem,
        type: formattedStoreItem?.type || (obj.storeItemId as any)?.type || '',
        path: formattedStoreItem?.path || '',
        url: formattedStoreItem?.url || '',
        remainingMs,
        remainingDays: Math.ceil(remainingMs / (24 * 60 * 60 * 1000)),
      };
    });

    return {
      data: paginatedItems,
      total: items.length,
      page,
      limit,
      totalPages: Math.ceil(items.length / limit)
    };
  }

  public async toggleItemInUse(userId: string, userStoreItemId: string, useStatus: boolean) {
    await clearExpiredActiveStoreItems(userId);
    const userStoreItem = await UserStoreItem.findOne({
      _id: userStoreItemId,
      userId,
      expiresAt: { $gt: new Date() }
    }).populate({
      path: 'storeItemId',
      populate: { path: 'media' }
    });

    if (!userStoreItem) {
      throw new Error('Purchased item not found or expired');
    }

    const itemType = (userStoreItem.storeItemId as any)?.type;

    if (useStatus && itemType) {
      // Un-equip other items of the same type
      const otherItems = await UserStoreItem.find({ userId, inUse: true, _id: { $ne: userStoreItemId } }).populate('storeItemId');
      for (const other of otherItems) {
        if ((other.storeItemId as any)?.type === itemType) {
          other.inUse = false;
          await other.save();
        }
      }
    }

    userStoreItem.inUse = useStatus;
    await userStoreItem.save();

    // Update user profile fields
    const user = await User.findById(userId);
    if (user && itemType) {
      const field = ACTIVE_STORE_FIELD_BY_TYPE[itemType];
      if (field) {
        (user as any)[field] = useStatus ? (userStoreItem.storeItemId as any)?._id || userStoreItem.storeItemId : null;
        await user.save();
      }
    }

    const formattedStoreItem = formatStoreItem(userStoreItem.storeItemId);
    const userStoreItemObj = userStoreItem.toObject ? userStoreItem.toObject() : userStoreItem;
    return {
      ...userStoreItemObj,
      storeItemId: formattedStoreItem,
      storeItem: formattedStoreItem,
      type: formattedStoreItem?.type || itemType || '',
      path: formattedStoreItem?.path || '',
      url: formattedStoreItem?.url || '',
    };
  }
}
