import mongoose from 'mongoose';
import User from '../models/User';
import UserStoreItem from '../models/UserStoreItem';

export const ACTIVE_STORE_FIELD_BY_TYPE: Record<string, string> = {
  entry: 'activeEntry',
  frame: 'activeFrame',
  chat_bubble: 'activeChatBubble',
  theme: 'activeTheme',
  ride: 'activeRide',
};

export const ACTIVE_STORE_FIELDS = Object.values(ACTIVE_STORE_FIELD_BY_TYPE);

export function normalizeStoreTypeQuery(type?: string): string | undefined {
  if (!type) return undefined;
  const t = type.trim().toLowerCase();
  if (t === 'entity') return 'entry';
  if (t === 'chatbubble' || t === 'bubble') return 'chat_bubble';
  if (t === 'avatar_frame') return 'frame';
  if (t === 'room_theme') return 'theme';
  return t;
}

/** Nested populate so profile/user APIs return store items with media URL. */
export const ACTIVE_STORE_POPULATE = [
  { path: 'activeEntry', populate: { path: 'media' } },
  { path: 'activeFrame', populate: { path: 'media' } },
  { path: 'activeChatBubble', populate: { path: 'media' } },
  { path: 'activeTheme', populate: { path: 'media' } },
  { path: 'activeRide', populate: { path: 'media' } },
] as const;

/** Format a store item document or object to ensure path, url, type, and media are properly present. */
export function formatStoreItem(item: any) {
  if (!item) return null;
  const raw = item.toObject ? item.toObject() : item;
  if (typeof raw !== 'object') return raw;

  const mediaObj = raw.media ? (raw.media.toObject ? raw.media.toObject() : raw.media) : null;
  const path = (mediaObj && typeof mediaObj === 'object' && (mediaObj.url || mediaObj.path))
    ? (mediaObj.url || mediaObj.path)
    : (typeof raw.media === 'string' ? raw.media : (raw.url || raw.path || ''));

  let itemType = raw.type || '';
  if (itemType === 'entity') itemType = 'entry';

  return {
    _id: raw._id || raw.id || null,
    id: raw._id || raw.id || null,
    name: raw.name || '',
    type: itemType,
    media: mediaObj || (path ? { url: path } : null),
    path: path || '',
    url: path || '',
    priceOptions: raw.priceOptions || [],
    isActive: raw.isActive ?? true,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export async function clearExpiredActiveStoreItems(userId?: string) {
  const now = new Date();
  const query: Record<string, unknown> = { inUse: true, expiresAt: { $lte: now } };
  if (userId) query.userId = userId;

  const expired = await UserStoreItem.find(query).populate('storeItemId');
  for (const item of expired) {
    item.inUse = false;
    await item.save();

    const type = (item.storeItemId as any)?.type as string | undefined;
    const field = type ? ACTIVE_STORE_FIELD_BY_TYPE[type] : undefined;
    const storeItemId = (item.storeItemId as any)?._id || item.storeItemId;
    if (field && storeItemId) {
      await User.updateOne(
        { _id: item.userId, [field]: storeItemId },
        { $unset: { [field]: 1 } }
      );
    }
  }

  return expired.length;
}

export async function stripExpiredActiveStoreOnUser(user: any) {
  if (!user?._id) return user;

  await clearExpiredActiveStoreItems(user._id.toString());

  const now = new Date();
  for (const field of ACTIVE_STORE_FIELDS) {
    const active = user[field];
    if (!active) continue;
    const storeItemId = active._id || active;
    const owned = await UserStoreItem.findOne({
      userId: user._id,
      storeItemId,
      expiresAt: { $gt: now },
    });
    if (!owned) {
      if (typeof user.set === 'function') {
        user.set(field, undefined);
      } else {
        user[field] = null;
      }
    }
  }

  return user;
}

/** Formats a user object with all active store items (with path and type) and active purchases list. */
export async function formatUserActiveStoreItems(user: any, includePurchasedList: boolean = true) {
  if (!user) return null;
  const rawUser = user.toObject ? user.toObject() : { ...user };
  const userIdStr = (rawUser._id || rawUser.id)?.toString();

  if (userIdStr && mongoose.Types.ObjectId.isValid(userIdStr)) {
    await stripExpiredActiveStoreOnUser(rawUser);
  }

  const activeEntry = formatStoreItem(rawUser.activeEntry || rawUser.entry);
  const activeFrame = formatStoreItem(rawUser.activeFrame || rawUser.frame);
  const activeChatBubble = formatStoreItem(rawUser.activeChatBubble || rawUser.chatBubble || rawUser.chat_bubble);
  const activeTheme = formatStoreItem(rawUser.activeTheme || rawUser.theme);
  const activeRide = formatStoreItem(rawUser.activeRide || rawUser.ride);

  rawUser.activeEntry = activeEntry;
  rawUser.entry = activeEntry;
  rawUser.activeFrame = activeFrame;
  rawUser.frame = activeFrame;
  rawUser.activeChatBubble = activeChatBubble;
  rawUser.chatBubble = activeChatBubble;
  rawUser.chat_bubble = activeChatBubble;
  rawUser.activeTheme = activeTheme;
  rawUser.theme = activeTheme;
  rawUser.activeRide = activeRide;
  rawUser.ride = activeRide;

  const activeStoreItems: any[] = [];
  if (activeEntry) activeStoreItems.push(activeEntry);
  if (activeFrame) activeStoreItems.push(activeFrame);
  if (activeChatBubble) activeStoreItems.push(activeChatBubble);
  if (activeTheme) activeStoreItems.push(activeTheme);
  if (activeRide) activeStoreItems.push(activeRide);

  rawUser.activeStoreItems = activeStoreItems;
  rawUser.activeItems = activeStoreItems;

  if (includePurchasedList && userIdStr && mongoose.Types.ObjectId.isValid(userIdStr)) {
    try {
      const now = new Date();
      const purchasedDocs = await UserStoreItem.find({
        userId: new mongoose.Types.ObjectId(userIdStr),
        expiresAt: { $gt: now }
      }).populate({
        path: 'storeItemId',
        populate: { path: 'media' }
      });

      const purchasedStoreItems = purchasedDocs.map((doc: any) => {
        const docObj = doc.toObject ? doc.toObject() : doc;
        const formattedStoreItem = formatStoreItem(docObj.storeItemId);
        const remainingMs = Math.max(0, new Date(docObj.expiresAt).getTime() - now.getTime());
        const remainingDays = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
        return {
          _id: docObj._id,
          id: docObj._id,
          userId: docObj.userId,
          storeItemId: formattedStoreItem,
          storeItem: formattedStoreItem,
          type: formattedStoreItem?.type || '',
          path: formattedStoreItem?.path || '',
          url: formattedStoreItem?.url || '',
          inUse: docObj.inUse ?? false,
          purchasedAt: docObj.purchasedAt,
          expiresAt: docObj.expiresAt,
          remainingMs,
          remainingDays,
        };
      });

      rawUser.purchasedStoreItems = purchasedStoreItems;
      rawUser.purchasedItems = purchasedStoreItems;
      rawUser.activeStorePurchases = purchasedStoreItems;
    } catch {
      rawUser.purchasedStoreItems = rawUser.purchasedStoreItems || [];
      rawUser.purchasedItems = rawUser.purchasedItems || [];
      rawUser.activeStorePurchases = rawUser.activeStorePurchases || [];
    }
  } else {
    rawUser.purchasedStoreItems = rawUser.purchasedStoreItems || [];
    rawUser.purchasedItems = rawUser.purchasedItems || [];
    rawUser.activeStorePurchases = rawUser.activeStorePurchases || [];
  }

  return rawUser;
}
