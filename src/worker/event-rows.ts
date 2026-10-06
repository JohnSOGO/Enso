// SPEC §4.2 — the event row: its shape, its wire view, input validation, and the
// insert / remove-future-fires statements shared by the events, alarms and things routes,
// and every read/write of event_optins (§7.5 — who has an optional event on).
import { CHANNEL, isOneOf, type Channel, type SunEvent } from '../shared/vocab';
import { isDate, isTime } from '../shared/time';
import { recurrenceError, type Recurrence } from '../shared/recurrence';
import { emojiError } from '../shared/emoji';
import { ALERT_TITLE_MAX } from '../shared/alert-limits';
import { all, parseJson } from './db';
import { intIn, optStr, str } from './http';

export interface EventRow {
  id: string; title: string; notes: string | null;
  start_date: string; start_time: string | null; end_date: string; end_time: string | null;
  recurrence: string | null; exdates: string; assigned_to: string;
  remind_offset_min: number | null; remind_channels: string | null; renotify_min: number | null; max_alerts: number;
  created_by: string; created_at: string; updated_at: string; deleted_at: string | null;
  is_alarm: number; thing_id: string | null; optional: number; emoji: string | null;
  /** §7.7 — set only by coordinator SQL; the event routes never show such a row. */
  start_sun: SunEvent | null;
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
    createdBy: e.created_by, updatedAt: e.updated_at, thingId: e.thing_id, optional: e.optional === 1, emoji: e.emoji,
  };
}

export type EventInput = Omit<EventRow, 'id' | 'exdates' | 'created_by' | 'created_at' | 'updated_at' | 'deleted_at' | 'is_alarm' | 'thing_id' | 'start_sun'>;

/** Validates untrusted event input → row fields, or an error message. */
export async function parseEventInput(db: D1Database, b: Record<string, unknown>): Promise<EventInput | string> {
  const title = str(b.title, ALERT_TITLE_MAX);
  if (!title) return `Title is required (up to ${ALERT_TITLE_MAX} characters).`;
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
  if (b.optional !== undefined && typeof b.optional !== 'boolean') return 'optional must be true or false.';
  const emoji = b.emoji === undefined || b.emoji === null || b.emoji === '' ? null : b.emoji;
  const emojiErr = emoji === null ? null : emojiError(emoji);
  if (emojiErr) return emojiErr;
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
    optional: b.optional ? 1 : 0, emoji: emoji as string | null,
  };
}

/** §5.6 — an edit makes future scheduled fires obsolete; the next tick re-materializes. */
export function removeFutureFires(db: D1Database, eventId: string, now: string): D1PreparedStatement {
  return db.prepare(
    `UPDATE fires SET state = 'closed', close_reason = 'removed', closed_at = ?
      WHERE event_id = ? AND state = 'scheduled' AND due_at > ?`).bind(now, eventId, now);
}

/** One new event row — POST /events, and Plan it (§7C.2) with its `thingId`. */
export function insertEventStatement(db: D1Database, id: string, input: EventInput, memberId: string, now: string, thingId: string | null = null): D1PreparedStatement {
  return db.prepare(
    `INSERT INTO events (id, title, notes, start_date, start_time, end_date, end_time, recurrence, assigned_to,
       remind_offset_min, remind_channels, renotify_min, max_alerts, created_by, created_at, updated_at, thing_id, optional, emoji)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, input.title, input.notes, input.start_date, input.start_time, input.end_date, input.end_time, input.recurrence,
    input.assigned_to, input.remind_offset_min, input.remind_channels, input.renotify_min, input.max_alerts, memberId, now, now, thingId, input.optional, input.emoji);
}

/** §7.5 — the ids of the events this member has turned on (their on-set). */
export async function onEventIds(db: D1Database, memberId: string): Promise<Set<string>> {
  return new Set((await all<{ event_id: string }>(db, 'SELECT event_id FROM event_optins WHERE member_id = ?', memberId)).map((r) => r.event_id));
}

/** §7.5 — the members who have this event on. */
export async function onMemberIds(db: D1Database, eventId: string | null): Promise<string[]> {
  return (await all<{ member_id: string }>(db, 'SELECT member_id FROM event_optins WHERE event_id = ? ORDER BY created_at', eventId)).map((r) => r.member_id);
}

/** Turns an event on for a member; turning it on twice is the same as once. */
export function optInStatement(db: D1Database, eventId: string, memberId: string, now: string): D1PreparedStatement {
  return db.prepare('INSERT OR IGNORE INTO event_optins (event_id, member_id, created_at) VALUES (?, ?, ?)').bind(eventId, memberId, now);
}

/** Turns an event off for a member. */
export function optOutStatement(db: D1Database, eventId: string, memberId: string): D1PreparedStatement {
  return db.prepare('DELETE FROM event_optins WHERE event_id = ? AND member_id = ?').bind(eventId, memberId);
}
