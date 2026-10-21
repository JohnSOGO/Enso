// SPEC §7.9b — saved places, the household's address book. Anyone may read them and add one (⚑ Q362); the place's
// creator or an admin changes or deletes it (§6.3). Validates and persists; every rule is src/shared/places.ts.
import { Hono, type Context } from 'hono';
import type { AppEnv } from '../env';
import { PLACES_MAX, cleanPlace, type Place } from '../../shared/places';
import { all, first, newId, nowIso, parseJson, run } from '../db';
import { body, fail } from '../http';
import { requireMember } from '../session';
import { canChange, cannotChangeText } from '../../shared/roles';

interface PlaceRow { id: string; name: string; address: string; notes: string | null; words: string; created_by: string | null; updated_at: string }

const placeView = (r: PlaceRow): Place => ({
  id: r.id, name: r.name, address: r.address, notes: r.notes, words: parseJson<string[]>(r.words, []), createdBy: r.created_by, updatedAt: r.updated_at,
});

const byId = (db: D1Database, id: string) => first<PlaceRow>(db, 'SELECT * FROM places WHERE id = ?', id);

/** A place to change, or the 404 / 403 to send. */
async function loadForWrite(c: Context<AppEnv>): Promise<PlaceRow | Response> {
  const r = await byId(c.env.DB, c.req.param('id')!);
  if (!r) return fail(c, 404, 'not_found', 'That place no longer exists.');
  return canChange(r.created_by, c.get('member')) ? r : fail(c, 403, 'forbidden', cannotChangeText('place'));
}

export const places = new Hono<AppEnv>();

places.get('/places', requireMember, async (c) => {
  const rows = await all<PlaceRow>(c.env.DB, 'SELECT * FROM places ORDER BY name COLLATE NOCASE, id');
  return c.json(rows.map(placeView));
});

places.post('/places', requireMember, async (c) => {
  const db = c.env.DB;
  const input = cleanPlace(await body(c));
  if (typeof input === 'string') return fail(c, 400, 'invalid_input', input);
  if ((await first<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM places'))!.n >= PLACES_MAX) {
    return fail(c, 400, 'invalid_input', `A household keeps at most ${PLACES_MAX} places.`);
  }
  const id = newId('plc'), now = nowIso();
  await run(db, 'INSERT INTO places (id, name, address, notes, words, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    id, input.name, input.address, input.notes, JSON.stringify(input.words), c.get('member').id, now, now);
  return c.json(placeView((await byId(db, id))!), 201);
});

places.patch('/places/:id', requireMember, async (c) => {
  const r = await loadForWrite(c);
  if (r instanceof Response) return r;
  const input = cleanPlace(await body(c), { name: r.name, address: r.address, notes: r.notes, words: parseJson<string[]>(r.words, []) });
  if (typeof input === 'string') return fail(c, 400, 'invalid_input', input);
  const db = c.env.DB;
  await run(db, 'UPDATE places SET name = ?, address = ?, notes = ?, words = ?, updated_at = ? WHERE id = ?',
    input.name, input.address, input.notes, JSON.stringify(input.words), nowIso(), r.id);
  return c.json(placeView((await byId(db, r.id))!));
});

/** Events keep the address a place filled: nothing points at a place. */
places.delete('/places/:id', requireMember, async (c) => {
  const r = await loadForWrite(c);
  if (r instanceof Response) return r;
  await run(c.env.DB, 'DELETE FROM places WHERE id = ?', r.id);
  return c.body(null, 204);
});
