// SPEC §7D, §10 — the laundry loop and the dish washer: /machines and its six transitions, one batch each; its alert hours (§7D.5).
import { Hono, type Context } from 'hono';
import type { AppEnv } from '../env';
import { MACHINE } from '../../shared/vocab';
import type { FireRow } from '../../shared/engine';
import {
  MACHINE_LABEL, clearMachine, doneNowMachine, finishMachine, isMachineId, machineState, moveMachine, nextMachine, parseDoneNow, parseMove, parseStart,
  refusalText, remindMachine, startMachine, type MachineChange, type MachineResult, type MachineRow,
} from '../../shared/machines';
import { machineHoursOf, parseMachineHours } from '../../shared/machine-hours';
import { activeMemberIds, all, first, nowIso } from '../db';
import { body, fail } from '../http';
import { requireMember, requireOwner } from '../session';
import { insertFire, updateFire } from '../fire-rows';

const loadRows = (db: D1Database) => all<MachineRow>(db, 'SELECT * FROM machines');

function machinesView(rows: MachineRow[], now: string) {
  return MACHINE.map((id) => rows.find((r) => r.id === id)).filter((r): r is MachineRow => !!r).map((r) => ({
    id: r.id, label: MACHINE_LABEL[r.id], state: machineState(r, now), ownerId: r.owner_id, alertId: r.alert_id, minutes: r.minutes,
    startedAt: r.started_at, doneAt: r.done_at, startedBy: r.started_by, next: nextMachine(r.id),
  }));
}

const openFireOf = async (db: D1Database, id: string) =>
  (await all<FireRow>(db, `SELECT * FROM fires WHERE machine_id = ? AND state != 'closed'`, id))[0] ?? null;

const activeNames = async (db: D1Database) => new Map((await all<{ id: string; display_name: string }>(db,
  'SELECT id, display_name FROM members WHERE disabled_at IS NULL')).map((m) => [m.id, m.display_name]));

/**
 * One transition's writes, for one batch. Each changed machine row is guarded by its `started_at`
 * as read: if another tap changed it first, the guard's INSERT collides with the row's own id, so
 * the whole batch fails and rolls back (fire writes included).
 */
export function machineWrites(db: D1Database, before: readonly MachineRow[], r: MachineChange): D1PreparedStatement[] {
  const stmts: D1PreparedStatement[] = [];
  for (const row of r.rows) {
    const was = before.find((b) => b.id === row.id)!.started_at;
    stmts.push(
      db.prepare(`INSERT INTO machines (id) SELECT ? WHERE NOT EXISTS (SELECT 1 FROM machines WHERE id = ? AND started_at IS ?)`)
        .bind(row.id, row.id, was),
      db.prepare(`UPDATE machines SET owner_id = ?, alert_id = ?, minutes = ?, started_at = ?, done_at = ?, started_by = ?, updated_at = ?
                   WHERE id = ? AND started_at IS ?`)
        .bind(row.owner_id, row.alert_id, row.minutes, row.started_at, row.done_at, row.started_by, row.updated_at, row.id, was),
    );
  }
  if (r.closeFire) stmts.push(updateFire(db, r.closeFire));
  if (r.newFire) stmts.push(insertFire(db, r.newFire));
  return stmts;
}

/** Answers a refusal, or saves the change and answers every machine — 409 `conflict` if another tap won. */
async function save(c: Context<AppEnv>, before: MachineRow[], r: MachineResult, now: string) {
  const db = c.env.DB;
  if ('error' in r) return fail(c, 409, r.error, refusalText(r, await activeNames(db)));
  try {
    await db.batch(machineWrites(db, before, r));
  } catch (e) {
    if (!/UNIQUE|constraint/i.test(String(e))) throw e;
    const label = MACHINE_LABEL[r.rows[0].id].toLowerCase();
    return fail(c, 409, 'conflict', `Someone else just changed the ${label} — have another look.`);
  }
  return c.json(machinesView(await loadRows(db), now));
}

/** The machine named in the path, all rows as read, and its open fire — or a 404. */
async function load(c: Context<AppEnv>) {
  const id = c.req.param('id');
  if (!isMachineId(id)) return fail(c, 404, 'not_found', `There is no machine "${id}".`);
  const rows = await loadRows(c.env.DB);
  const row = rows.find((r) => r.id === id);
  if (!row) return fail(c, 404, 'not_found', `There is no machine "${id}".`);
  return { rows, row, openFire: await openFireOf(c.env.DB, id) };
}

export const machines = new Hono<AppEnv>();

const hoursView = async (db: D1Database) => machineHoursOf((await first<Parameters<typeof machineHoursOf>[0]>(db, 'SELECT * FROM settings WHERE id = 1'))!);

machines.get('/machines/hours', requireMember, async (c) => c.json(await hoursView(c.env.DB)));

machines.patch('/machines/hours', requireMember, requireOwner, async (c) => {
  const h = parseMachineHours(await body(c));
  if (typeof h === 'string') return fail(c, 400, 'invalid_input', h);
  await c.env.DB.prepare(`UPDATE settings SET machine_weekday_from = ?, machine_weekday_to = ?, machine_weekend_from = ?, machine_weekend_to = ?
    WHERE id = 1`).bind(h.weekday?.from ?? null, h.weekday?.to ?? null, h.weekend?.from ?? null, h.weekend?.to ?? null).run();
  return c.json(await hoursView(c.env.DB));
});

machines.get('/machines', requireMember, async (c) => c.json(machinesView(await loadRows(c.env.DB), nowIso())));

machines.post('/machines/:id/start', requireMember, async (c) => {
  const m = await load(c);
  if (m instanceof Response) return m;
  const input = parseStart(await body(c), m.row.id, await activeMemberIds(c.env.DB));
  if (typeof input === 'string') return fail(c, 400, 'invalid_input', input);
  const now = nowIso();
  return save(c, m.rows, startMachine(m.row, input.ownerId, input.alertId, input.minutes, c.get('member').id, now), now);
});

machines.post('/machines/:id/move', requireMember, async (c) => {
  const m = await load(c);
  if (m instanceof Response) return m;
  const now = nowIso();
  const next = nextMachine(m.row.id);
  const to = next ? m.rows.find((r) => r.id === next) ?? null : null;
  if (!to) return save(c, m.rows, moveMachine(m.row, null, m.openFire, 0, c.get('member').id, now), now); // invalid_state
  const input = parseMove(await body(c), to.id);
  if (typeof input === 'string') return fail(c, 400, 'invalid_input', input);
  return save(c, m.rows, moveMachine(m.row, to, m.openFire, input.minutes, c.get('member').id, now), now);
});

machines.post('/machines/:id/finish', requireMember, async (c) => {
  const m = await load(c);
  if (m instanceof Response) return m;
  const now = nowIso();
  return save(c, m.rows, finishMachine(m.row, m.openFire, c.get('member').id, now), now);
});

machines.post('/machines/:id/clear', requireMember, async (c) => {
  const m = await load(c);
  if (m instanceof Response) return m;
  const now = nowIso();
  return save(c, m.rows, clearMachine(m.row, m.openFire, c.get('member').id, now), now);
});

machines.post('/machines/:id/remind', requireMember, async (c) => {
  const m = await load(c);
  if (m instanceof Response) return m;
  const now = nowIso();
  return save(c, m.rows, remindMachine(m.row, m.openFire, c.get('member').id, now), now);
});

machines.post('/machines/:id/done', requireMember, async (c) => {
  const m = await load(c);
  if (m instanceof Response) return m;
  const now = nowIso();
  const input = parseDoneNow(await body(c), await activeMemberIds(c.env.DB), machineState(m.row, now) === 'free');
  if (typeof input === 'string') return fail(c, 400, 'invalid_input', input);
  return save(c, m.rows, doneNowMachine(m.row, input.ownerId, input.alertId, m.openFire, c.get('member').id, now), now);
});
