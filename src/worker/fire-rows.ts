// SPEC §5.6, §7B.3 — the fire, reminder-planning and chore-run rows, shared by tick and the routes. No Hono; never steps or delivers.
import { newChoreFire, planReminderFires, timerWindow, type AlertConfig, type ChoreAlertText, type FireRow, type NewFire } from '../shared/engine';
import { DEFAULT_MAX_ALERTS, choreFireContext, choreFromRow, planChoreRuns, type Chore, type ChoreRow, type ChoreRun } from '../shared/chores';
import { isStartReminder, type ThingRow } from '../shared/things';
import { doneMessage, isMachineId, isStillLoaded, machineAlert, waitingLoad, type MachineRow } from '../shared/machines';
import { machineHoursOf, machineQuietUntil } from '../shared/machine-hours';
import { cookAlert, cookMessage, isCookId, type CookRow } from '../shared/cooking';
import type { Channel, SunEvent } from '../shared/vocab';
import { isTaskId, taskFromRow, type TaskRow } from '../shared/tasks';
import { checkinText } from '../shared/task-replies';
import type { Recurrence } from '../shared/recurrence';
import { utcToLocal } from '../shared/time';
import { sunsetUtc, type Place } from '../shared/sun';
import { FOUNDER_SQL, all, first, newId, parseJson, placeOf } from './db';
import { onMemberIds } from './event-rows';
import { audience } from '../shared/optins';

interface SourceRow {
  title: string; assigned_to: string; channels: string | null; renotify_min: number | null; max_alerts: number;
  interval_min: number | null; optional: number;
  /** Timers only (§4.2n): the active time range and the household tz. */
  active_from?: string | null; active_to?: string | null; tz?: string;
  /** Reminders only (§7.7): a sun event, and the household place. */
  start_sun?: SunEvent | null; lat?: number | null; lon?: number | null;
  /** Reminders only (§7.10): the event's things to bring, as JSON. */
  bring?: string | null;
}

export function insertFire(db: D1Database, f: NewFire, ignoreConflict = false): D1PreparedStatement {
  return db.prepare(
    `INSERT ${ignoreConflict ? 'OR IGNORE ' : ''}INTO fires (id, kind, event_id, occurrence_date, timer_id, chore_run_id, thing_id, machine_id, due_at, state,
       alert_count, last_alerted_at, close_reason, closed_by, closed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(newId('fire'), f.kind, f.event_id, f.occurrence_date, f.timer_id, f.chore_run_id, f.thing_id, f.machine_id, f.due_at, f.state,
    f.alert_count, f.last_alerted_at, f.close_reason, f.closed_by, f.closed_at);
}

export function updateFire(db: D1Database, f: FireRow): D1PreparedStatement {
  return db.prepare(
    `UPDATE fires SET due_at = ?, state = ?, alert_count = ?, last_alerted_at = ?, close_reason = ?, closed_by = ?, closed_at = ?
      WHERE id = ?`,
  ).bind(f.due_at, f.state, f.alert_count, f.last_alerted_at, f.close_reason, f.closed_by, f.closed_at, f.id);
}

interface ReminderEventRow {
  id: string; start_date: string; start_time: string | null; recurrence: string | null; exdates: string; remind_offset_min: number;
  start_sun: SunEvent | null; remind_random_from: string | null; remind_random_to: string | null;
}

/** §5.6 tick step 1: an INSERT OR IGNORE for each reminder fire of every live reminding event due by `toUtc`. */
export async function reminderInserts(db: D1Database, tz: string, now: string, toUtc: string, place: Place | null): Promise<D1PreparedStatement[]> {
  const evs = await all<ReminderEventRow>(db,
    `SELECT id, start_date, start_time, recurrence, exdates, remind_offset_min, start_sun, remind_random_from, remind_random_to FROM events
      WHERE deleted_at IS NULL AND remind_offset_min IS NOT NULL`);
  const stmts: D1PreparedStatement[] = [];
  for (const e of evs) {
    const planned = planReminderFires({
      id: e.id, start_date: e.start_date, start_time: e.start_time, remind_offset_min: e.remind_offset_min, start_sun: e.start_sun,
      remind_random_from: e.remind_random_from, remind_random_to: e.remind_random_to,
      recurrence: parseJson<Recurrence | null>(e.recurrence, null), exdates: parseJson<string[]>(e.exdates, []),
    }, tz, now, toUtc, place);
    for (const f of planned) stmts.push(insertFire(db, f, true));
  }
  return stmts;
}

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
export function choreRunInserts(db: D1Database, chore: Chore, tz: string, now: string, toUtc: string, activeIds: string[], place: Place | null): D1PreparedStatement[] {
  const stmts: D1PreparedStatement[] = [];
  for (const p of planChoreRuns(chore, tz, now, toUtc, activeIds, place)) {
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
  /** §7.7: a sun reminder's local sunset HH:MM, or null when it cannot be computed. */
  sunsetAt?: string | null;
  /** §7D.3: spoken on every speaker HA lists, whatever anyone ticked. */
  allSpeakers?: boolean;
  /** §7.10: an event reminder's things to bring. */
  bring?: string[];
  /** §7G.3: a task check-in's whole text for alert n, and what a speaker says (a private task is never named). */
  say?: (alertNumber: number) => string;
  houseSay?: (alertNumber: number) => string;
}

/** Loads the alert config + title for a fire from its event, timer, chore run, thing or machine (as of `now`). */
export async function sourceOf(
  db: D1Database, fire: Pick<FireRow, 'kind' | 'event_id' | 'timer_id' | 'chore_run_id' | 'thing_id' | 'machine_id' | 'occurrence_date' | 'due_at'>,
  now: string,
): Promise<Source | null> {
  if (fire.kind === 'machine') {
    // §7D.5: outside the alert hours an alert waits for them (quietUntil). §7D.3: every active member's phones and the default speakers, naming the load's owner; a done load waiting
    // in the machine before this one is named at alert time; a fire restarted by Still loaded says what's next.
    const nameOf = async (id: string | null) => id === null ? null
      : (await first<{ display_name: string }>(db, 'SELECT display_name FROM members WHERE id = ? AND disabled_at IS NULL', id))?.display_name ?? null;
    // §9.4b: the FunHouse rings only when the founder is the one alerted.
    const founder = (await first<{ id: string }>(db, FOUNDER_SQL))?.id;
    if (isCookId(fire.machine_id)) {
      // §7D.8: a cooking timer rings at any hour, every 5 minutes, naming who is alerted; nobody active → phones only.
      const k = await first<CookRow>(db, 'SELECT * FROM machines WHERE id = ?', fire.machine_id);
      if (!k) return null;
      const alertName = await nameOf(k.alert_id);
      const to = alertName !== null ? k.alert_id : null;
      return { title: cookMessage(k, alertName), ...cookAlert(to, to !== null && to === founder) };
    }
    if (!isMachineId(fire.machine_id)) return null;
    const rows = await all<MachineRow>(db, 'SELECT * FROM machines WHERE cook_kind IS NULL');
    const m = rows.find((r) => r.id === fire.machine_id);
    if (!m) return null;
    const owner = m.owner_id === null ? undefined : await nameOf(m.owner_id); // §7D.3: no owner → "Owner unknown"
    const waiting = waitingLoad(rows, m.id, now);
    const st = (await first<Parameters<typeof machineHoursOf>[0] & { timezone: string }>(db, 'SELECT * FROM settings WHERE id = 1'))!;
    const quietUntil = machineQuietUntil(machineHoursOf(st), st.timezone, now);
    const to = (await nameOf(m.alert_id)) !== null ? m.alert_id : null; // §7D.7: nobody active → phones only
    return {
      title: doneMessage(m.id, owner, waiting ? await nameOf(waiting.owner_id) : undefined, isStillLoaded(m, fire.due_at)),
      ...machineAlert(quietUntil, to, to !== null && to === founder),
    };
  }
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
    ? await first<SourceRow>(db, `SELECT title, assigned_to, remind_channels AS channels, renotify_min, max_alerts, NULL AS interval_min, optional,
        start_sun, bring, timezone AS tz, latitude AS lat, longitude AS lon FROM events JOIN settings ON settings.id = 1 WHERE events.id = ?`, fire.event_id)
    : await first<SourceRow>(db, `SELECT title, assigned_to, channels, renotify_min, max_alerts, interval_min, 0 AS optional,
        active_from, active_to, (SELECT timezone FROM settings WHERE id = 1) AS tz FROM timers WHERE id = ?`, fire.timer_id);
  if (!row) return null;
  const window = timerWindow(row.active_from, row.active_to, row.tz);
  const place = placeOf(row.lat, row.lon);
  const sunset = row.start_sun && fire.occurrence_date && place ? sunsetUtc(fire.occurrence_date, place) : null;
  return {
    title: row.title,
    assignedTo: parseJson<string[]>(row.assigned_to, []),
    cfg: {
      channels: parseJson<Channel[]>(row.channels, []),
      renotifyMin: row.renotify_min,
      maxAlerts: row.max_alerts,
      intervalMin: row.interval_min ?? undefined,
      ...(window ? { window } : {}),
    },
    ...(row.optional === 1 ? { optional: true, onIds: await onMemberIds(db, fire.event_id) } : {}),
    ...(row.bring ? { bring: parseJson<string[]>(row.bring, []) } : {}),
    ...(row.start_sun ? { sunsetAt: sunset && row.tz ? utcToLocal(sunset, row.tz).time : null } : {}),
    ...(isTaskId(fire.timer_id) ? await taskSay(db, fire.timer_id, row.title, row.interval_min ?? 0, now) : {}),
  };
}

/** §7G.3 — a task timer's check-in texts, over its task_sessions row as of `now`. */
async function taskSay(db: D1Database, id: string, title: string, intervalMin: number, now: string): Promise<Pick<Source, 'say' | 'houseSay'>> {
  const r = await first<TaskRow>(db, 'SELECT * FROM task_sessions WHERE id = ?', id);
  if (!r) return {};
  const s = taskFromRow(r);
  return { say: (n) => checkinText(s, title, intervalMin, now, n).text, houseSay: (n) => checkinText(s, title, intervalMin, now, n).house };
}

/** §5.7, §8.2 — who a fire's alert is for, from its source: the one mapping tick step 2 (pushes) and GET /fires (the bar) share. */
export const audienceOf = (src: Source, activeIds: readonly string[]) =>
  audience({ optional: src.optional ?? false, assignedTo: src.assignedTo, activeIds, onIds: src.onIds ?? [], channels: src.cfg.channels });
