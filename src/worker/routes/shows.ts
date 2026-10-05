// SPEC §7F, §10 — movies & shows: the list, add (one per showKey → 409), edit, want / watched, soft delete, and the
// look-ups (a title, a link, a picture) that fill the form but never write a row. Every rule is src/shared/shows.ts;
// the daily budget is photo-reads.ts; the look-up is show-reader.ts.
import { Hono, type Context } from 'hono';
import type { AppEnv } from '../env';
import { READS_PER_DAY } from '../../shared/things';
import { readableLink } from '../../shared/link-reading';
import {
  SHOW_TITLE_MAX, SHOW_URL_MAX, YEAR_MAX, cleanShowReading, parseShowInput, showFromRow, showKey, type ShowInput, type ShowRow,
} from '../../shared/shows';
import { SHOW_KIND, isOneOf } from '../../shared/vocab';
import { all, first, householdPlace, newId, nowIso } from '../db';
import { body, fail, photoBody } from '../http';
import { requireMember } from '../session';
import { spendPhotoRead } from '../photo-reads';
import { lookUpShow, type ShowAsk } from '../show-reader';

const GONE = 'That show is no longer on the list.';
const loadRow = (db: D1Database, id: string) => first<ShowRow>(db, 'SELECT * FROM shows WHERE id = ? AND deleted_at IS NULL', id);

/** A live show with the same key (other than `except`), for the 409. */
const clashOf = (db: D1Database, key: string, except = '') =>
  first<{ id: string; title: string }>(db, 'SELECT id, title FROM shows WHERE title_key = ? AND deleted_at IS NULL AND id != ?', key, except);
const duplicate = (c: Context<AppEnv>, clash: { id: string; title: string }) =>
  c.json({ error: 'duplicate', message: `${clash.title} is already on the list.`, showId: clash.id }, 409);

export const shows = new Hono<AppEnv>();

/** §7F.2 — the shared budget, then the look-up, then the cleaned reading. Nothing is written but the read. */
async function lookUp(c: Context<AppEnv>, ask: ShowAsk, url: string | null) {
  const db = c.env.DB, now = nowIso();
  const spent = await spendPhotoRead(db, now, c.get('member').id, c.env.ANTHROPIC_API_KEY);
  if (!spent.ok && spent.why === 'used_up') {
    return fail(c, 429, 'rate_limited', `Photos, links and shows can be looked up ${READS_PER_DAY} times a day, and today's are used up. Try again tomorrow, or type it in.`);
  }
  if (!spent.ok) return fail(c, 503, 'show_lookup_off', "Looking up movies and shows isn't set up yet.");
  const r = await lookUpShow({ apiKey: spent.apiKey, tz: spent.tz, today: spent.today, ask, home: await householdPlace(db) });
  if (!r.ok && r.kind === 'refused') return fail(c, 422, 'show_refused', "Couldn't look that up.");
  if (!r.ok) return fail(c, 502, 'show_lookup_failed', `Couldn't look that up: ${r.reason}`);
  return c.json(cleanShowReading(r.raw, url, nowIso()));
}

shows.post('/shows/look-up', requireMember, async (c) => {
  // §7F.2 check order: signed in → the input → daily cap → key present → count the read → page, look-up, fields.
  const b = await body(c);
  const title = typeof b.title === 'string' ? b.title.trim() : '';
  const hasUrl = b.url !== undefined && b.url !== null && b.url !== '';
  if (!title === !hasUrl || title.length > SHOW_TITLE_MAX) return fail(c, 400, 'invalid_input', 'Type a title or paste a link.');
  if (hasUrl) {
    const url = typeof b.url === 'string' && b.url.length <= SHOW_URL_MAX ? readableLink(b.url) : null;
    if (!url) return fail(c, 400, 'invalid_input', "That link can't be read.");
    return lookUp(c, { by: 'link', url }, url);
  }
  const year = typeof b.year === 'string' && b.year.trim() && b.year.trim().length <= YEAR_MAX ? b.year.trim() : null;
  return lookUp(c, { by: 'title', title, year, kind: isOneOf(SHOW_KIND, b.kind) ? b.kind : null }, null);
});

shows.post('/shows/look-up-photo', requireMember, async (c) => {
  const photo = await photoBody(c);
  if (photo instanceof Response) return photo;
  return lookUp(c, { by: 'picture', bytes: photo.bytes, mediaType: photo.type }, null);
});

shows.get('/shows', requireMember, async (c) => {
  const rows = await all<ShowRow>(c.env.DB, 'SELECT * FROM shows WHERE deleted_at IS NULL ORDER BY created_at DESC');
  return c.json({
    want: rows.filter((r) => r.status === 'want').map(showFromRow),
    watched: rows.filter((r) => r.status === 'watched').sort((a, b) => (b.watched_at ?? '').localeCompare(a.watched_at ?? '')).map(showFromRow),
  });
});

const fields = (s: ShowInput) =>
  [s.title, showKey(s.title, s.year), s.kind, s.year, s.rt_critics, s.rt_audience, JSON.stringify(s.watch), s.checked_at, s.summary, s.note, s.url];

shows.post('/shows', requireMember, async (c) => {
  const input = parseShowInput(await body(c));
  if (typeof input === 'string') return fail(c, 400, 'invalid_input', input);
  const clash = await clashOf(c.env.DB, showKey(input.title, input.year));
  if (clash) return duplicate(c, clash);
  const id = newId('shw'), now = nowIso();
  await c.env.DB.prepare(
    `INSERT INTO shows (title, title_key, kind, year, rt_critics, rt_audience, watch, checked_at, summary, note, url,
       id, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'want', ?, ?, ?)`,
  ).bind(...fields(input), id, c.get('member').id, now, now).run();
  return c.json(showFromRow((await loadRow(c.env.DB, id))!), 201);
});

shows.get('/shows/:id', requireMember, async (c) => {
  const r = await loadRow(c.env.DB, c.req.param('id'));
  return r ? c.json(showFromRow(r)) : fail(c, 404, 'not_found', GONE);
});

shows.patch('/shows/:id', requireMember, async (c) => {
  const db = c.env.DB;
  const r = await loadRow(db, c.req.param('id'));
  if (!r) return fail(c, 404, 'not_found', GONE);
  const input = parseShowInput({ ...showFromRow(r), status: undefined, ...(await body(c)) });
  if (typeof input === 'string') return fail(c, 400, 'invalid_input', input);
  const clash = await clashOf(db, showKey(input.title, input.year), r.id);
  if (clash) return duplicate(c, clash);
  const status = input.status ?? r.status, now = nowIso();
  // Watching records who and when; going back to want forgets them; staying keeps them.
  const [watchedAt, watchedBy] = status === 'want' ? [null, null]
    : r.status === 'watched' ? [r.watched_at, r.watched_by] : [now, c.get('member').id];
  await db.prepare(
    `UPDATE shows SET title = ?, title_key = ?, kind = ?, year = ?, rt_critics = ?, rt_audience = ?, watch = ?, checked_at = ?,
       summary = ?, note = ?, url = ?, status = ?, watched_at = ?, watched_by = ?, updated_at = ? WHERE id = ?`,
  ).bind(...fields(input), status, watchedAt, watchedBy, now, r.id).run();
  return c.json(showFromRow((await loadRow(db, r.id))!));
});

shows.delete('/shows/:id', requireMember, async (c) => {
  const r = await loadRow(c.env.DB, c.req.param('id'));
  if (!r) return fail(c, 404, 'not_found', GONE);
  const now = nowIso();
  await c.env.DB.prepare('UPDATE shows SET deleted_at = ?, updated_at = ? WHERE id = ?').bind(now, now, r.id).run();
  return c.body(null, 204);
});
