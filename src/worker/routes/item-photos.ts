// SPEC §7A.3 — snap an item: naming a photographed list item (SogoAI's local model first, the Claude API only when
// SogoAI gives no name) and a list item's photo in R2 (private: only through this API, to signed-in members). The
// read stores nothing: its name is cleaned by src/shared/item-reading.ts and only offered in the add box. The photo's
// key is never on the wire. Deleting an item or a list deletes its photos in routes/lists.ts.
import { Hono, type Context } from 'hono';
import type { AppEnv } from '../env';
import { READS_PER_DAY } from '../../shared/things';
import { cleanItemName, type ItemReading } from '../../shared/item-reading';
import { nowIso, randomBase32, run } from '../db';
import { fail, photoBody } from '../http';
import { requireMember } from '../session';
import { homeCaptionsConfigOf, identifyFromHome } from '../home-captions';
import { readItemPhoto } from '../photo-reader';
import { householdToday, photoReadsUsedUp, recordPhotoRead } from '../photo-reads';
import { ITEM_GONE, loadItem } from './lists';

const NO_PHOTO = 'This item has no photo.';

export const itemPhotos = new Hono<AppEnv>();

/** SogoAI first (free): its cleaned name, or why it gave none (for the 502's message). */
async function askHome(c: Context<AppEnv>, photo: { bytes: ArrayBuffer; type: string }): Promise<{ name: string } | { why: string }> {
  const cfg = homeCaptionsConfigOf(c.env);
  if (!cfg) return { why: "it isn't set up" };
  const r = await identifyFromHome(cfg, photo.bytes, photo.type);
  if (!r.ok) return { why: r.reason };
  const name = cleanItemName(r.text);
  return name ? { name } : { why: "it couldn't tell what it is" };
}

itemPhotos.post('/list-items/read-photo', requireMember, async (c) => {
  // §7A.3 check order: signed in → size/type → SogoAI → daily cap → key present → count the read → Claude.
  const photo = await photoBody(c);
  if (photo instanceof Response) return photo;
  const home = await askHome(c, photo);
  if ('name' in home) return c.json<ItemReading>({ name: home.name, via: 'sogoai' });

  const db = c.env.DB, now = nowIso();
  const { tz, today } = await householdToday(db, now);
  if (await photoReadsUsedUp(db, today, tz)) {
    return fail(c, 429, 'rate_limited', `Photos can be read ${READS_PER_DAY} times a day, and today's are used up. Try again tomorrow, or type it in.`);
  }
  if (!c.env.ANTHROPIC_API_KEY) return fail(c, 503, 'photo_reading_off', "Reading photos isn't set up yet.");
  await recordPhotoRead(db, now, c.get('member').id);
  const r = await readItemPhoto({ apiKey: c.env.ANTHROPIC_API_KEY, bytes: photo.bytes, mediaType: photo.type });
  if (!r.ok && r.kind === 'refused') return fail(c, 422, 'photo_refused', "Couldn't read that photo.");
  if (!r.ok) return fail(c, 502, 'photo_reading_failed', `Couldn't read that photo: ${r.reason} (SogoAI: ${home.why})`);
  const name = cleanItemName(r.name);
  if (!name) return fail(c, 422, 'item_unknown', "Couldn't tell what that is — type it in.");
  return c.json<ItemReading>({ name, via: 'claude' });
});

itemPhotos.put('/list-items/:id/photo', requireMember, async (c) => {
  const item = await loadItem(c.env.DB, c.req.param('id'));
  if (!item) return fail(c, 404, 'not_found', ITEM_GONE);
  const photo = await photoBody(c);
  if (photo instanceof Response) return photo;
  const key = `list-items/${item.id}/${randomBase32(16).toLowerCase()}.jpg`;
  await c.env.PHOTOS.put(key, photo.bytes, { httpMetadata: { contentType: photo.type } });
  await run(c.env.DB, 'UPDATE list_items SET photo_key = ?, updated_at = ? WHERE id = ?', key, nowIso(), item.id);
  if (item.photo_key) await c.env.PHOTOS.delete(item.photo_key); // replacing deletes the old object
  return c.body(null, 204);
});

itemPhotos.get('/list-items/:id/photo', requireMember, async (c) => {
  const item = await loadItem(c.env.DB, c.req.param('id'));
  const obj = item?.photo_key ? await c.env.PHOTOS.get(item.photo_key) : null;
  if (!obj) return fail(c, 404, 'not_found', NO_PHOTO);
  return c.body(obj.body, 200, {
    'Content-Type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
    'Cache-Control': 'private, max-age=3600',
  });
});

itemPhotos.delete('/list-items/:id/photo', requireMember, async (c) => {
  const item = await loadItem(c.env.DB, c.req.param('id'));
  if (!item) return fail(c, 404, 'not_found', ITEM_GONE);
  if (item.photo_key) {
    await run(c.env.DB, 'UPDATE list_items SET photo_key = NULL, updated_at = ? WHERE id = ?', nowIso(), item.id);
    await c.env.PHOTOS.delete(item.photo_key);
  }
  return c.body(null, 204);
});
