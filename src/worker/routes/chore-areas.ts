// SPEC §7B.6 — what done looks like: a chore's areas and their reference photos (R2, private). Anyone may read
// them; the chore's creator or an admin changes them (§6.3, Q163). The rules (limits, validation, the wire type) are src/shared/chore-areas.ts.
import { Hono, type Context } from 'hono';
import type { AppEnv } from '../env';
import { AREAS_MAX, AREA_PHOTOS_MAX, parseAreaInput, type ChoreArea } from '../../shared/chore-areas';
import { all, first, newId, nowIso, run } from '../db';
import { body, fail, photoBody } from '../http';
import { requireMember } from '../session';
import { canChange, cannotChangeText } from '../../shared/roles';
import { putPhoto, servePhoto } from '../photo-store';

interface AreaRow { id: string; chore_id: string; name: string; expectations: string; position: number; updated_at: string }
interface PhotoRow { id: string; area_id: string; photo_key: string }
/** Either row with its chore's creator, for §6.3. */
type Owned<T> = T & { chore_created_by: string | null };

/** §6.3 — a write needs the chore's creator or an admin. → the 403 to send, or null. */
const refuse = (c: Context<AppEnv>, choreCreatedBy: string | null) =>
  canChange(choreCreatedBy, c.get('member')) ? null : fail(c, 403, 'forbidden', cannotChangeText('chore'));

const AREA_GONE = 'That area no longer exists.';

async function areaView(db: D1Database, a: AreaRow): Promise<ChoreArea> {
  const photos = await all<{ id: string }>(db, 'SELECT id FROM chore_area_photos WHERE area_id = ? ORDER BY created_at, id', a.id);
  return { id: a.id, choreId: a.chore_id, name: a.name, expectations: JSON.parse(a.expectations), photos: photos.map((p) => p.id), updatedAt: a.updated_at };
}

/** An area whose chore still exists, or the 404 to send (403 for a write by someone who can't change the chore). */
async function loadArea(c: Context<AppEnv>, id: string, forWrite: boolean): Promise<AreaRow | Response> {
  const a = await first<Owned<AreaRow>>(c.env.DB,
    `SELECT a.*, ch.created_by AS chore_created_by FROM chore_areas a JOIN chores ch ON ch.id = a.chore_id
      WHERE a.id = ? AND ch.deleted_at IS NULL`, id);
  if (!a) return fail(c, 404, 'not_found', AREA_GONE);
  return (forWrite && refuse(c, a.chore_created_by)) || a;
}

const loadAreaById = async (c: Context<AppEnv>, id: string) => {
  const a = await loadArea(c, id, false);
  return a instanceof Response ? a : areaView(c.env.DB, a);
};

/** How many areas each chore has (§7B.6 `areaCount` on /chores and /chores/today). */
export async function areaCounts(db: D1Database): Promise<Map<string, number>> {
  const rows = await all<{ chore_id: string; n: number }>(db, 'SELECT chore_id, COUNT(*) AS n FROM chore_areas GROUP BY chore_id');
  return new Map(rows.map((r) => [r.chore_id, r.n]));
}

/** Deleting a chore: the statements that delete its areas and photo rows, and the R2 keys to remove after them. */
export async function choreAreaDeletes(db: D1Database, choreId: string): Promise<{ stmts: D1PreparedStatement[]; keys: string[] }> {
  const keys = await all<{ photo_key: string }>(db,
    'SELECT p.photo_key FROM chore_area_photos p JOIN chore_areas a ON a.id = p.area_id WHERE a.chore_id = ?', choreId);
  return {
    stmts: [
      db.prepare('DELETE FROM chore_area_photos WHERE area_id IN (SELECT id FROM chore_areas WHERE chore_id = ?)').bind(choreId),
      db.prepare('DELETE FROM chore_areas WHERE chore_id = ?').bind(choreId),
    ],
    keys: keys.map((k) => k.photo_key),
  };
}

export const choreAreas = new Hono<AppEnv>();

choreAreas.get('/chores/:id/areas', requireMember, async (c) => {
  const db = c.env.DB, choreId = c.req.param('id');
  if (!(await first(db, 'SELECT id FROM chores WHERE id = ? AND deleted_at IS NULL', choreId))) return fail(c, 404, 'not_found', 'That chore no longer exists.');
  const rows = await all<AreaRow>(db, 'SELECT * FROM chore_areas WHERE chore_id = ? ORDER BY position', choreId);
  return c.json(await Promise.all(rows.map((a) => areaView(db, a))));
});

choreAreas.post('/chores/:id/areas', requireMember, async (c) => {
  const db = c.env.DB, choreId = c.req.param('id');
  const chore = await first<{ created_by: string | null }>(db, 'SELECT created_by FROM chores WHERE id = ? AND deleted_at IS NULL', choreId);
  if (!chore) return fail(c, 404, 'not_found', 'That chore no longer exists.');
  const no = refuse(c, chore.created_by);
  if (no) return no;
  const input = parseAreaInput(await body(c));
  if (typeof input === 'string') return fail(c, 400, 'invalid_input', input);
  const at = (await first<{ n: number; last: number | null }>(db, 'SELECT COUNT(*) AS n, MAX(position) AS last FROM chore_areas WHERE chore_id = ?', choreId))!;
  if (at.n >= AREAS_MAX) return fail(c, 400, 'invalid_input', `A chore has at most ${AREAS_MAX} areas.`);
  const id = newId('cha'), now = nowIso();
  await run(db, `INSERT INTO chore_areas (id, chore_id, name, expectations, position, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, id, choreId, input.name, JSON.stringify(input.expectations), (at.last ?? -1) + 1, c.get('member').id, now, now);
  return c.json(await loadAreaById(c, id), 201);
});

choreAreas.patch('/chore-areas/:id', requireMember, async (c) => {
  const a = await loadArea(c, c.req.param('id'), true);
  if (a instanceof Response) return a;
  const input = parseAreaInput(await body(c), { name: a.name, expectations: JSON.parse(a.expectations) });
  if (typeof input === 'string') return fail(c, 400, 'invalid_input', input);
  await run(c.env.DB, 'UPDATE chore_areas SET name = ?, expectations = ?, updated_at = ? WHERE id = ?',
    input.name, JSON.stringify(input.expectations), nowIso(), a.id);
  return c.json(await loadAreaById(c, a.id));
});

choreAreas.delete('/chore-areas/:id', requireMember, async (c) => {
  const a = await loadArea(c, c.req.param('id'), true);
  if (a instanceof Response) return a;
  const db = c.env.DB;
  const keys = await all<{ photo_key: string }>(db, 'SELECT photo_key FROM chore_area_photos WHERE area_id = ?', a.id);
  await db.batch([
    db.prepare('DELETE FROM chore_area_photos WHERE area_id = ?').bind(a.id),
    db.prepare('DELETE FROM chore_areas WHERE id = ?').bind(a.id),
  ]);
  if (keys.length) await c.env.PHOTOS.delete(keys.map((k) => k.photo_key));
  return c.body(null, 204);
});

choreAreas.post('/chore-areas/:id/photos', requireMember, async (c) => {
  const a = await loadArea(c, c.req.param('id'), true);
  if (a instanceof Response) return a;
  const db = c.env.DB;
  const n = (await first<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM chore_area_photos WHERE area_id = ?', a.id))!.n;
  if (n >= AREA_PHOTOS_MAX) return fail(c, 400, 'invalid_input', `An area has at most ${AREA_PHOTOS_MAX} photos.`);
  const photo = await photoBody(c);
  if (photo instanceof Response) return photo;
  const key = await putPhoto(c.env.PHOTOS, 'chore-areas', a.id, photo.bytes, photo.type), now = nowIso();
  await db.batch([
    db.prepare('INSERT INTO chore_area_photos (id, area_id, photo_key, created_at) VALUES (?, ?, ?, ?)').bind(newId('cap'), a.id, key, now),
    db.prepare('UPDATE chore_areas SET updated_at = ? WHERE id = ?').bind(now, a.id),
  ]);
  return c.json(await loadAreaById(c, a.id), 201);
});

/** A photo whose area and chore still exist, or the 404 to send (403 for a write, as loadArea). */
async function loadPhoto(c: Context<AppEnv>, forWrite: boolean): Promise<PhotoRow | Response> {
  const p = await first<Owned<PhotoRow>>(c.env.DB,
    `SELECT p.*, ch.created_by AS chore_created_by FROM chore_area_photos p JOIN chore_areas a ON a.id = p.area_id
      JOIN chores ch ON ch.id = a.chore_id WHERE p.id = ? AND ch.deleted_at IS NULL`, c.req.param('id'));
  if (!p) return fail(c, 404, 'not_found', 'That photo no longer exists.');
  return (forWrite && refuse(c, p.chore_created_by)) || p;
}

choreAreas.get('/chore-area-photos/:id', requireMember, async (c) => {
  const p = await loadPhoto(c, false);
  if (p instanceof Response) return p;
  return servePhoto(c, c.env.PHOTOS, p.photo_key, 'That photo no longer exists.');
});

choreAreas.delete('/chore-area-photos/:id', requireMember, async (c) => {
  const p = await loadPhoto(c, true);
  if (p instanceof Response) return p;
  const db = c.env.DB;
  await db.batch([
    db.prepare('DELETE FROM chore_area_photos WHERE id = ?').bind(p.id),
    db.prepare('UPDATE chore_areas SET updated_at = ? WHERE id = ?').bind(nowIso(), p.area_id),
  ]);
  await c.env.PHOTOS.delete(p.photo_key);
  return c.body(null, 204);
});
