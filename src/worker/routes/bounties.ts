// SPEC §7B.8 — bounties: one-offs (post, I'll do it, Let it go, Done, delete), a chore's bounty, an admin's OK / Not
// yet on an earning, its done photo (R2 `earnings/{id}/…`, private, deleted on OK / Not yet / delete), a one-off's
// picture (R2 `bounties/{id}/…`, admins set it, deleted once paid or deleted), and everyone's score. The rules and words are src/shared/bounties.ts; an earning and its waiting
// push are written through earnings.ts. Never decides a state itself.
import { Hono, type Context } from 'hono';
import type { AppEnv } from '../env';
import {
  NEW_BOUNTY_TITLE, TAKE_HOURS, bountyStatus, doneError, newBountyMessage, parseBountyInput, parsePoints, scoreSince, scoresOf, takeError,
  type Bounty, type BountyRow, type Earning, type EarningRow,
} from '../../shared/bounties';
import { addMinutes, utcToLocal } from '../../shared/time';
import { activeMemberIds, all, first, householdTz, newId, nowIso } from '../db';
import { body, fail, photoBody } from '../http';
import { replacePhoto, servePhoto } from '../photo-store';
import { requireMember, requireOwner } from '../session';
import { pushDelivery } from '../deliveries';
import { sendPushDeliveries } from '../push';
import { earningInsert } from '../earnings';
import { finisherOf } from './chores';

const GONE = 'That bounty no longer exists.';
type Loaded = { b: BountyRow; earning: EarningRow | null };

const liveEarningOf = (db: D1Database, bountyId: string) =>
  first<EarningRow>(db, 'SELECT * FROM earnings WHERE bounty_id = ? AND dropped_at IS NULL', bountyId);

function view({ b, earning }: Loaded, now: string): Bounty {
  const status = bountyStatus(b, earning, now);
  return {
    id: b.id, title: b.title, note: b.note, points: b.points, createdBy: b.created_by, createdAt: b.created_at, status,
    takenBy: status === 'taken' ? b.taken_by : null, doneBy: earning?.member_id ?? null, earningId: earning?.id ?? null,
    hasPhoto: !!b.photo_key,
  };
}

async function load(db: D1Database, id: string): Promise<Loaded | null> {
  const b = await first<BountyRow>(db, 'SELECT * FROM bounties WHERE id = ? AND deleted_at IS NULL', id);
  return b && { b, earning: await liveEarningOf(db, b.id) };
}

/** A bounty that is not deleted, or the 404 to send. */
async function loadBounty(c: Context<AppEnv>): Promise<Loaded | Response> {
  return (await load(c.env.DB, c.req.param('id')!)) ?? fail(c, 404, 'not_found', GONE);
}

const answer = async (c: Context<AppEnv>, id: string, status = 200) =>
  c.json(view((await load(c.env.DB, id))!, nowIso()), status as 200);

const nameOf = async (db: D1Database, id: string | null) =>
  (id && (await first<{ n: string }>(db, 'SELECT display_name AS n FROM members WHERE id = ?', id))?.n) || 'Someone';

const refuse = (c: Context<AppEnv>, message: string) => fail(c, 409, 'bounty_state', message);

export const bounties = new Hono<AppEnv>();

bounties.get('/bounties', requireMember, async (c) => {
  const db = c.env.DB, now = nowIso(), tz = await householdTz(db), today = utcToLocal(now, tz).date;
  const rows = await all<BountyRow>(db, 'SELECT * FROM bounties WHERE deleted_at IS NULL ORDER BY created_at DESC, id');
  const live = await all<EarningRow>(db, 'SELECT * FROM earnings WHERE bounty_id IS NOT NULL AND dropped_at IS NULL');
  const byBounty = new Map(live.map((e) => [e.bounty_id!, e]));
  const shown = rows.map((b) => view({ b, earning: byBounty.get(b.id) ?? null }, now)).filter((b) => b.status !== 'paid');
  const waiting = await all<Earning>(db,
    `SELECT e.id, CASE WHEN e.bounty_id IS NULL THEN 'chore' ELSE 'bounty' END AS kind, COALESCE(b.title, ch.title) AS title,
            e.points, e.member_id AS memberId, e.done_at AS doneAt, e.photo_key IS NOT NULL AS hasPhoto
       FROM earnings e LEFT JOIN bounties b ON b.id = e.bounty_id
       LEFT JOIN chore_runs r ON r.id = e.chore_run_id LEFT JOIN chores ch ON ch.id = r.chore_id
      WHERE e.ok_at IS NULL AND e.dropped_at IS NULL AND b.deleted_at IS NULL
      ORDER BY e.done_at, e.id`);
  const earned = await all<EarningRow>(db,
    'SELECT * FROM earnings WHERE ok_at IS NOT NULL AND dropped_at IS NULL AND done_at >= ?', scoreSince(today, tz));
  return c.json({ bounties: shown, waiting: waiting.map((e) => ({ ...e, hasPhoto: !!e.hasPhoto })), scores: scoresOf(earned, await activeMemberIds(db), today, tz) });
});

bounties.post('/bounties', requireMember, requireOwner, async (c) => {
  const input = parseBountyInput(await body(c));
  if (typeof input === 'string') return fail(c, 400, 'invalid_input', input);
  const db = c.env.DB, me = c.get('member').id, id = newId('bty'), now = nowIso();
  const others = (await activeMemberIds(db)).filter((m) => m !== me);
  const pushes = others.map((m) => pushDelivery(db,
    { memberId: m, message: newBountyMessage(input.title, input.points), title: NEW_BOUNTY_TITLE, bountyId: id }, now));
  await db.batch([
    db.prepare('INSERT INTO bounties (id, title, note, points, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, input.title, input.note, input.points, me, now),
    ...pushes.map((p) => p.stmt),
  ]);
  if (pushes.length) await sendPushDeliveries(c.env, pushes.map((p) => p.id), now);
  return answer(c, id, 201);
});

bounties.post('/bounties/:id/take', requireMember, async (c) => {
  const l = await loadBounty(c);
  if (l instanceof Response) return l;
  const db = c.env.DB, me = c.get('member').id, now = nowIso(), lapsed = addMinutes(now, -TAKE_HOURS * 60);
  const other = await first<{ title: string }>(db,
    `SELECT title FROM bounties b WHERE taken_by = ? AND id != ? AND deleted_at IS NULL AND taken_at > ?
        AND NOT EXISTS (SELECT 1 FROM earnings e WHERE e.bounty_id = b.id AND e.dropped_at IS NULL)`, me, l.b.id, lapsed);
  const no = takeError(bountyStatus(l.b, l.earning, now), l.b.taken_by, me, await nameOf(db, l.b.taken_by), other?.title ?? null);
  if (no) return refuse(c, no);
  // Conditional, so two taps at once can't both hold it.
  const r = await db.prepare(`UPDATE bounties SET taken_by = ?, taken_at = ?
      WHERE id = ? AND (taken_by IS NULL OR taken_by = ? OR taken_at <= ?)`).bind(me, now, l.b.id, me, lapsed).run();
  if (!r.meta.changes) return refuse(c, 'Someone just took it.');
  return answer(c, l.b.id);
});

bounties.post('/bounties/:id/let-go', requireMember, async (c) => {
  const l = await loadBounty(c);
  if (l instanceof Response) return l;
  const me = c.get('member').id;
  if (bountyStatus(l.b, l.earning, nowIso()) !== 'taken' || l.b.taken_by !== me) return refuse(c, 'You are not on it.');
  await c.env.DB.prepare('UPDATE bounties SET taken_by = NULL, taken_at = NULL WHERE id = ?').bind(l.b.id).run();
  return answer(c, l.b.id);
});

bounties.post('/bounties/:id/done', requireMember, async (c) => {
  const l = await loadBounty(c);
  if (l instanceof Response) return l;
  const db = c.env.DB, me = c.get('member'), now = nowIso();
  const no = doneError(bountyStatus(l.b, l.earning, now), l.b.taken_by, me.id, await nameOf(db, l.b.taken_by));
  if (no) return refuse(c, no);
  const w = await earningInsert(db, { bountyId: l.b.id }, finisherOf(me), l.b.points, l.b.title, now);
  try {
    await db.batch(w.stmts);
  } catch (e) {
    if (!/UNIQUE|constraint/i.test(String(e))) throw e; // a real failure is a 500, never "someone said Done first"
    return refuse(c, 'That bounty is waiting for OK.'); // uq_earning_bounty: someone said Done first
  }
  if (w.pushIds.length) await sendPushDeliveries(c.env, w.pushIds, now);
  if (finisherOf(me).admin) await dropBountyPhoto(c, l.b.id); // ⚑ Q252: an admin's Done is paid at once
  return answer(c, l.b.id);
});

bounties.delete('/bounties/:id', requireMember, requireOwner, async (c) => {
  const l = await loadBounty(c);
  if (l instanceof Response) return l;
  if (bountyStatus(l.b, l.earning, nowIso()) === 'paid') return refuse(c, 'That bounty is already paid.');
  const db = c.env.DB, now = nowIso();
  await db.batch([
    db.prepare('UPDATE bounties SET deleted_at = ?, photo_key = NULL WHERE id = ?').bind(now, l.b.id),
    db.prepare('UPDATE earnings SET dropped_at = ?, photo_key = NULL WHERE bounty_id = ? AND dropped_at IS NULL').bind(now, l.b.id),
  ]);
  await dropPhoto(c, l.earning);
  if (l.b.photo_key) await c.env.PHOTOS.delete(l.b.photo_key);
  return c.body(null, 204);
});

bounties.put('/chores/:id/bounty', requireMember, requireOwner, async (c) => {
  const v = (await body(c)).points;
  const points = v === null ? null : parsePoints(v);
  if (typeof points === 'string') return fail(c, 400, 'invalid_input', `${points.slice(0, -1)}, or null for none.`);
  const id = c.req.param('id');
  const r = await c.env.DB.prepare('UPDATE chores SET bounty = ? WHERE id = ? AND deleted_at IS NULL').bind(points, id).run();
  if (!r.meta.changes) return fail(c, 404, 'not_found', 'That chore no longer exists.');
  return c.json({ choreId: id, bounty: points });
});

/** Removes a decided earning's done photo from R2; the caller's UPDATE sets photo_key NULL (§7B.8). */
const dropPhoto = async (c: Context<AppEnv>, e: EarningRow | null) => { if (e?.photo_key) await c.env.PHOTOS.delete(e.photo_key); };

/** A paid one-off's picture: the key read first, the row cleared, then the object deleted (§7B.8 ⚑ Q260). */
async function dropBountyPhoto(c: Context<AppEnv>, bountyId: string) {
  const key = (await first<{ k: string | null }>(c.env.DB, 'SELECT photo_key AS k FROM bounties WHERE id = ?', bountyId))?.k;
  if (!key) return;
  await c.env.DB.prepare('UPDATE bounties SET photo_key = NULL WHERE id = ?').bind(bountyId).run();
  await c.env.PHOTOS.delete(key);
}

/** A live, pending earning, or the refusal to send. */
async function pending(c: Context<AppEnv>): Promise<EarningRow | Response> {
  const e = await first<EarningRow>(c.env.DB, 'SELECT * FROM earnings WHERE id = ? AND dropped_at IS NULL', c.req.param('id'));
  if (!e) return fail(c, 404, 'not_found', 'That earning no longer exists.');
  return e.ok_at ? refuse(c, 'That is already OK\'d.') : e;
}

bounties.post('/earnings/:id/ok', requireMember, requireOwner, async (c) => {
  const e = await pending(c);
  if (e instanceof Response) return e;
  const who = (await body(c)).memberId ?? e.member_id;
  if (typeof who !== 'string' || !(await activeMemberIds(c.env.DB)).includes(who)) return fail(c, 400, 'invalid_input', 'memberId must be an active member.');
  await c.env.DB.prepare('UPDATE earnings SET member_id = ?, ok_by = ?, ok_at = ?, photo_key = NULL WHERE id = ?')
    .bind(who, c.get('member').id, nowIso(), e.id).run();
  await dropPhoto(c, e);
  if (e.bounty_id) await dropBountyPhoto(c, e.bounty_id);
  return c.body(null, 204);
});

bounties.post('/earnings/:id/not-yet', requireMember, requireOwner, async (c) => {
  const e = await pending(c);
  if (e instanceof Response) return e;
  const db = c.env.DB, now = nowIso();
  const stmts = [db.prepare('UPDATE earnings SET dropped_at = ?, photo_key = NULL WHERE id = ?').bind(now, e.id)];
  // ⚑ Q251: a one-off goes back to the one who said Done, as a fresh dib.
  if (e.bounty_id) stmts.push(db.prepare('UPDATE bounties SET taken_by = ?, taken_at = ? WHERE id = ?').bind(e.member_id, now, e.bounty_id));
  await db.batch(stmts);
  await dropPhoto(c, e);
  return c.body(null, 204);
});

bounties.put('/earnings/:id/photo', requireMember, async (c) => {
  const e = await pending(c);
  if (e instanceof Response) return e;
  if (e.member_id !== c.get('member').id) return fail(c, 403, 'forbidden', 'Only the one who did it can add the photo.');
  const photo = await photoBody(c);
  if (photo instanceof Response) return photo;
  await replacePhoto(c.env.PHOTOS, 'earnings', e.id, photo.bytes, photo.type, e.photo_key,
    (key) => c.env.DB.prepare('UPDATE earnings SET photo_key = ? WHERE id = ?').bind(key, e.id).run());
  return c.body(null, 204);
});

bounties.get('/earnings/:id/photo', requireMember, async (c) => {
  const e = await first<EarningRow>(c.env.DB, 'SELECT * FROM earnings WHERE id = ? AND dropped_at IS NULL', c.req.param('id'));
  return servePhoto(c, c.env.PHOTOS, e?.photo_key, 'That photo no longer exists.');
});

bounties.put('/bounties/:id/photo', requireMember, requireOwner, async (c) => {
  const l = await loadBounty(c);
  if (l instanceof Response) return l;
  if (bountyStatus(l.b, l.earning, nowIso()) === 'paid') return refuse(c, 'That bounty is already paid.');
  const photo = await photoBody(c);
  if (photo instanceof Response) return photo;
  await replacePhoto(c.env.PHOTOS, 'bounties', l.b.id, photo.bytes, photo.type, l.b.photo_key,
    (key) => c.env.DB.prepare('UPDATE bounties SET photo_key = ? WHERE id = ?').bind(key, l.b.id).run());
  return c.body(null, 204);
});

bounties.get('/bounties/:id/photo', requireMember, async (c) => {
  const b = await first<BountyRow>(c.env.DB, 'SELECT * FROM bounties WHERE id = ? AND deleted_at IS NULL', c.req.param('id'));
  return servePhoto(c, c.env.PHOTOS, b?.photo_key, 'That picture no longer exists.');
});
