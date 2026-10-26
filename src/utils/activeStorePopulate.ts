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

let cachedRoleSettings: { settings: Record<string, string>; expiresAt: number } | null = null;
export async function getCachedRoleSettings(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cachedRoleSettings && cachedRoleSettings.expiresAt > now) {
    return cachedRoleSettings.settings;
  }
  try {
    const AppSetting = mongoose.model('AppSetting');
    const docs = await AppSetting.find({
      key: { $in: ['host_role_image', 'agency_role_image', 'coin_trader_role_image', 'bd_role_image'] }
    }).lean();
    const map: Record<string, string> = {};
    for (const d of docs) {
      if (d.value && typeof d.value === 'string') {
        map[d.key] = d.value.trim();
      }
    }
    cachedRoleSettings = { settings: map, expiresAt: now + 30000 };
    return map;
  } catch {
    return {};
  }
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
  if (!raw || typeof raw !== 'object') return null;

  // If it's just an ObjectId without name, return null so it doesn't return raw ObjectId
  if (!raw.name && !raw.media && !raw.type && !raw.url && !raw.path) return null;

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

  // Collect active item IDs that exist on user
  const activeIds: mongoose.Types.ObjectId[] = [];
  for (const field of ACTIVE_STORE_FIELDS) {
    const active = user[field];
    if (active) {
      const id = active._id || active;
      if (id && mongoose.Types.ObjectId.isValid(id.toString())) {
        activeIds.push(new mongoose.Types.ObjectId(id.toString()));
      }
    }
  }

  if (activeIds.length === 0) return user;

  const now = new Date();
  // Single batch query instead of sequential loop queries
  const validOwned = await UserStoreItem.find({
    userId: user._id,
    storeItemId: { $in: activeIds },
    expiresAt: { $gt: now },
  }).select('storeItemId').lean();

  const validOwnedIds = new Set(validOwned.map((item: any) => item.storeItemId.toString()));

  for (const field of ACTIVE_STORE_FIELDS) {
    const active = user[field];
    if (!active) continue;
    const sId = (active._id || active).toString();
    if (!validOwnedIds.has(sId)) {
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

  // Handle legacy DB fields
  if (!rawUser.activeEntry && (rawUser as any).activeEntity) {
    rawUser.activeEntry = (rawUser as any).activeEntity;
  }
  if (!rawUser.entry && (rawUser as any).entity) {
    rawUser.entry = (rawUser as any).entity;
  }

  // Batch fetch any active fields that are unpopulated ObjectIds or strings
  const missingIds: mongoose.Types.ObjectId[] = [];
  const fieldToIdMap: Record<string, string> = {};

  for (const [typeKey, fieldName] of Object.entries(ACTIVE_STORE_FIELD_BY_TYPE)) {
    const val = rawUser[fieldName] || rawUser[typeKey];
    if (val && (typeof val !== 'object' || !val.name || (!val.media && !val.url && !val.path))) {
      const sId = val._id || val;
      if (mongoose.Types.ObjectId.isValid(sId)) {
        const sIdStr = sId.toString();
        missingIds.push(new mongoose.Types.ObjectId(sIdStr));
        fieldToIdMap[fieldName] = sIdStr;
        fieldToIdMap[typeKey] = sIdStr;
      }
    }
  }

  if (missingIds.length > 0) {
    try {
      const StoreItemModel = mongoose.model('StoreItem');
      const fetchedItems = await StoreItemModel.find({ _id: { $in: missingIds } }).populate('media');
      const itemMap = new Map(fetchedItems.map((item: any) => [item._id.toString(), item]));
      for (const [field, sIdStr] of Object.entries(fieldToIdMap)) {
        const item = itemMap.get(sIdStr);
        if (item) {
          rawUser[field] = item;
        }
      }
    } catch { }
  }

  // Fallback: If any active field is still missing and user exists, check inUse items from UserStoreItem
  const hasMissingActive = !rawUser.activeEntry || !rawUser.activeFrame || !rawUser.activeChatBubble || !rawUser.activeTheme || !rawUser.activeRide;
  if (hasMissingActive && userIdStr && mongoose.Types.ObjectId.isValid(userIdStr)) {
    try {
      const now = new Date();
      const inUseDocs = await UserStoreItem.find({
        userId: new mongoose.Types.ObjectId(userIdStr),
        inUse: true,
        expiresAt: { $gt: now }
      }).populate({
        path: 'storeItemId',
        populate: { path: 'media' }
      });

      for (const doc of inUseDocs) {
        const itemDoc = (doc as any).storeItemId;
        if (itemDoc) {
          const normType = normalizeStoreTypeQuery(itemDoc.type);
          const field = normType ? ACTIVE_STORE_FIELD_BY_TYPE[normType] : undefined;
          if (field && (!rawUser[field] || typeof rawUser[field] !== 'object' || !rawUser[field].name)) {
            rawUser[field] = itemDoc;
            if (normType) rawUser[normType] = itemDoc;
          }
        }
      }
    } catch { }
  }

  const activeEntry = formatStoreItem(rawUser.activeEntry || rawUser.entry || (rawUser as any).activeEntity || (rawUser as any).entity);
  let activeFrame: any = formatStoreItem(rawUser.activeFrame || rawUser.frame);
  const activeChatBubble = formatStoreItem(rawUser.activeChatBubble || rawUser.chatBubble || rawUser.chat_bubble);
  const activeTheme = formatStoreItem(rawUser.activeTheme || rawUser.theme);
  const activeRide = formatStoreItem(rawUser.activeRide || rawUser.ride);

  // Role Tag Fallback: If user has no active store frame equipped, fall back to configured Role Image from App Settings
  const roleSettings = await getCachedRoleSettings();
  const bdRoleImage = roleSettings.bd_role_image || '';
  const agencyRoleImage = roleSettings.agency_role_image || '';
  const coinTraderRoleImage = roleSettings.coin_trader_role_image || '';
  const hostRoleImage = roleSettings.host_role_image || '';

  let userRoleTag: string | null = null;
  let userRoleLabel: string = '';
  let roleImageUrl: string = '';

  let isBd = Boolean(rawUser.isBd);
  let isCoinTrader = Boolean(rawUser.isCoinseller);
  let isAgency = Boolean(rawUser.ownedAgency || rawUser.agency || rawUser.isAgency);
  let isHost = Boolean(rawUser.isBecomeHost || rawUser.isAgencyHost || rawUser.userRole === 'host');

  if (!isBd && !isAgency && !isHost && userIdStr && mongoose.Types.ObjectId.isValid(userIdStr)) {
    try {
      const AgencyModel = mongoose.model('Agency');
      const [bdAgencyExists, creatorAgencyExists] = await Promise.all([
        bdRoleImage ? AgencyModel.exists({ bdId: new mongoose.Types.ObjectId(userIdStr) }) : false,
        agencyRoleImage ? AgencyModel.exists({ creatorId: new mongoose.Types.ObjectId(userIdStr), isVerified: true, status: 'approved' }) : false,
      ]);
      if (bdAgencyExists) isBd = true;
      if (creatorAgencyExists) isAgency = true;
    } catch { }
  }

  if (isBd && bdRoleImage) {
    userRoleTag = 'bd';
    userRoleLabel = 'BD';
    roleImageUrl = bdRoleImage;
  } else if (isAgency && agencyRoleImage) {
    userRoleTag = 'agency';
    userRoleLabel = 'Agency';
    roleImageUrl = agencyRoleImage;
  } else if (isCoinTrader && coinTraderRoleImage) {
    userRoleTag = 'coin_trader';
    userRoleLabel = 'Coin Trader';
    roleImageUrl = coinTraderRoleImage;
  } else if (isHost && hostRoleImage) {
    userRoleTag = 'host';
    userRoleLabel = 'Host';
    roleImageUrl = hostRoleImage;
  }

  if (!activeFrame && roleImageUrl) {
    activeFrame = {
      _id: `role_tag_${userRoleTag}`,
      id: `role_tag_${userRoleTag}`,
      name: `${userRoleLabel} Role Tag`,
      type: 'frame',
      media: { url: roleImageUrl, type: 'image' },
      path: roleImageUrl,
      url: roleImageUrl,
      priceOptions: [],
      isActive: true,
      isRoleTag: true,
      role: userRoleTag,
    };
  }

  rawUser.roleTag = {
    currentRole: userRoleTag || null,
    currentRoleImage: roleImageUrl || '',
    hostRoleImage,
    agencyRoleImage,
    coinTraderRoleImage,
    bdRoleImage,
  };

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
