// SPEC §7C.3 — photos (pure, imports nothing): the server's limits and the phone's shrink settings.
// home/ bundles PHOTO_MAX_BYTES through item-reading.ts, so changing it means rebuilding the helper.
export const PHOTO_MAX_BYTES = 4 * 1024 * 1024;
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const;
export const PHOTO_LONG_SIDE = 1600;
export const PHOTO_QUALITY = 0.85;
