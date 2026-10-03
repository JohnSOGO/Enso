// SPEC §5.6 — orchestration only: load rows, call the pure engine, write results.
import {
  MATERIALIZE_AHEAD_H, alertMessage, newChoreFire, stepFire, planReminderFires,
  type AlertConfig, type ChoreAlertText, type FireRow, type NewFire,
} from '../shared/engine';
import { DEFAULT_MAX_ALERTS, choreFireContext, choreFromRow, planChoreRuns, type Chore, type ChoreRow, type ChoreRun } from '../shared/chores';
import { isStartReminder, planThingFires, type ThingRow } from '../shared/things';
import { audience } from '../shared/optins';
import type { Channel } from '../shared/vocab';
import type { Recurrence } from '../shared/recurrence';
import { addMinutes } from '../shared/time';
import type { Env } from './env';
import { all, first, newId, parseJson } from './db';
import { sendPushDeliveries } from './push';
import { onMemberIds } from './event-rows';

export interface TickSummary { materialized: number; stepped: number; alerts: number; deliveries: number }

interface SourceRow {
  title: string; assigned_to: string; channels: string | null; renotify_min: number | null; max_alerts: number;
  interval_min: number | null; optional: number;
}

export function insertFire(db: D1Database, f: NewFire, ignoreConflict = false): D1PreparedStatement {
  return db.prepare(
    `INSERT ${ignoreConflict ? 'OR IGNORE ' : ''}INTO fires (id, kind, event_id, occurrence_date, timer_id, chore_run_id, thing_id, due_at, state,
       alert_count, last_alerted_at, close_reason, closed_by, closed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(newId('fire'), f.kind, f.event_id, f.occurrence_date, f.timer_id, f.chore_run_id, f.thing_id, f.due_at, f.state,
    f.alert_count, f.last_alerted_at, f.close_reason, f.closed_by, f.closed_at);
}

export function updateFire(db: D1Database, f: FireRow): D1PreparedStatement {
  return db.prepare(
    `UPDATE fires SET due_at = ?, state = ?, alert_count = ?, last_alerted_at = ?, close_reason = ?, closed_by = ?, closed_at = ?
      WHERE id = ?`,
  ).bind(f.due_at, f.state, f.alert_count, f.last_alerted_at, f.close_reason, f.closed_by, f.closed_at, f.id);
}

export const activeMemberIds = async (db: D1Database): Promise<string[]> =>
  (await all<{ id: string }>(db, 'SELECT id FROM members WHERE disabled_at IS NULL')).map((r) => r.id);

/** A chore run with its (parsed) chore, or null when either is gone. */
export async function loadChoreRun(db: D1Database, runId: string | null): Promise<{ chore: Chore; run: ChoreRun } | null> {
  const run = await first<ChoreRun>(db, 'SELECT id, chore_id, date, assignee_id, step, done_at, done_by FROM chore_runs WHERE id = ?', runId);
  const row = run && await first<ChoreRow>(db, 'SELECT * FROM chores WHERE id = ?', run.chore_id);
  return run && row ? { chore: choreFromRow(row), run } : null;
}

/**
 * §7B.3 planning for one chore: INSERT OR IGNORE each run; its first fire is inserted only when that
 * run row is the one just minted (it exists under the new id) — i.e. the run is newly inserted.
 */
export function choreRunInserts(db: D1Database, chore: Chore, tz: string, now: string, toUtc: string, activeIds: string[]): D1PreparedStatement[] {
  const stmts: D1PreparedStatement[] = [];
  for (const p of planChoreRuns(chore, tz, now, toUtc, activeIds)) {
    const runId = newId('run');
    stmts.push(db.prepare(
      `INSERT OR IGNORE INTO chore_runs (id, chore_id, date, assignee_id, step, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)`,
    ).bind(runId, chore.id, p.date, p.assignee_id, now, now));
    if (p.firstDueAt) {
      const f = newChoreFire(runId, p.firstDueAt);
      stmts.push(db.prepare(
        `INSERT INTO fires (id, kind, chore_run_id, due_at, state, alert_count) SELECT ?, ?, ?, ?, ?, 0
          WHERE EXISTS (SELECT 1 FROM chore_runs WHERE id = ?)`,
      ).bind(newId('fire'), f.kind, runId, f.due_at, f.state, runId));
    }
  }
  return stmts;
}

export function updateChoreRun(db: D1Database, r: ChoreRun, now: string): D1PreparedStatement {
  return db.prepare('UPDATE chore_runs SET assignee_id = ?, step = ?, done_at = ?, done_by = ?, updated_at = ? WHERE id = ?')
    .bind(r.assignee_id, r.step, r.done_at, r.done_by, now, r.id);
}

interface Source {
  title: string; assignedTo: string[]; cfg: AlertConfig; chore?: ChoreAlertText; startsToday?: boolean;
  /** §7.5: a reminder of an optional event, and the members who have it on. */
  optional?: boolean; onIds?: string[];
}

/** Loads the alert config + title for a fire from its event, timer, chore run or thing. */
export async function sourceOf(
  db: D1Database, fire: Pick<FireRow, 'kind' | 'event_id' | 'timer_id' | 'chore_run_id' | 'thing_id' | 'occurrence_date'>,
): Promise<Source | null> {
  if (fire.kind === 'thing') {
    // §7C.2: the whole household hears it, on the thing's channels; it rings once, like a reminder with no repeat.
    const t = await first<ThingRow>(db, 'SELECT * FROM things WHERE id = ?', fire.thing_id);
    if (!t) return null;
    return {
      title: t.title, assignedTo: [], startsToday: isStartReminder(t, fire.occurrence_date),
      cfg: { channels: parseJson<Channel[]>(t.channels, []), renotifyMin: null, maxAlerts: DEFAULT_MAX_ALERTS },
    };
  }
  if (fire.kind === 'chore') {
    const cr = await loadChoreRun(db, fire.chore_run_id);
    if (!cr) return null;
    const ctx = choreFireContext(cr.chore, cr.run);
    // §5.7: the step's person if still active, else nobody — and then every active member hears it.
    const person = ctx.personId === null ? null
      : await first<{ display_name: string }>(db, 'SELECT display_name FROM members WHERE id = ? AND disabled_at IS NULL', ctx.personId);
    return {
      title: cr.chore.title, assignedTo: person ? [ctx.personId!] : [], cfg: ctx.cfg,
      chore: { personName: person?.display_name ?? null, stepTitle: ctx.stepTitle, stepCount: ctx.stepCount },
    };
  }
  const row = fire.kind === 'reminder'
    ? await first<SourceRow>(db, `SELECT title, assigned_to, remind_channels AS channels, renotify_min, max_alerts, NULL AS interval_min, optional FROM events WHERE id = ?`, fire.event_id)
    : await first<SourceRow>(db, `SELECT title, assigned_to, channels, renotify_min, max_alerts, interval_min, 0 AS optional FROM timers WHERE id = ?`, fire.timer_id);
  if (!row) return null;
  return {
    title: row.title,
    assignedTo: parseJson<string[]>(row.assigned_to, []),
    cfg: {
      channels: parseJson<Channel[]>(row.channels, []),
      renotifyMin: row.renotify_min,
      maxAlerts: row.max_alerts,
      intervalMin: row.interval_min ?? undefined,
    },
    ...(row.optional === 1 ? { optional: true, onIds: await onMemberIds(db, fire.event_id) } : {}),
  };
}

export async function tick(env: Env, now: string): Promise<TickSummary> {
  const db = env.DB;
  const summary: TickSummary = { materialized: 0, stepped: 0, alerts: 0, deliveries: 0 };
  const tz = (await first<{ timezone: string }>(db, 'SELECT timezone FROM settings WHERE id = 1'))!.timezone;

  // 1. Materialize reminder fires for the next 36 h.
  const evs = await all<{ id: string; start_date: string; start_time: string | null; recurrence: string | null; exdates: string; remind_offset_min: number }>(db,
    `SELECT id, start_date, start_time, recurrence, exdates, remind_offset_min FROM events
      WHERE deleted_at IS NULL AND remind_offset_min IS NOT NULL`);
  const to = addMinutes(now, MATERIALIZE_AHEAD_H * 60);
  const inserts: D1PreparedStatement[] = [];
  for (const e of evs) {
    const planned = planReminderFires({
      id: e.id, start_date: e.start_date, start_time: e.start_time, remind_offset_min: e.remind_offset_min,
      recurrence: parseJson<Recurrence | null>(e.recurrence, null), exdates: parseJson<string[]>(e.exdates, []),
    }, tz, now, to);
    for (const f of planned) inserts.push(insertFire(db, f, true));
  }
  // 1b. Plan chore runs (and their first fires) for the same window (§7B.3).
  const chores = await all<ChoreRow>(db, 'SELECT * FROM chores WHERE deleted_at IS NULL');
  if (chores.length) {
    const active = await activeMemberIds(db);
    for (const c of chores) inserts.push(...choreRunInserts(db, choreFromRow(c), tz, now, to, active));
  }
  // 1c. Plan thing reminders (§7C.2): only ideas, same window, INSERT OR IGNORE.
  const things = await all<ThingRow>(db,
    `SELECT * FROM things WHERE deleted_at IS NULL AND status = 'idea' AND (remind_start = 1 OR remind_on IS NOT NULL)`);
  for (const t of things) for (const f of planThingFires(t, tz, now, to)) inserts.push(insertFire(db, f, true));
  if (inserts.length) {
    const results = await db.batch(inserts);
    summary.materialized = results.reduce((n, r) => n + (r.meta.changes ?? 0), 0);
  }

  // 2. Step every open fire.
  const open = await all<FireRow>(db, `SELECT * FROM fires WHERE state != 'closed' ORDER BY due_at`);
  const newDeliveryIds: string[] = [];
  for (const fire of open) {
    const src = await sourceOf(db, fire);
    if (!src) continue;
    const { fire: next, alert } = stepFire(fire, src.cfg, now);
    if (next === fire) continue;
    summary.stepped++;
    const stmts = [updateFire(db, next)];
    if (alert) {
      summary.alerts++;
      const message = alertMessage(fire.kind, src.title, next.alert_count, src.chore, src.startsToday);
      const base = [next.id, next.alert_count] as const;
      // §5.7, §7.5: who it is for. Nobody → the fire still steps, nothing is delivered.
      const aud = audience({
        optional: src.optional ?? false, assignedTo: src.assignedTo, activeIds: await activeMemberIds(db),
        onIds: src.onIds ?? [], channels: src.cfg.channels,
      });
      if (src.cfg.channels.includes('push')) {
        for (const memberId of aud.push) {
          const id = newId('dlv');
          newDeliveryIds.push(id);
          stmts.push(db.prepare(
            `INSERT INTO deliveries (id, fire_id, alert_number, channel, member_id, message, status, created_at, updated_at)
             VALUES (?, ?, ?, 'push', ?, ?, 'queued', ?, ?)`).bind(id, ...base, memberId, message, now, now));
        }
      }
      if (src.cfg.channels.includes('house') && aud.house) {
        stmts.push(db.prepare(
          `INSERT INTO deliveries (id, fire_id, alert_number, channel, member_id, message, status, created_at, updated_at)
           VALUES (?, ?, ?, 'house', NULL, ?, 'queued', ?, ?)`).bind(newId('dlv'), ...base, message, now, now));
      }
      summary.deliveries += stmts.length - 1;
      if (fire.state === 'scheduled' && fire.kind === 'reminder') {
        stmts.push(db.prepare(
          `UPDATE fires SET state = 'closed', close_reason = 'superseded', closed_at = ?
            WHERE event_id = ? AND id != ? AND state = 'ringing'`).bind(now, fire.event_id, fire.id));
      }
    }
    await db.batch(stmts);
  }

  // 3. Send the push deliveries created in this tick.
  if (newDeliveryIds.length) await sendPushDeliveries(env, newDeliveryIds, now);
  return summary;
}
