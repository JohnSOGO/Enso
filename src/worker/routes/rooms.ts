// SPEC §7B.6 — rooms and what done looks like: rooms, their sections (areas) and the sections' reference photos (R2,
// private). Anyone may read them; an admin adds a room (⚑ Q264); the room's creator or an admin changes it (§6.3, Q163). The rules (limits,
// validation, the wire types) are src/shared/rooms.ts.
import { Hono, type Context } from 'hono';
import type { AppEnv } from '../env';
import { AREAS_MAX, AREA_PHOTOS_MAX, ROOMS_MAX, parseAreaInput, parseRoomInput, type Room, type RoomArea } from '../../shared/rooms';
import { all, first, newId, nowIso, run } from '../db';
import { body, fail, photoBody } from '../http';
import { requireMember, requireOwner } from '../session';
import { canChange, cannotChangeText } from '../../shared/roles';
import { putPhoto, servePhoto } from '../photo-store';

interface RoomRow { id: string; name: string; position: number; created_by: string | null; updated_at: string }
interface AreaRow { id: string; room_id: string; name: string; expectations: string; position: number; updated_at: string }
interface PhotoRow { id: string; area_id: string; photo_key: string }
/** An area or photo row with its room's creator, for §6.3. */
type Owned<T> = T & { room_created_by: string | null };

/** §6.3 — a write needs the room's creator or an admin. → the 403 to send, or null. */
const refuse = (c: Context<AppEnv>, roomCreatedBy: string | null) =>
  canChange(roomCreatedBy, c.get('member')) ? null : fail(c, 403, 'forbidden', cannotChangeText('room'));

const ROOM_GONE = 'That room no longer exists.';
const AREA_GONE = 'That area no longer exists.';

/** How many areas each room has. */
async function areaCounts(db: D1Database): Promise<Map<string, number>> {
  const rows = await all<{ room_id: string; n: number }>(db, 'SELECT room_id, COUNT(*) AS n FROM room_areas GROUP BY room_id');
  return new Map(rows.map((r) => [r.room_id, r.n]));
}

/** How many areas each chore's room has (`areaCount` on /chores and /chores/today, §7B.6). */
export async function choreAreaCounts(db: D1Database): Promise<Map<string, number>> {
  const rows = await all<{ id: string; n: number }>(db,
    'SELECT ch.id, COUNT(a.id) AS n FROM chores ch JOIN room_areas a ON a.room_id = ch.room_id GROUP BY ch.id');
  return new Map(rows.map((r) => [r.id, r.n]));
}

/** A chore's `roomId` from a POST/PATCH body: undefined = absent, null = none, else an existing room; a string = the 400. */
export async function choreRoomId(db: D1Database, b: Record<string, unknown>): Promise<{ roomId: string | null | undefined } | string> {
  if (b.roomId === undefined) return { roomId: undefined };
  if (b.roomId === null || b.roomId === '') return { roomId: null };
  if (typeof b.roomId !== 'string' || !(await first(db, 'SELECT id FROM rooms WHERE id = ?', b.roomId))) return 'roomId must be a room of this household.';
  return { roomId: b.roomId };
}

const roomView = (r: RoomRow, areaCount: number): Room =>
  ({ id: r.id, name: r.name, areaCount, createdBy: r.created_by, updatedAt: r.updated_at });

async function areaView(db: D1Database, a: AreaRow): Promise<RoomArea> {
  const photos = await all<{ id: string }>(db, 'SELECT id FROM room_area_photos WHERE area_id = ? ORDER BY created_at, id', a.id);
  return { id: a.id, roomId: a.room_id, name: a.name, expectations: JSON.parse(a.expectations), photos: photos.map((p) => p.id), updatedAt: a.updated_at };
}

/** A room, or the 404 to send (403 for a write by someone who can't change it). */
async function loadRoom(c: Context<AppEnv>, forWrite: boolean): Promise<RoomRow | Response> {
  const r = await first<RoomRow>(c.env.DB, 'SELECT * FROM rooms WHERE id = ?', c.req.param('id'));
  if (!r) return fail(c, 404, 'not_found', ROOM_GONE);
  return (forWrite && refuse(c, r.created_by)) || r;
}

/** An area, or the 404 to send (403 for a write by someone who can't change its room). */
async function loadArea(c: Context<AppEnv>, id: string, forWrite: boolean): Promise<AreaRow | Response> {
  const a = await first<Owned<AreaRow>>(c.env.DB,
    'SELECT a.*, r.created_by AS room_created_by FROM room_areas a JOIN rooms r ON r.id = a.room_id WHERE a.id = ?', id);
  if (!a) return fail(c, 404, 'not_found', AREA_GONE);
  return (forWrite && refuse(c, a.room_created_by)) || a;
}

const loadAreaById = async (c: Context<AppEnv>, id: string) => {
  const a = await loadArea(c, id, false);
  return a instanceof Response ? a : areaView(c.env.DB, a);
};

export const rooms = new Hono<AppEnv>();

rooms.get('/rooms', requireMember, async (c) => {
  const db = c.env.DB, counts = await areaCounts(db);
  const rows = await all<RoomRow>(db, 'SELECT * FROM rooms ORDER BY position');
  return c.json(rows.map((r) => roomView(r, counts.get(r.id) ?? 0)));
});

rooms.post('/rooms', requireMember, requireOwner, async (c) => {
  const db = c.env.DB;
  const input = parseRoomInput(await body(c));
  if (typeof input === 'string') return fail(c, 400, 'invalid_input', input);
  const at = (await first<{ n: number; last: number | null }>(db, 'SELECT COUNT(*) AS n, MAX(position) AS last FROM rooms'))!;
  if (at.n >= ROOMS_MAX) return fail(c, 400, 'invalid_input', `A household has at most ${ROOMS_MAX} rooms.`);
  const id = newId('rom'), now = nowIso();
  await run(db, 'INSERT INTO rooms (id, name, position, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    id, input.name, (at.last ?? -1) + 1, c.get('member').id, now, now);
  return c.json(roomView((await first<RoomRow>(db, 'SELECT * FROM rooms WHERE id = ?', id))!, 0), 201);
});

rooms.patch('/rooms/:id', requireMember, async (c) => {
  const r = await loadRoom(c, true);
  if (r instanceof Response) return r;
  const input = parseRoomInput(await body(c));
  if (typeof input === 'string') return fail(c, 400, 'invalid_input', input);
  const db = c.env.DB;
  await run(db, 'UPDATE rooms SET name = ?, updated_at = ? WHERE id = ?', input.name, nowIso(), r.id);
  return c.json(roomView((await first<RoomRow>(db, 'SELECT * FROM rooms WHERE id = ?', r.id))!, (await areaCounts(db)).get(r.id) ?? 0));
});

/** Deleting a room takes its areas and their photos (rows, then the R2 objects); its chores keep going with no room. */
rooms.delete('/rooms/:id', requireMember, async (c) => {
  const r = await loadRoom(c, true);
  if (r instanceof Response) return r;
  const db = c.env.DB;
  const keys = await all<{ photo_key: string }>(db,
    'SELECT p.photo_key FROM room_area_photos p JOIN room_areas a ON a.id = p.area_id WHERE a.room_id = ?', r.id);
  await db.batch([
    db.prepare('UPDATE chores SET room_id = NULL WHERE room_id = ?').bind(r.id),
    db.prepare('DELETE FROM room_area_photos WHERE area_id IN (SELECT id FROM room_areas WHERE room_id = ?)').bind(r.id),
    db.prepare('DELETE FROM room_areas WHERE room_id = ?').bind(r.id),
    db.prepare('DELETE FROM rooms WHERE id = ?').bind(r.id),
  ]);
  if (keys.length) await c.env.PHOTOS.delete(keys.map((k) => k.photo_key));
  return c.body(null, 204);
});

rooms.get('/rooms/:id/areas', requireMember, async (c) => {
  const r = await loadRoom(c, false);
  if (r instanceof Response) return r;
  const db = c.env.DB;
  const rows = await all<AreaRow>(db, 'SELECT * FROM room_areas WHERE room_id = ? ORDER BY position', r.id);
  return c.json(await Promise.all(rows.map((a) => areaView(db, a))));
});

rooms.post('/rooms/:id/areas', requireMember, async (c) => {
  const r = await loadRoom(c, true);
  if (r instanceof Response) return r;
  const db = c.env.DB;
  const input = parseAreaInput(await body(c));
  if (typeof input === 'string') return fail(c, 400, 'invalid_input', input);
  const at = (await first<{ n: number; last: number | null }>(db, 'SELECT COUNT(*) AS n, MAX(position) AS last FROM room_areas WHERE room_id = ?', r.id))!;
  if (at.n >= AREAS_MAX) return fail(c, 400, 'invalid_input', `A room has at most ${AREAS_MAX} areas.`);
  const id = newId('cha'), now = nowIso();
  await run(db, `INSERT INTO room_areas (id, room_id, name, expectations, position, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, id, r.id, input.name, JSON.stringify(input.expectations), (at.last ?? -1) + 1, c.get('member').id, now, now);
  return c.json(await loadAreaById(c, id), 201);
});

rooms.patch('/room-areas/:id', requireMember, async (c) => {
  const a = await loadArea(c, c.req.param('id'), true);
  if (a instanceof Response) return a;
  const input = parseAreaInput(await body(c), { name: a.name, expectations: JSON.parse(a.expectations) });
  if (typeof input === 'string') return fail(c, 400, 'invalid_input', input);
  await run(c.env.DB, 'UPDATE room_areas SET name = ?, expectations = ?, updated_at = ? WHERE id = ?',
    input.name, JSON.stringify(input.expectations), nowIso(), a.id);
  return c.json(await loadAreaById(c, a.id));
});

rooms.delete('/room-areas/:id', requireMember, async (c) => {
  const a = await loadArea(c, c.req.param('id'), true);
  if (a instanceof Response) return a;
  const db = c.env.DB;
  const keys = await all<{ photo_key: string }>(db, 'SELECT photo_key FROM room_area_photos WHERE area_id = ?', a.id);
  await db.batch([
    db.prepare('DELETE FROM room_area_photos WHERE area_id = ?').bind(a.id),
    db.prepare('DELETE FROM room_areas WHERE id = ?').bind(a.id),
  ]);
  if (keys.length) await c.env.PHOTOS.delete(keys.map((k) => k.photo_key));
  return c.body(null, 204);
});

rooms.post('/room-areas/:id/photos', requireMember, async (c) => {
  const a = await loadArea(c, c.req.param('id'), true);
  if (a instanceof Response) return a;
  const db = c.env.DB;
  const n = (await first<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM room_area_photos WHERE area_id = ?', a.id))!.n;
  if (n >= AREA_PHOTOS_MAX) return fail(c, 400, 'invalid_input', `An area has at most ${AREA_PHOTOS_MAX} photos.`);
  const photo = await photoBody(c);
  if (photo instanceof Response) return photo;
  const key = await putPhoto(c.env.PHOTOS, 'chore-areas', a.id, photo.bytes, photo.type), now = nowIso();
  await db.batch([
    db.prepare('INSERT INTO room_area_photos (id, area_id, photo_key, created_at) VALUES (?, ?, ?, ?)').bind(newId('cap'), a.id, key, now),
    db.prepare('UPDATE room_areas SET updated_at = ? WHERE id = ?').bind(now, a.id),
  ]);
  return c.json(await loadAreaById(c, a.id), 201);
});

/** A photo whose area still exists, or the 404 to send (403 for a write, as loadArea). */
async function loadPhoto(c: Context<AppEnv>, forWrite: boolean): Promise<PhotoRow | Response> {
  const p = await first<Owned<PhotoRow>>(c.env.DB,
    `SELECT p.*, r.created_by AS room_created_by FROM room_area_photos p JOIN room_areas a ON a.id = p.area_id
      JOIN rooms r ON r.id = a.room_id WHERE p.id = ?`, c.req.param('id'));
  if (!p) return fail(c, 404, 'not_found', 'That photo no longer exists.');
  return (forWrite && refuse(c, p.room_created_by)) || p;
}

rooms.get('/room-area-photos/:id', requireMember, async (c) => {
  const p = await loadPhoto(c, false);
  if (p instanceof Response) return p;
  return servePhoto(c, c.env.PHOTOS, p.photo_key, 'That photo no longer exists.');
});

rooms.delete('/room-area-photos/:id', requireMember, async (c) => {
  const p = await loadPhoto(c, true);
  if (p instanceof Response) return p;
  const db = c.env.DB;
  await db.batch([
    db.prepare('DELETE FROM room_area_photos WHERE id = ?').bind(p.id),
    db.prepare('UPDATE room_areas SET updated_at = ? WHERE id = ?').bind(nowIso(), p.area_id),
  ]);
  await c.env.PHOTOS.delete(p.photo_key);
  return c.body(null, 204);
});
