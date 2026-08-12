/** Nested populate so profile/user APIs return store items with media URL. */
export const ACTIVE_STORE_POPULATE = [
  { path: 'activeEntity', populate: { path: 'media' } },
  { path: 'activeFrame', populate: { path: 'media' } },
  { path: 'activeChatBubble', populate: { path: 'media' } },
  { path: 'activeTheme', populate: { path: 'media' } },
  { path: 'activeRide', populate: { path: 'media' } },
] as const;
