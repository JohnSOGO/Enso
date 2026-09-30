// SPEC §5.6 — orchestration only: load rows, call the pure engine, write results.
import {
  MATERIALIZE_AHEAD_H, alertMessage, stepFire, planReminderFires,
  type AlertConfig, type FireRow, type NewFire,
} from '../shared/engine';
import type { Channel } from '../shared/vocab';
import type { Recurrence } from '../shared/recurrence';
import { addMinutes } from '../shared/time';
import type { Env } from './env';
import { all, first, newId, parseJson } from './db';
import { sendPushDeliveries } from './push';

export interface TickSummary { materialized: number; stepped: number; alerts: number; deliveries: number }

interface SourceRow {
  title: string; assigned_to: string; channels: string | null; renotify_min: number | null; max_alerts: number;
  interval_min: number | null;
}

export function insertFire(db: D1Database, f: NewFire, ignoreConflict = false): D1PreparedStatement {
  return db.prepare(
    `INSERT ${ignoreConflict ? 'OR IGNORE ' : ''}INTO fires (id, kind, event_id, occurrence_date, timer_id, due_at, state,
       alert_count, last_alerted_at, close_reason, closed_by, closed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(newId('fire'), f.kind, f.event_id, f.occurrence_date, f.timer_id, f.due_at, f.state,
    f.alert_count, f.last_alerted_at, f.close_reason, f.closed_by, f.closed_at);
}

export function updateFire(db: D1Database, f: FireRow): D1PreparedStatement {
  return db.prepare(
    `UPDATE fires SET due_at = ?, state = ?, alert_count = ?, last_alerted_at = ?, close_reason = ?, closed_by = ?, closed_at = ?
      WHERE id = ?`,
  ).bind(f.due_at, f.state, f.alert_count, f.last_alerted_at, f.close_reason, f.closed_by, f.closed_at, f.id);
}

/** Loads the alert config + title for a fire from its event or timer. */
export async function sourceOf(db: D1Database, fire: Pick<FireRow, 'kind' | 'event_id' | 'timer_id'>): Promise<{ title: string; assignedTo: string[]; cfg: AlertConfig } | null> {
  const row = fire.kind === 'reminder'
    ? await first<SourceRow>(db, `SELECT title, assigned_to, remind_channels AS channels, renotify_min, max_alerts, NULL AS interval_min FROM events WHERE id = ?`, fire.event_id)
    : await first<SourceRow>(db, `SELECT title, assigned_to, channels, renotify_min, max_alerts, interval_min FROM timers WHERE id = ?`, fire.timer_id);
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
  };
}

async function recipients(db: D1Database, assignedTo: string[]): Promise<string[]> {
  const active = (await all<{ id: string }>(db, 'SELECT id FROM members WHERE disabled_at IS NULL')).map((r) => r.id);
  if (assignedTo.length === 0) return active;
  return assignedTo.filter((id) => active.includes(id));
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
      const message = alertMessage(fire.kind, src.title, next.alert_count);
      const base = [next.id, next.alert_count] as const;
      if (src.cfg.channels.includes('push')) {
        for (const memberId of await recipients(db, src.assignedTo)) {
          const id = newId('dlv');
          newDeliveryIds.push(id);
          stmts.push(db.prepare(
            `INSERT INTO deliveries (id, fire_id, alert_number, channel, member_id, message, status, created_at, updated_at)
             VALUES (?, ?, ?, 'push', ?, ?, 'queued', ?, ?)`).bind(id, ...base, memberId, message, now, now));
        }
      }
      if (src.cfg.channels.includes('house')) {
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
