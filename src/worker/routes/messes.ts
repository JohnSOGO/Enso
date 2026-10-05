// SPEC §7B.7 — whose mess? Reporting a mess with its photo (R2, private), That was me / Not me, an admin recording
// the outcome, settling a point, and who owes whom. The rules are src/shared/messes.ts; the asks are mess-asks.ts.
import { Hono, type Context } from 'hono';
import type { AppEnv } from '../env';
import { askedOf, balancesOf, messStatus, parseMessInput, type Mess, type MessRow } from '../../shared/messes';
import { MESS_SETTLE, isOneOf } from '../../shared/vocab';
import { activeMemberIds, all, first, newId, nowIso } from '../db';
import { body, fail, photoBody } from '../http';
import { requireMember, requireOwner } from '../session';
import { askAbout, deniedIdsOf, moveToDiscuss } from '../mess-asks';
import { putPhoto, servePhoto } from '../photo-store';

const GONE = 'That mess no longer exists.';
const ANSWERABLE = ['open', 'discuss'];

async function view(db: D1Database, m: MessRow, activeIds: string[]): Promise<Mess> {
  const denied = await deniedIdsOf(db, m.id);
  const chore = m.chore_id ? await first<{ title: string }>(db, 'SELECT title FROM chores WHERE id = ?', m.chore_id) : null;
  return {
    id: m.id, reportedBy: m.reported_by, choreId: m.chore_id, choreTitle: chore?.title ?? null, note: m.note,
    hasPhoto: m.photo_key !== null, createdAt: m.created_at, status: messStatus(m), claimedBy: m.claimed_by,
    assignedBy: m.assigned_by, deniedBy: denied, asked: askedOf(m, activeIds, denied),
  };
}

const loadRow = (db: D1Database, id: string) => first<MessRow>(db, 'SELECT * FROM messes WHERE id = ? AND deleted_at IS NULL', id);

/** A mess that is not deleted, or the 404 to send. */
async function loadMess(c: Context<AppEnv>): Promise<MessRow | Response> {
  return (await loadRow(c.env.DB, c.req.param('id')!)) ?? fail(c, 404, 'not_found', GONE);
}

const viewOf = async (c: Context<AppEnv>, id: string) => view(c.env.DB, (await loadRow(c.env.DB, id))!, await activeMemberIds(c.env.DB));
const answer = async (c: Context<AppEnv>, id: string) => c.json(await viewOf(c, id));

/** Removes a mess's photo from R2; the caller's UPDATE sets photo_key NULL. */
const dropPhoto = async (c: Context<AppEnv>, m: MessRow) => { if (m.photo_key) await c.env.PHOTOS.delete(m.photo_key); };

export const messes = new Hono<AppEnv>();

messes.get('/messes', requireMember, async (c) => {
  const db = c.env.DB, me = c.get('member'), admin = me.role === 'owner';
  const rows = await all<MessRow>(db,
    'SELECT * FROM messes WHERE deleted_at IS NULL AND settled_at IS NULL AND closed_at IS NULL ORDER BY created_at DESC, id');
  const owed = rows.filter((m) => messStatus(m) === 'owed');
  const shown = rows.filter((m) => messStatus(m) !== 'owed' || admin || m.reported_by === me.id || m.claimed_by === me.id);
  const active = await activeMemberIds(db);
  return c.json({ messes: await Promise.all(shown.map((m) => view(db, m, active))), balances: balancesOf(owed, me.id, admin) });
});

messes.post('/messes', requireMember, async (c) => {
  const db = c.env.DB;
  const input = parseMessInput({ note: c.req.query('note'), choreId: c.req.query('choreId') });
  if (typeof input === 'string') return fail(c, 400, 'invalid_input', input);
  if (input.choreId && !(await first(db, 'SELECT id FROM chores WHERE id = ? AND deleted_at IS NULL', input.choreId))) {
    return fail(c, 404, 'not_found', 'That chore no longer exists.');
  }
  const photo = await photoBody(c);
  if (photo instanceof Response) return photo;
  const id = newId('mes'), now = nowIso();
  const key = await putPhoto(c.env.PHOTOS, 'messes', id, photo.bytes, photo.type);
  await db.prepare('INSERT INTO messes (id, reported_by, chore_id, note, photo_key, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, c.get('member').id, input.choreId, input.note, key, now).run();
  await askAbout(c.env, (await loadRow(db, id))!, now);
  return c.json(await viewOf(c, id), 201);
});

messes.get('/messes/:id/photo', requireMember, async (c) => {
  const m = await loadMess(c);
  if (m instanceof Response) return m;
  return servePhoto(c, c.env.PHOTOS, m.photo_key, 'That photo no longer exists.');
});

/** That was me / Not me: an answerable mess, and not its reporter. */
function answerable(c: Context<AppEnv>, m: MessRow): Response | null {
  if (m.reported_by === c.get('member').id) return fail(c, 400, 'invalid_input', 'You reported this mess, so you are not asked about it.');
  if (!ANSWERABLE.includes(messStatus(m))) return fail(c, 409, 'mess_settled', 'That mess is already settled.');
  return null;
}

messes.post('/messes/:id/claim', requireMember, async (c) => {
  const m = await loadMess(c);
  if (m instanceof Response) return m;
  const no = answerable(c, m);
  if (no) return no;
  await c.env.DB.prepare('UPDATE messes SET claimed_by = ?, claimed_at = ?, assigned_by = NULL WHERE id = ?')
    .bind(c.get('member').id, nowIso(), m.id).run();
  return answer(c, m.id);
});

messes.post('/messes/:id/deny', requireMember, async (c) => {
  const m = await loadMess(c);
  if (m instanceof Response) return m;
  const no = answerable(c, m);
  if (no) return no;
  const db = c.env.DB, now = nowIso();
  await db.prepare('INSERT OR IGNORE INTO mess_denials (mess_id, member_id, created_at) VALUES (?, ?, ?)').bind(m.id, c.get('member').id, now).run();
  if (messStatus(m) === 'open' && askedOf(m, await activeMemberIds(db), await deniedIdsOf(db, m.id)).length === 0) {
    await moveToDiscuss(c.env, m, now);
  }
  return answer(c, m.id);
});

messes.post('/messes/:id/decide', requireMember, requireOwner, async (c) => {
  const m = await loadMess(c);
  if (m instanceof Response) return m;
  if (!['open', 'discuss', 'owed'].includes(messStatus(m))) return fail(c, 409, 'mess_settled', 'That mess is already settled.');
  const b = await body(c), db = c.env.DB, me = c.get('member').id, now = nowIso();
  if (b.memberId === null) {
    await dropPhoto(c, m);
    await db.prepare('UPDATE messes SET closed_at = ?, closed_by = ?, photo_key = NULL WHERE id = ?').bind(now, me, m.id).run();
    return answer(c, m.id);
  }
  if (typeof b.memberId !== 'string' || !(await activeMemberIds(db)).includes(b.memberId)) {
    return fail(c, 400, 'invalid_input', 'memberId must be an active member, or null for nobody\'s.');
  }
  if (b.memberId === m.reported_by) return fail(c, 400, 'invalid_input', 'The one who cleaned it up can\'t owe themselves.');
  await db.prepare('UPDATE messes SET claimed_by = ?, claimed_at = ?, assigned_by = ? WHERE id = ?').bind(b.memberId, now, me, m.id).run();
  return answer(c, m.id);
});

messes.post('/messes/:id/settle', requireMember, async (c) => {
  const m = await loadMess(c);
  if (m instanceof Response) return m;
  const how = (await body(c)).how, me = c.get('member');
  if (!isOneOf(MESS_SETTLE, how)) return fail(c, 400, 'invalid_input', `how must be one of: ${MESS_SETTLE.join(', ')}.`);
  if (messStatus(m) !== 'owed') return fail(c, 409, 'mess_settled', 'That mess isn\'t owed.');
  if (me.id !== m.reported_by && me.role !== 'owner') return fail(c, 403, 'forbidden', 'Only the one owed or an admin can settle it.');
  await dropPhoto(c, m);
  await c.env.DB.prepare('UPDATE messes SET settled_at = ?, settled_how = ?, settled_by = ?, photo_key = NULL WHERE id = ?')
    .bind(nowIso(), how, me.id, m.id).run();
  return answer(c, m.id);
});

messes.delete('/messes/:id', requireMember, async (c) => {
  const m = await loadMess(c);
  if (m instanceof Response) return m;
  const me = c.get('member');
  const mine = m.reported_by === me.id && ANSWERABLE.includes(messStatus(m));
  if (!mine && me.role !== 'owner') return fail(c, 403, 'forbidden', 'Only the one who reported it, before anyone answers, or an admin can delete a mess.');
  await dropPhoto(c, m);
  await c.env.DB.prepare('UPDATE messes SET deleted_at = ?, photo_key = NULL WHERE id = ?').bind(nowIso(), m.id).run();
  return c.body(null, 204);
});
