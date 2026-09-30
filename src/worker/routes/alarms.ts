// SPEC §1, §4.2a, §8.5 — scheduled alarms: events with is_alarm = 1, managed as a list.
import { Hono, type Context } from 'hono';
import type { AppEnv } from '../env';
import { WEEKDAY, isOneOf, type Channel, type Weekday } from '../../shared/vocab';
import { addDays, isTime, localToUtc, ms, utcToLocal } from '../../shared/time';
import { occurrences, type Recurrence } from '../../shared/recurrence';
import { all, first, newId, nowIso, parseJson, run } from '../db';
import { body, fail } from '../http';
import { requireMember } from '../session';
import { parseEventInput, removeFutureFires, type EventRow } from './events';

interface AlarmRow extends EventRow {
  next_due_at: string | null;
  ringing: number;
}

/** Next due instant: the earliest planned fire, else computed from the weekly schedule (fires are only planned 36 h ahead). */
function nextDue(e: AlarmRow, tz: string, now: string): string | null {
  if (e.next_due_at) return e.next_due_at;
  const today = utcToLocal(now, tz).date;
  const ev = { start_date: e.start_date, recurrence: parseJson<Recurrence | null>(e.recurrence, null), exdates: parseJson<string[]>(e.exdates, []) };
  for (const date of occurrences(ev, today, addDays(today, 8))) {
    const due = localToUtc(date, e.start_time!, tz);
    if (ms(due) > ms(now)) return due;
  }
  return null;
}

function alarmView(e: AlarmRow, tz: string) {
  const r = parseJson<Recurrence | null>(e.recurrence, null);
  return {
    id: e.id, title: e.title, time: e.start_time, days: r?.byDay ?? [],
    channels: parseJson<Channel[]>(e.remind_channels, []), renotifyMin: e.renotify_min,
    assignedTo: parseJson<string[]>(e.assigned_to, []), createdBy: e.created_by,
    nextDueAt: e.ringing === 1 ? null : nextDue(e, tz, nowIso()), ringing: e.ringing === 1,
  };
}

const SELECT_ALARMS = `
  SELECT e.*,
    (SELECT MIN(f.due_at) FROM fires f WHERE f.event_id = e.id AND f.state = 'scheduled') AS next_due_at,
    EXISTS (SELECT 1 FROM fires f WHERE f.event_id = e.id AND f.state = 'ringing') AS ringing
  FROM events e WHERE e.is_alarm = 1 AND e.deleted_at IS NULL`;

/** Alarm fields → the event body parseEventInput understands. Returns an error message or the body. */
function toEventBody(b: Record<string, unknown>, startDate: string): Record<string, unknown> | string {
  if (!isTime(b.time)) return 'Time must be HH:MM.';
  const days = b.days;
  if (!Array.isArray(days) || days.length === 0) return 'Pick at least one day of the week.';
  if (!days.every((d) => isOneOf(WEEKDAY, d))) return `Days must be from: ${WEEKDAY.join(', ')}.`;
  const byDay = WEEKDAY.filter((d) => days.includes(d)) as Weekday[];
  return {
    title: b.title, startDate, startTime: b.time, endTime: null,
    recurrence: { freq: 'WEEKLY', byDay }, assignedTo: b.assignedTo ?? [],
    reminder: { offsetMin: 0, channels: b.channels, renotifyMin: b.renotifyMin ?? null },
  };
}

async function loadAlarm(c: Context<AppEnv>, forWrite: boolean): Promise<AlarmRow | Response> {
  const a = await first<AlarmRow>(c.env.DB, `${SELECT_ALARMS} AND e.id = ?`, c.req.param('id'));
  if (!a) return fail(c, 404, 'not_found', 'That alarm no longer exists.');
  const me = c.get('member');
  if (forWrite && a.created_by !== me.id && me.role !== 'owner') return fail(c, 403, 'forbidden', 'Only the creator or the owner can change this alarm.');
  return a;
}

export const alarms = new Hono<AppEnv>();

const householdTz = async (db: D1Database) => (await first<{ timezone: string }>(db, 'SELECT timezone FROM settings WHERE id = 1'))!.timezone;

alarms.get('/alarms', requireMember, async (c) => {
  const tz = await householdTz(c.env.DB);
  const rows = await all<AlarmRow>(c.env.DB, `${SELECT_ALARMS} ORDER BY e.start_time, e.title`);
  return c.json(rows.map((r) => alarmView(r, tz)));
});

alarms.post('/alarms', requireMember, async (c) => {
  const tz = await householdTz(c.env.DB);
  const today = utcToLocal(nowIso(), tz).date;
  const eventBody = toEventBody(await body(c), today);
  if (typeof eventBody === 'string') return fail(c, 400, 'invalid_input', eventBody);
  const input = await parseEventInput(c.env.DB, eventBody);
  if (typeof input === 'string') return fail(c, 400, 'invalid_input', input);
  const id = newId('evt'), now = nowIso();
  await run(c.env.DB,
    `INSERT INTO events (id, title, notes, start_date, start_time, end_date, end_time, recurrence, assigned_to,
       remind_offset_min, remind_channels, renotify_min, max_alerts, created_by, created_at, updated_at, is_alarm)
     VALUES (?, ?, NULL, ?, ?, ?, NULL, ?, ?, 0, ?, ?, ?, ?, ?, ?, 1)`,
    id, input.title, input.start_date, input.start_time, input.end_date, input.recurrence, input.assigned_to,
    input.remind_channels, input.renotify_min, input.max_alerts, c.get('member').id, now, now);
  return c.json(alarmView((await first<AlarmRow>(c.env.DB, `${SELECT_ALARMS} AND e.id = ?`, id))!, tz), 201);
});

alarms.patch('/alarms/:id', requireMember, async (c) => {
  const a = await loadAlarm(c, true);
  if (a instanceof Response) return a;
  const tz = await householdTz(c.env.DB);
  const merged = { ...alarmView(a, tz), ...(await body(c)) };
  const eventBody = toEventBody(merged, a.start_date);
  if (typeof eventBody === 'string') return fail(c, 400, 'invalid_input', eventBody);
  const input = await parseEventInput(c.env.DB, eventBody);
  if (typeof input === 'string') return fail(c, 400, 'invalid_input', input);
  const now = nowIso();
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE events SET title = ?, start_time = ?, recurrence = ?, assigned_to = ?, remind_channels = ?, renotify_min = ?, updated_at = ?
        WHERE id = ?`).bind(input.title, input.start_time, input.recurrence, input.assigned_to, input.remind_channels, input.renotify_min, now, a.id),
    removeFutureFires(c.env.DB, a.id, now),
  ]);
  return c.json(alarmView((await first<AlarmRow>(c.env.DB, `${SELECT_ALARMS} AND e.id = ?`, a.id))!, tz));
});

alarms.delete('/alarms/:id', requireMember, async (c) => {
  const a = await loadAlarm(c, true);
  if (a instanceof Response) return a;
  const now = nowIso();
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE events SET deleted_at = ?, updated_at = ? WHERE id = ?').bind(now, now, a.id),
    removeFutureFires(c.env.DB, a.id, now),
  ]);
  return c.json({ ok: true });
});
