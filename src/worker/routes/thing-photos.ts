// SPEC §7C.3–7C.4b — a thing's photo in R2 (private: only through this API, to signed-in members), and
// reading a photo or a pasted link with Claude to fill the form. Nothing here decides what a thing holds: the reading is
// cleaned by src/shared/things.ts and only ever offered to the person, never saved.
import { Hono, type Context } from 'hono';
import type { AppEnv } from '../env';
import { READS_PER_DAY, URL_MAX, cleanPhotoReading } from '../../shared/things';
import { readableLink } from '../../shared/link-reading';
import { householdPlace, nowIso, run } from '../db';
import { body, fail, photoBody } from '../http';
import { requireMember } from '../session';
import { readPhoto } from '../photo-reader';
import { readLink } from '../link-reader';
import { spendPhotoRead } from '../photo-reads';
import { replacePhoto, servePhoto } from '../photo-store';
import { loadThing } from './things';

export const thingPhotos = new Hono<AppEnv>();

/**
 * The budget steps both readings share (§7C.4, §7C.4b): the daily cap (429), the key (503 `off`), then the
 * read is counted. → the key and today, or the answer to send.
 */
async function spendRead(c: Context<AppEnv>, off: string, offMessage: string) {
  const spent = await spendPhotoRead(c.env.DB, nowIso(), c.get('member').id, c.env.ANTHROPIC_API_KEY);
  if (spent.ok) return spent;
  return spent.why === 'used_up'
    ? fail(c, 429, 'rate_limited', `Photos and links can be read ${READS_PER_DAY} times a day, and today's are used up. Try again tomorrow, or fill the fields in by hand.`)
    : fail(c, 503, off, offMessage);
}

thingPhotos.post('/things/read-photo', requireMember, async (c) => {
  // §7C.4 check order: signed in → size/type → daily cap → key present → count the read → call the model.
  const photo = await photoBody(c);
  if (photo instanceof Response) return photo;
  const spent = await spendRead(c, 'photo_reading_off', "Reading photos isn't set up yet.");
  if (spent instanceof Response) return spent;
  const r = await readPhoto({ apiKey: spent.apiKey, tz: spent.tz, today: spent.today, bytes: photo.bytes, mediaType: photo.type });
  if (!r.ok && r.kind === 'refused') return fail(c, 422, 'photo_refused', "Couldn't read that photo.");
  if (!r.ok) return fail(c, 502, 'photo_reading_failed', `Couldn't read that photo: ${r.reason}`);
  return c.json(cleanPhotoReading(r.raw, spent.today));
});

thingPhotos.post('/things/read-link', requireMember, async (c) => {
  // §7C.4b check order: signed in → the link → daily cap → key present → count the read → page, look-up, fields.
  const raw = (await body(c)).url;
  const url = typeof raw === 'string' && raw.length <= URL_MAX ? readableLink(raw) : null;
  if (!url) return fail(c, 400, 'invalid_input', "That link can't be read.");
  const spent = await spendRead(c, 'link_reading_off', "Reading links isn't set up yet.");
  if (spent instanceof Response) return spent;
  const r = await readLink({ apiKey: spent.apiKey, tz: spent.tz, today: spent.today, url, home: await householdPlace(c.env.DB) });
  if (!r.ok && r.kind === 'refused') return fail(c, 422, 'link_refused', "Couldn't read that link.");
  if (!r.ok) return fail(c, 502, 'link_reading_failed', `Couldn't read that link: ${r.reason}`);
  return c.json(cleanPhotoReading(r.raw, spent.today));
});

thingPhotos.put('/things/:id/photo', requireMember, async (c) => {
  const t = await loadThing(c, true);
  if (t instanceof Response) return t;
  const photo = await photoBody(c);
  if (photo instanceof Response) return photo;
  await replacePhoto(c.env.PHOTOS, 'things', t.id, photo.bytes, photo.type, t.photo_key,
    (key) => run(c.env.DB, 'UPDATE things SET photo_key = ?, updated_at = ? WHERE id = ?', key, nowIso(), t.id));
  return c.body(null, 204);
});

thingPhotos.get('/things/:id/photo', requireMember, async (c) => {
  const t = await loadThing(c, false);
  if (t instanceof Response) return t;
  return servePhoto(c, c.env.PHOTOS, t.photo_key, 'This thing has no photo.');
});

thingPhotos.delete('/things/:id/photo', requireMember, async (c) => {
  const t = await loadThing(c, true);
  if (t instanceof Response) return t;
  if (t.photo_key) {
    await run(c.env.DB, 'UPDATE things SET photo_key = NULL, updated_at = ? WHERE id = ?', nowIso(), t.id);
    await c.env.PHOTOS.delete(t.photo_key);
  }
  return c.body(null, 204);
});
