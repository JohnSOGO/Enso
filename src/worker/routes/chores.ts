// SPEC §7B, §10 — chores: CRUD, today's runs, step done/undo, and edit re-plan persistence; `bounty` on each chore and
// run, and a run change's earning written or dropped in the same batch through earnings.ts (§7B.8); `roomId` checked and `areaCount` read through routes/rooms.ts (§7B.6).
// Every rule (turns, planning, advance/undo, re-plan, validation) is src/shared/chores.ts;
// this route loads rows, calls it, and writes each result in ONE db.batch.
import { Hono, type Context } from 'hono';
import type { AppEnv, Env } from '../env';
import {
  advanceRun, assigneeFor, choreFromRow, parseChoreInput, replanRun, showsOnToday, stepPerson, undoRun,
  type Chore, type ChoreInput, type ChoreRow, type ChoreRun, type RunChange,
} from '../../shared/chores';
import { MATERIALIZE_AHEAD_H, type FireRow } from '../../shared/engine';
import type { Place } from '../../shared/sun';
import { addDays, addMinutes, utcToLocal } from '../../shared/time';
import { activeMemberIds, all, first, householdPlace, newId, nowIso } from '../db';
import { body, fail } from '../http';
import { requireMember } from '../session';
import { canChange } from '../../shared/roles';
import { choreRunInserts, insertFire, loadChoreRun, updateChoreRun, updateFire } from '../fire-rows';
import { choreAreaCounts as areaCounts, choreRoomId } from './rooms';
import { runEarningWrites, type Finisher } from '../earnings';
import { sendPushDeliveries } from '../push';
import { isAdmin } from '../../shared/roles';
import type { Role } from '../../shared/vocab';

const householdTz = async (db: D1Database) => (await first<{ timezone: string }>(db, 'SELECT timezone FROM settings WHERE id = 1'))!.timezone;
const openFireOf = (db: D1Database, runId: string) =>
  first<FireRow>(db, `SELECT * FROM fires WHERE chore_run_id = ? AND state != 'closed'`, runId);

function choreView(row: ChoreRow, today: string, active: string[], areaCount: number) {
  const c = choreFromRow(row);
  return {
    id: c.id, title: c.title, doneMeans: c.done_means, days: c.days, timing: c.timing, time: c.time, sunOffsetMin: c.sun_offset_min, nudge: c.nudge,
    people: c.people, steps: c.steps, channels: c.channels, renotifyMin: c.renotify_min, createdBy: row.created_by,
    thisWeek: assigneeFor(c, today, active), nextWeek: assigneeFor(c, addDays(today, 7), active), areaCount,
    bounty: row.bounty, roomId: row.room_id,
  };
}

function runView(chore: Chore, run: ChoreRun, open: Pick<FireRow, 'due_at' | 'state'> | null, areaCount: number, bounty: number | null) {
  return {
    id: run.id, choreId: chore.id, title: chore.title, doneMeans: chore.done_means, timing: chore.timing, time: chore.time, sunOffsetMin: chore.sun_offset_min,
    step: run.step, steps: chore.steps, assigneeId: run.assignee_id, personId: stepPerson(chore, run),
    doneAt: run.done_at, doneBy: run.done_by,
    nextDueAt: open?.state === 'scheduled' ? open.due_at : null, ringing: open?.state === 'ringing', areaCount, bounty,
  };
}

/** The statements that persist one run change. The open fire closes BEFORE any new one (uq_chore_run_open). */
function changeStatements(db: D1Database, ch: RunChange, now: string): D1PreparedStatement[] {
  const stmts = [updateChoreRun(db, ch.run, now)];
  if (ch.closeFire) stmts.push(updateFire(db, ch.closeFire));
  if (ch.newFire) stmts.push(insertFire(db, ch.newFire));
  return stmts;
}

type StepResult = { run: ChoreRun; chore: Chore; change: RunChange; bounty: number | null } | { error: 'not_found' | 'already_done' | 'nothing_to_undo' };

/** One step done or undone, with its earning written or dropped in the same batch (§7B.8); the waiting push after. */
async function stepRun(env: Env, runId: string, member: Finisher, now: string, act: (chore: Chore, run: ChoreRun, open: FireRow | null, tz: string, place: Place | null) => RunChange | { error: 'already_done' | 'nothing_to_undo' }): Promise<StepResult> {
  const db = env.DB;
  const cr = await loadChoreRun(db, runId);
  if (!cr) return { error: 'not_found' };
  const r = act(cr.chore, cr.run, await openFireOf(db, runId), await householdTz(db), await householdPlace(db));
  if ('error' in r) return r;
  const earn = await runEarningWrites(db, cr.chore.id, cr.run, r.run, member, now);
  await db.batch([...changeStatements(db, r, now), ...earn.stmts]);
  if (earn.pushIds.length) await sendPushDeliveries(env, earn.pushIds, now);
  if (earn.dropKey) await env.PHOTOS.delete(earn.dropKey);
  return { run: r.run, chore: cr.chore, change: r, bounty: earn.bounty };
}

/** The acting member, as stepRun takes it. */
export const finisherOf = (m: { id: string; role: Role }): Finisher => ({ id: m.id, admin: isAdmin(m) });

/** Done the run's current step (§7B.3) — shared by /chore-runs/{id}/done and a chore fire's Done. */
export const completeStep = (env: Env, runId: string, member: Finisher, now: string) =>
  stepRun(env, runId, member, now, (chore, run, open, tz, place) => advanceRun(chore, run, open, member.id, now, tz, place));

async function loadChore(c: Context<AppEnv>, forWrite: boolean): Promise<ChoreRow | Response> {
  const row = await first<ChoreRow>(c.env.DB, 'SELECT * FROM chores WHERE id = ? AND deleted_at IS NULL', c.req.param('id'));
  if (!row) return fail(c, 404, 'not_found', 'That chore no longer exists.');
  const me = c.get('member');
  if (forWrite && !canChange(row.created_by, me)) return fail(c, 403, 'forbidden', 'Only the creator or an admin can change this chore.');
  return row;
}

const choreColumns = (i: ChoreInput) => [
  i.title, i.done_means, JSON.stringify(i.days), i.timing, i.time, i.nudge ? 1 : 0, JSON.stringify(i.people),
  JSON.stringify(i.steps), JSON.stringify(i.channels), i.renotify_min, i.sun_offset_min,
];

export const chores = new Hono<AppEnv>();

chores.get('/chores', requireMember, async (c) => {
  const today = utcToLocal(nowIso(), await householdTz(c.env.DB)).date;
  const active = await activeMemberIds(c.env.DB);
  const rows = await all<ChoreRow>(c.env.DB, 'SELECT * FROM chores WHERE deleted_at IS NULL ORDER BY time, title');
  const counts = await areaCounts(c.env.DB);
  return c.json(rows.map((r) => choreView(r, today, active, counts.get(r.id) ?? 0)));
});

chores.post('/chores', requireMember, async (c) => {
  const db = c.env.DB, now = nowIso(), tz = await householdTz(db), place = await householdPlace(db);
  const active = await activeMemberIds(db);
  const b = await body(c);
  const input = parseChoreInput(b, active);
  if (typeof input === 'string') return fail(c, 400, 'invalid_input', input);
  const room = await choreRoomId(db, b);
  if (typeof room === 'string') return fail(c, 400, 'invalid_input', room);
  const id = newId('chr'), today = utcToLocal(now, tz).date;
  // Plan today's and tomorrow's runs straight away, so the new chore is on Today without waiting for a tick.
  await db.batch([
    db.prepare(
      `INSERT INTO chores (id, title, done_means, days, timing, time, nudge, people, steps, channels, renotify_min, sun_offset_min, max_alerts,
         start_date, created_by, created_at, updated_at, room_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, ...choreColumns(input), input.max_alerts, today, c.get('member').id, now, now, room.roomId ?? null),
    ...choreRunInserts(db, { ...input, id, start_date: today }, tz, now, addMinutes(now, MATERIALIZE_AHEAD_H * 60), active, place),
  ]);
  const areaCount = (await areaCounts(db)).get(id) ?? 0;
  return c.json(choreView((await first<ChoreRow>(db, 'SELECT * FROM chores WHERE id = ?', id))!, today, active, areaCount), 201);
});

chores.patch('/chores/:id', requireMember, async (c) => {
  const row = await loadChore(c, true);
  if (row instanceof Response) return row;
  const db = c.env.DB, now = nowIso(), tz = await householdTz(db), place = await householdPlace(db);
  const active = await activeMemberIds(db), today = utcToLocal(now, tz).date;
  const b = await body(c);
  const input = parseChoreInput({ ...choreView(row, today, active, 0), ...b }, active);
  if (typeof input === 'string') return fail(c, 400, 'invalid_input', input);
  const room = await choreRoomId(db, b);
  if (typeof room === 'string') return fail(c, 400, 'invalid_input', room);
  const chore: Chore = { ...input, id: row.id, start_date: row.start_date };
  const stmts = [db.prepare(
    `UPDATE chores SET title = ?, done_means = ?, days = ?, timing = ?, time = ?, nudge = ?, people = ?, steps = ?, channels = ?,
       renotify_min = ?, sun_offset_min = ?, room_id = ?, updated_at = ? WHERE id = ?`,
  ).bind(...choreColumns(input), room.roomId === undefined ? row.room_id : room.roomId, now, row.id)];
  // §7B.3: unstarted runs from today on are re-planned in place; runs are never deleted.
  const runs = await all<ChoreRun>(db,
    'SELECT id, chore_id, date, assignee_id, step, done_at, done_by FROM chore_runs WHERE chore_id = ? AND step = 0 AND date >= ?', row.id, today);
  for (const run of runs) {
    const ch = replanRun(chore, run, await openFireOf(db, run.id), tz, now, active, place);
    if (ch) stmts.push(...changeStatements(db, ch, now));
  }
  stmts.push(...choreRunInserts(db, chore, tz, now, addMinutes(now, MATERIALIZE_AHEAD_H * 60), active, place));
  await db.batch(stmts);
  const areaCount = (await areaCounts(db)).get(row.id) ?? 0;
  return c.json(choreView((await first<ChoreRow>(db, 'SELECT * FROM chores WHERE id = ?', row.id))!, today, active, areaCount));
});

chores.delete('/chores/:id', requireMember, async (c) => {
  const row = await loadChore(c, true);
  if (row instanceof Response) return row;
  const db = c.env.DB, now = nowIso();
  // Soft delete; the runs stay (history). Every open fire of its runs closes `removed` (§7B.3).
  // Its room and the room's areas stay: they belong to the room (§7B.6).
  await db.batch([
    db.prepare('UPDATE chores SET deleted_at = ?, updated_at = ? WHERE id = ?').bind(now, now, row.id),
    db.prepare(
      `UPDATE fires SET state = 'closed', close_reason = 'removed', closed_at = ?
        WHERE state != 'closed' AND chore_run_id IN (SELECT id FROM chore_runs WHERE chore_id = ?)`,
    ).bind(now, row.id),
  ]);
  return c.json({ ok: true });
});

chores.get('/chores/today', requireMember, async (c) => {
  const db = c.env.DB, today = utcToLocal(nowIso(), await householdTz(db)).date;
  const rows = await all<ChoreRun & { open_due_at: string | null; open_state: FireRow['state'] | null }>(db,
    `SELECT r.id, r.chore_id, r.date, r.assignee_id, r.step, r.done_at, r.done_by, f.due_at AS open_due_at, f.state AS open_state
       FROM chore_runs r JOIN chores ch ON ch.id = r.chore_id
       LEFT JOIN fires f ON f.chore_run_id = r.id AND f.state != 'closed'
      WHERE r.date = ? AND ch.deleted_at IS NULL
      ORDER BY ch.time, ch.title`, today);
  const choreRows = await all<ChoreRow>(db,
    'SELECT * FROM chores WHERE id IN (SELECT chore_id FROM chore_runs WHERE date = ?)', today);
  const byId = new Map(choreRows.map((r) => [r.id, choreFromRow(r)]));
  const bounties = new Map(choreRows.map((r) => [r.id, r.bounty]));
  const counts = await areaCounts(db);
  const runs = rows
    .filter((r) => showsOnToday(byId.get(r.chore_id)!, r))
    .map((r) => runView(byId.get(r.chore_id)!, r, r.open_state ? { due_at: r.open_due_at!, state: r.open_state } : null, counts.get(r.chore_id) ?? 0, bounties.get(r.chore_id) ?? null));
  return c.json({ date: today, runs });
});

async function stepResponse(c: Context<AppEnv>, r: StepResult) {
  if ('error' in r) {
    if (r.error === 'not_found') return fail(c, 404, 'not_found', 'That chore run no longer exists.');
    if (r.error === 'already_done') return fail(c, 409, 'already_done', 'Every step of this chore is already done.');
    return fail(c, 409, 'nothing_to_undo', 'No step of this chore has been done yet.');
  }
  return c.json(runView(r.chore, r.run, await openFireOf(c.env.DB, r.run.id), (await areaCounts(c.env.DB)).get(r.chore.id) ?? 0, r.bounty));
}

chores.post('/chore-runs/:id/done', requireMember, async (c) =>
  stepResponse(c, await completeStep(c.env, c.req.param('id'), finisherOf(c.get('member')), nowIso())));

chores.post('/chore-runs/:id/undo', requireMember, async (c) => {
  const now = nowIso();
  return stepResponse(c, await stepRun(c.env, c.req.param('id'), finisherOf(c.get('member')), now, (chore, run, open, tz, place) => undoRun(chore, run, open, now, tz, place)));
});
