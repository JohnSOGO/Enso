// SPEC §4.2 events, §7 calendar, §10 /calendar + /events.
import { Hono, type Context } from 'hono';
import type { AppEnv } from '../env';
import { CHANNEL, isOneOf, type Channel } from '../../shared/vocab';
import { addDays, diffDays, isDate, isTime } from '../../shared/time';
import { occurrences, recurrenceError, type Recurrence } from '../../shared/recurrence';
import { publicHolidaysBetween } from '../../shared/holidays';
import { all, first, newId, nowIso, parseJson, run } from '../db';
import { body, fail, intIn, optStr, str } from '../http';
import { requireMember } from '../session';

const MAX_RANGE_DAYS = 120;

export interface EventRow {
  id: string; title: string; notes: string | null;
  start_date: string; start_time: string | null; end_date: string; end_time: string | null;
  recurrence: string | null; exdates: string; assigned_to: string;
  remind_offset_min: number | null; remind_channels: string | null; renotify_min: number | null; max_alerts: number;
  created_by: string; created_at: string; updated_at: string; deleted_at: string | null;
  is_alarm: number;
}

export function eventView(e: EventRow) {
  return {
    id: e.id, title: e.title, notes: e.notes,
    startDate: e.start_date, startTime: e.start_time, endDate: e.end_date, endTime: e.end_time,
    allDay: e.start_time === null,
    recurrence: parseJson<Recurrence | null>(e.recurrence, null),
    exdates: parseJson<string[]>(e.exdates, []),
    assignedTo: parseJson<string[]>(e.assigned_to, []),
    reminder: e.remind_offset_min === null ? null : {
      offsetMin: e.remind_offset_min,
      channels: parseJson<Channel[]>(e.remind_channels, []),
      renotifyMin: e.renotify_min,
      maxAlerts: e.max_alerts,
    },
    createdBy: e.created_by, updatedAt: e.updated_at,
  };
}

type EventInput = Omit<EventRow, 'id' | 'exdates' | 'created_by' | 'created_at' | 'updated_at' | 'deleted_at' | 'is_alarm'>;

/** Validates untrusted event input → row fields, or an error message. */
export async function parseEventInput(db: D1Database, b: Record<string, unknown>): Promise<EventInput | string> {
  const title = str(b.title, 120);
  if (!title) return 'Title is required (up to 120 characters).';
  const notes = optStr(b.notes);
  if (notes === undefined && b.notes !== undefined) return 'Notes must be text (up to 2000 characters).';
  if (!isDate(b.startDate)) return 'Start date must be YYYY-MM-DD.';
  const allDay = b.startTime === null || b.startTime === undefined;
  let endDate = (b.endDate ?? b.startDate) as unknown;
  let startTime: string | null = null, endTime: string | null = null;
  if (allDay) {
    if (!isDate(endDate) || endDate < b.startDate) return 'End date must be on or after the start date.';
  } else {
    if (!isTime(b.startTime)) return 'Start time must be HH:MM.';
    startTime = b.startTime;
    endDate = b.startDate; // timed events are single-day in v1
    if (b.endTime !== null && b.endTime !== undefined) {
      if (!isTime(b.endTime) || b.endTime <= startTime) return 'End time must be HH:MM and after the start time.';
      endTime = b.endTime;
    }
  }
  const recurrence = b.recurrence ?? null;
  const recErr = recurrenceError(recurrence);
  if (recErr) return recErr;
  const assigned = b.assignedTo ?? [];
  if (!Array.isArray(assigned) || !assigned.every((x) => typeof x === 'string')) return 'assignedTo must be a list of member ids.';
  if (assigned.length) {
    const known = new Set((await all<{ id: string }>(db, 'SELECT id FROM members WHERE disabled_at IS NULL')).map((r) => r.id));
    if (!assigned.every((x) => known.has(x))) return 'assignedTo contains an unknown member.';
  }
  let remind: Pick<EventRow, 'remind_offset_min' | 'remind_channels' | 'renotify_min' | 'max_alerts'> =
    { remind_offset_min: null, remind_channels: null, renotify_min: null, max_alerts: 4 };
  if (b.reminder !== null && b.reminder !== undefined) {
    const r = b.reminder as Record<string, unknown>;
    const offset = intIn(r.offsetMin, 0, 1440);
    if (offset === null) return 'Reminder offset must be 0–1440 minutes.';
    const channels = r.channels;
    if (!Array.isArray(channels) || channels.length === 0 || !channels.every((ch) => isOneOf(CHANNEL, ch))) {
      return `Reminder channels must be a non-empty list of: ${CHANNEL.join(', ')}.`;
    }
    const renotify = r.renotifyMin === null || r.renotifyMin === undefined ? null : intIn(r.renotifyMin, 1, 240);
    if (renotify === null && r.renotifyMin !== null && r.renotifyMin !== undefined) return 'Repeat-alert interval must be 1–240 minutes.';
    const maxAlerts = r.maxAlerts === undefined ? 4 : intIn(r.maxAlerts, 1, 20);
    if (maxAlerts === null) return 'maxAlerts must be 1–20.';
    remind = { remind_offset_min: offset, remind_channels: JSON.stringify([...new Set(channels)]), renotify_min: renotify, max_alerts: maxAlerts };
  }
  return {
    title, notes: notes ?? null, start_date: b.startDate, start_time: startTime, end_date: endDate as string, end_time: endTime,
    recurrence: recurrence === null ? null : JSON.stringify(recurrence), assigned_to: JSON.stringify(assigned), ...remind,
  };
}

async function loadEditable(c: Context<AppEnv>): Promise<EventRow | Response> {
  const e = await first<EventRow>(c.env.DB, 'SELECT * FROM events WHERE id = ? AND deleted_at IS NULL AND is_alarm = 0', c.req.param('id'));
  if (!e) return fail(c, 404, 'not_found', 'That event no longer exists.');
  const me = c.get('member');
  if (e.created_by !== me.id && me.role !== 'owner') return fail(c, 403, 'forbidden', 'Only the creator or the owner can change this event.');
  return e;
}

/** §5.6 — an edit makes future scheduled fires obsolete; the next tick re-materializes. */
export function removeFutureFires(db: D1Database, eventId: string, now: string): D1PreparedStatement {
  return db.prepare(
    `UPDATE fires SET state = 'closed', close_reason = 'removed', closed_at = ?
      WHERE event_id = ? AND state = 'scheduled' AND due_at > ?`).bind(now, eventId, now);
}

export const events = new Hono<AppEnv>();

events.get('/calendar', requireMember, async (c) => {
  const from = c.req.query('from'), to = c.req.query('to');
  if (!isDate(from) || !isDate(to) || to < from) return fail(c, 400, 'invalid_input', 'from and to must be YYYY-MM-DD with from ≤ to.');
  if (diffDays(to, from) > MAX_RANGE_DAYS) return fail(c, 400, 'invalid_input', `The range can be at most ${MAX_RANGE_DAYS} days.`);
  const rows = await all<EventRow & { color: string; creator_name: string }>(c.env.DB,
    `SELECT e.*, m.color, m.display_name AS creator_name FROM events e JOIN members m ON m.id = e.created_by
      WHERE e.deleted_at IS NULL AND e.is_alarm = 0 AND e.start_date <= ? AND (e.recurrence IS NOT NULL OR e.end_date >= ?)`, to, from);
  const occ = [];
  for (const e of rows) {
    const span = diffDays(e.end_date, e.start_date);
    const ev = { start_date: e.start_date, recurrence: parseJson<Recurrence | null>(e.recurrence, null), exdates: parseJson<string[]>(e.exdates, []) };
    for (const date of occurrences(ev, addDays(from, -span), to)) {
      occ.push({
        eventId: e.id, date, endDate: addDays(date, span), startTime: e.start_time, endTime: e.end_time,
        title: e.title, allDay: e.start_time === null, color: e.color, createdBy: e.created_by, creatorName: e.creator_name,
        assignedTo: parseJson<string[]>(e.assigned_to, []), hasReminder: e.remind_offset_min !== null, recurring: e.recurrence !== null,
      });
    }
  }
  occ.sort((a, b) => (a.date + (a.startTime ?? '')).localeCompare(b.date + (b.startTime ?? '')));
  const schoolHolidays = await all(c.env.DB, 'SELECT date, label FROM school_holidays WHERE date BETWEEN ? AND ? ORDER BY date', from, to);
  return c.json({ occurrences: occ, publicHolidays: publicHolidaysBetween(from, to), schoolHolidays });
});

events.post('/events', requireMember, async (c) => {
  const input = await parseEventInput(c.env.DB, await body(c));
  if (typeof input === 'string') return fail(c, 400, 'invalid_input', input);
  const id = newId('evt'), now = nowIso();
  await run(c.env.DB,
    `INSERT INTO events (id, title, notes, start_date, start_time, end_date, end_time, recurrence, assigned_to,
       remind_offset_min, remind_channels, renotify_min, max_alerts, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, input.title, input.notes, input.start_date, input.start_time, input.end_date, input.end_time, input.recurrence,
    input.assigned_to, input.remind_offset_min, input.remind_channels, input.renotify_min, input.max_alerts,
    c.get('member').id, now, now);
  return c.json(eventView((await first<EventRow>(c.env.DB, 'SELECT * FROM events WHERE id = ?', id))!), 201);
});

events.get('/events/:id', requireMember, async (c) => {
  const e = await first<EventRow>(c.env.DB, 'SELECT * FROM events WHERE id = ? AND deleted_at IS NULL AND is_alarm = 0', c.req.param('id'));
  return e ? c.json(eventView(e)) : fail(c, 404, 'not_found', 'That event no longer exists.');
});

events.patch('/events/:id', requireMember, async (c) => {
  const e = await loadEditable(c);
  if (e instanceof Response) return e;
  const input = await parseEventInput(c.env.DB, { ...eventView(e), ...(await body(c)) });
  if (typeof input === 'string') return fail(c, 400, 'invalid_input', input);
  const now = nowIso();
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE events SET title = ?, notes = ?, start_date = ?, start_time = ?, end_date = ?, end_time = ?, recurrence = ?,
         assigned_to = ?, remind_offset_min = ?, remind_channels = ?, renotify_min = ?, max_alerts = ?, updated_at = ?
       WHERE id = ?`).bind(
      input.title, input.notes, input.start_date, input.start_time, input.end_date, input.end_time, input.recurrence,
      input.assigned_to, input.remind_offset_min, input.remind_channels, input.renotify_min, input.max_alerts, now, e.id),
    removeFutureFires(c.env.DB, e.id, now),
  ]);
  return c.json(eventView((await first<EventRow>(c.env.DB, 'SELECT * FROM events WHERE id = ?', e.id))!));
});

events.delete('/events/:id', requireMember, async (c) => {
  const e = await loadEditable(c);
  if (e instanceof Response) return e;
  const now = nowIso();
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE events SET deleted_at = ?, updated_at = ? WHERE id = ?').bind(now, now, e.id),
    removeFutureFires(c.env.DB, e.id, now),
  ]);
  return c.json({ ok: true });
});

events.post('/events/:id/exdates', requireMember, async (c) => {
  const e = await loadEditable(c);
  if (e instanceof Response) return e;
  const b = await body(c);
  if (!isDate(b.date)) return fail(c, 400, 'invalid_input', 'date must be YYYY-MM-DD.');
  const ex = new Set(parseJson<string[]>(e.exdates, []));
  ex.add(b.date);
  const now = nowIso();
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE events SET exdates = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify([...ex].sort()), now, e.id),
    c.env.DB.prepare(
      `UPDATE fires SET state = 'closed', close_reason = 'removed', closed_at = ?
        WHERE event_id = ? AND occurrence_date = ? AND state = 'scheduled'`).bind(now, e.id, b.date),
  ]);
  return c.json({ ok: true });
});
