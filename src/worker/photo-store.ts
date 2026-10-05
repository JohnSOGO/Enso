// SPEC §7C.3, §7A.3, §7B.6, §7B.7, §7E.2b ⚑ Q174 — private photos in R2: the key, the put, the replace order and
// the private serve. Never writes a D1 row (the caller's own write is `save`), never decides who may see a photo.
import type { Context } from 'hono';
import { randomBase32 } from './db';
import { fail } from './http';

export type PhotoPrefix = 'things' | 'list-items' | 'recipes' | 'chore-areas' | 'messes';

/** `{prefix}/{ownerId}/{random}.jpg`. */
export const photoKey = (prefix: PhotoPrefix, ownerId: string) => `${prefix}/${ownerId}/${randomBase32(16).toLowerCase()}.jpg`;

/** Stores the bytes under a new key → the key. */
export async function putPhoto(bucket: R2Bucket, prefix: PhotoPrefix, ownerId: string, bytes: ArrayBuffer | ArrayBufferView, type: string) {
  const key = photoKey(prefix, ownerId);
  await bucket.put(key, bytes, { httpMetadata: { contentType: type } });
  return key;
}

/** Put the new photo, then the caller's own row write, then the old object deleted (replacing deletes it). */
export async function replacePhoto(bucket: R2Bucket, prefix: PhotoPrefix, ownerId: string, bytes: ArrayBuffer | ArrayBufferView,
  type: string, oldKey: string | null | undefined, save: (key: string) => Promise<unknown>) {
  const key = await putPhoto(bucket, prefix, ownerId, bytes, type);
  await save(key);
  if (oldKey) await bucket.delete(oldKey);
}

/** The stored photo, private for an hour, or the 404 with the caller's text. */
export async function servePhoto(c: Context, bucket: R2Bucket, key: string | null | undefined, missing: string) {
  const obj = key ? await bucket.get(key) : null;
  if (!obj) return fail(c, 404, 'not_found', missing);
  return c.body(obj.body, 200, {
    'Content-Type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
    'Cache-Control': 'private, max-age=3600',
  });
}
