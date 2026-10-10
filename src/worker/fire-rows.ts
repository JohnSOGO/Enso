// SPEC §5.6, §7B.3 — the fire and chore-run rows, shared by tick and the routes. No Hono; never steps or delivers.
import { newChoreFire, timerWindow, type AlertConfig, type ChoreAlertText, type FireRow, type NewFire } from '../shared/engine';
import { DEFAULT_MAX_ALERTS, choreFireContext, choreFromRow, planChoreRuns, type Chore, type ChoreRow, type ChoreRun } from '../shared/chores';
import { isStartReminder, type ThingRow } from '../shared/things';
import { doneMessage, isMachineId, isStillLoaded, machineAlert, machineHoursOf, machineQuietUntil, waitingLoad, type MachineRow } from '../shared/machines';
import type { Channel, SunEvent } from '../shared/vocab';
import { utcToLocal } from '../shared/time';
import { sunsetUtc } from '../shared/sun';
import { all, first, newId, parseJson, placeOf } from './db';
import { onMemberIds } from './event-rows';

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
  /** §7.7: a sun reminder's local sunset HH:MM, or null when it cannot be computed. */
  sunsetAt?: string | null;
  /** §7D.3: spoken on every speaker HA lists, whatever anyone ticked. */
  allSpeakers?: boolean;
  /** §7.10: an event reminder's things to bring. */
  bring?: string[];
}

/** Loads the alert config + title for a fire from its event, timer, chore run, thing or machine (as of `now`). */
export async function sourceOf(
  db: D1Database, fire: Pick<FireRow, 'kind' | 'event_id' | 'timer_id' | 'chore_run_id' | 'thing_id' | 'machine_id' | 'occurrence_date' | 'due_at'>,
  now: string,
): Promise<Source | null> {
  if (fire.kind === 'machine') {
    // §7D.5: outside the alert hours an alert waits for them (quietUntil). §7D.3: every active member's phones and the default speakers, naming the load's owner; a done load waiting
    // in the machine before this one is named at alert time; a fire restarted by Still loaded says what's next.
    if (!isMachineId(fire.machine_id)) return null;
    const rows = await all<MachineRow>(db, 'SELECT * FROM machines');
    const m = rows.find((r) => r.id === fire.machine_id);
    if (!m) return null;
    const nameOf = async (id: string | null) => id === null ? null
      : (await first<{ display_name: string }>(db, 'SELECT display_name FROM members WHERE id = ? AND disabled_at IS NULL', id))?.display_name ?? null;
    const owner = m.owner_id === null ? undefined : await nameOf(m.owner_id); // §7D.3: no owner → "Owner unknown"
    const waiting = waitingLoad(rows, m.id, now);
    const st = (await first<Parameters<typeof machineHoursOf>[0] & { timezone: string }>(db, 'SELECT * FROM settings WHERE id = 1'))!;
    const quietUntil = machineQuietUntil(machineHoursOf(st), st.timezone, now);
    return {
      title: doneMessage(m.id, owner, waiting ? await nameOf(waiting.owner_id) : undefined, isStillLoaded(m, fire.due_at)),
      ...machineAlert(quietUntil),
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
  };
}
