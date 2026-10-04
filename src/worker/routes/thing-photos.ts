// SPEC §7C.3–7C.4 — a thing's photo in R2 (private: only through this API, to signed-in members) and
// reading a photo with Claude to fill the form. Nothing here decides what a thing holds: the reading is
// cleaned by src/shared/things.ts and only ever offered to the person, never saved.
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { READS_PER_DAY, cleanPhotoReading } from '../../shared/things';
import { nowIso, randomBase32, run } from '../db';
import { fail, photoBody } from '../http';
import { requireMember } from '../session';
import { readPhoto } from '../photo-reader';
import { householdToday, photoReadsUsedUp, recordPhotoRead } from '../photo-reads';
import { loadThing } from './things';

export const thingPhotos = new Hono<AppEnv>();

thingPhotos.post('/things/read-photo', requireMember, async (c) => {
  // §7C.4 check order: signed in → size/type → daily cap → key present → count the read → call the model.
  const photo = await photoBody(c);
  if (photo instanceof Response) return photo;
  const db = c.env.DB, now = nowIso();
  const { tz, today } = await householdToday(db, now);
  if (await photoReadsUsedUp(db, today, tz)) {
    return fail(c, 429, 'rate_limited', `Photos can be read ${READS_PER_DAY} times a day, and today's are used up. Try again tomorrow, or fill the fields in by hand.`);
  }
  if (!c.env.ANTHROPIC_API_KEY) return fail(c, 503, 'photo_reading_off', "Reading photos isn't set up yet.");
  await recordPhotoRead(db, now, c.get('member').id);
  const r = await readPhoto({ apiKey: c.env.ANTHROPIC_API_KEY, bytes: photo.bytes, mediaType: photo.type, today, tz });
  if (!r.ok && r.kind === 'refused') return fail(c, 422, 'photo_refused', "Couldn't read that photo.");
  if (!r.ok) return fail(c, 502, 'photo_reading_failed', `Couldn't read that photo: ${r.reason}`);
  return c.json(cleanPhotoReading(r.raw, today));
});

thingPhotos.put('/things/:id/photo', requireMember, async (c) => {
  const t = await loadThing(c);
  if (t instanceof Response) return t;
  const photo = await photoBody(c);
  if (photo instanceof Response) return photo;
  const key = `things/${t.id}/${randomBase32(16).toLowerCase()}.jpg`;
  await c.env.PHOTOS.put(key, photo.bytes, { httpMetadata: { contentType: photo.type } });
  await run(c.env.DB, 'UPDATE things SET photo_key = ?, updated_at = ? WHERE id = ?', key, nowIso(), t.id);
  if (t.photo_key) await c.env.PHOTOS.delete(t.photo_key); // replacing deletes the old object
  return c.body(null, 204);
});

thingPhotos.get('/things/:id/photo', requireMember, async (c) => {
  const t = await loadThing(c);
  if (t instanceof Response) return t;
  const obj = t.photo_key ? await c.env.PHOTOS.get(t.photo_key) : null;
  if (!obj) return fail(c, 404, 'not_found', 'This thing has no photo.');
  return c.body(obj.body, 200, {
    'Content-Type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
    'Cache-Control': 'private, max-age=3600',
  });
});

thingPhotos.delete('/things/:id/photo', requireMember, async (c) => {
  const t = await loadThing(c);
  if (t instanceof Response) return t;
  if (t.photo_key) {
    await run(c.env.DB, 'UPDATE things SET photo_key = NULL, updated_at = ? WHERE id = ?', nowIso(), t.id);
    await c.env.PHOTOS.delete(t.photo_key);
  }
  return c.body(null, 204);
});
