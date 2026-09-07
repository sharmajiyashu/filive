import User from '../models/User';
import UserStoreItem from '../models/UserStoreItem';

export const ACTIVE_STORE_FIELD_BY_TYPE: Record<string, string> = {
  entity: 'activeEntity',
  frame: 'activeFrame',
  chat_bubble: 'activeChatBubble',
  theme: 'activeTheme',
  ride: 'activeRide',
};

export const ACTIVE_STORE_FIELDS = Object.values(ACTIVE_STORE_FIELD_BY_TYPE);

/** Nested populate so profile/user APIs return store items with media URL. */
export const ACTIVE_STORE_POPULATE = [
  { path: 'activeEntity', populate: { path: 'media' } },
  { path: 'activeFrame', populate: { path: 'media' } },
  { path: 'activeChatBubble', populate: { path: 'media' } },
  { path: 'activeTheme', populate: { path: 'media' } },
  { path: 'activeRide', populate: { path: 'media' } },
] as const;

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
