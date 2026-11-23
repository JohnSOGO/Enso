// SPEC §8.5b — one-off reminders: is_alarm events with recurrence NULL that ring until Done; §8.5c — or WEEKLY on the
// chosen days with a Random window; §8.5d — or WEEKLY at sunrise / sunset (start_sun); §8.5 — an Until on the repeating
// ones. Validates, persists and composes the view; the rules are src/shared/reminders.ts.
import { Hono, type Context } from 'hono';
import type { AppEnv } from '../env';
import type { Channel, Weekday } from '../../shared/vocab';
import { localToUtc, ms, utcToLocal } from '../../shared/time';
import { untilError, type Recurrence } from '../../shared/recurrence';
import type { Place } from '../../shared/sun';
import { canChange, cannotChangeText } from '../../shared/roles';
import {
  REMINDER_MAX_ALERTS, REMINDER_RENOTIFY_DEFAULT, nextRing, reminderState, reminderTimeError, sunReminderError, windowDays, windowError,
  type ReminderSun, type ReminderWindow,
} from '../../shared/reminders';
import { all, first, householdPlace, householdTz, newId, nowIso, parseJson } from '../db';
import { body, fail } from '../http';
import { requireMember } from '../session';
import { insertEventStatement, parseEventInput, removeFutureFires, type EventRow } from '../event-rows';

interface ReminderRow extends EventRow {
  open_due_at: string | null;
  ringing: number;
  done: number;
}

const SELECT_REMINDERS = `
  SELECT e.*,
    (SELECT MIN(f.due_at) FROM fires f WHERE f.event_id = e.id AND f.state != 'closed') AS open_due_at,
    EXISTS (SELECT 1 FROM fires f WHERE f.event_id = e.id AND f.state = 'ringing') AS ringing,
    EXISTS (SELECT 1 FROM fires f WHERE f.event_id = e.id AND f.state = 'closed' AND f.close_reason IN ('done', 'acked')
      AND e.start_sun IS NULL) AS done
  FROM events e WHERE e.is_alarm = 1 AND (e.recurrence IS NULL OR e.remind_random_from IS NOT NULL OR e.start_sun IS NOT NULL)
    AND e.deleted_at IS NULL`; // §8.5d ⚑ Q417: Done on a sun ring closes that day only, so it is never "done"

function reminderView(e: ReminderRow, tz: string, now: string, place: Place | null) {
  const startAt = e.start_time ? localToUtc(e.start_date, e.start_time, tz) : now;
  const recurrence = parseJson<Recurrence | null>(e.recurrence, null);
  const days = recurrence?.byDay ?? [];
  const window: ReminderWindow | null = e.remind_random_from ? { days, from: e.remind_random_from, to: e.remind_random_to! } : null;
  const sun: ReminderSun | null = e.start_sun ? { at: e.start_sun, offsetMin: e.remind_offset_min ?? 0, days } : null;
  const repeating = !!(window || sun);
  const next = repeating && !e.open_due_at ? nextRing({
    id: e.id, start_date: e.start_date, start_time: e.start_time, recurrence, exdates: parseJson<string[]>(e.exdates, []),
    remind_offset_min: e.remind_offset_min, remind_random_from: e.remind_random_from, remind_random_to: e.remind_random_to, start_sun: e.start_sun,
  }, now, tz, place) : null;
  const state = reminderState({ done: e.done === 1, ringing: e.ringing === 1, openDueAt: e.open_due_at, startAt, repeating, next }, now);
  if (!state) return null;
  return {
    id: e.id, title: e.title, date: e.start_date, time: e.start_time,
    channels: parseJson<Channel[]>(e.remind_channels, []), renotifyMin: e.renotify_min,
    assignedTo: parseJson<string[]>(e.assigned_to, []), createdBy: e.created_by, state, dueAt: e.open_due_at ?? next ?? startAt, window, sun,
    until: recurrence?.until ?? null,
  };
}

/** The WEEKLY repeat of a window or sun reminder: its days and its Until (§8.5 ⚑ Q416), or the refusal. */
function weekly(days: Weekday[], until: unknown, today: string): Recurrence | string {
  return untilError(until, today) ?? { freq: 'WEEKLY', byDay: windowDays(days), ...(until ? { until: until as string } : {}) };
}

/** Reminder fields → the event body parseEventInput understands, or the refusal. A window (§8.5c) or sun (§8.5d) one starts today. */
function toEventBody(b: Record<string, unknown>, tz: string, now: string): Record<string, unknown> | string {
  const base = { title: b.title, endTime: null, assignedTo: b.assignedTo ?? [] };
  const today = utcToLocal(now, tz).date;
  if (b.window) {
    const err = windowError(b.window);
    if (err) return err;
    const w = b.window as ReminderWindow;
    const recurrence = weekly(w.days, b.until, today);
    if (typeof recurrence === 'string') return recurrence;
    return {
      ...base, startDate: today, startTime: w.from, recurrence,
      reminder: { offsetMin: 0, channels: b.channels, renotifyMin: null, maxAlerts: 1, randomFrom: w.from, randomTo: w.to }, // ⚑ Q327
    };
  }
  if (b.sun) {
    const err = sunReminderError(b.sun);
    if (err) return err;
    const s = b.sun as ReminderSun;
    const recurrence = weekly(s.days, b.until, today);
    if (typeof recurrence === 'string') return recurrence;
    return {
      ...base, startDate: today, startTime: null, startSun: s.at, recurrence,
      reminder: { offsetMin: s.offsetMin, channels: b.channels, renotifyMin: b.renotifyMin ?? REMINDER_RENOTIFY_DEFAULT, maxAlerts: REMINDER_MAX_ALERTS },
    };
  }
  const err = reminderTimeError(b.date, b.time, tz, now);
  if (err) return err;
  return {
    ...base, startDate: b.date, startTime: b.time, recurrence: null,
    reminder: { offsetMin: 0, channels: b.channels, renotifyMin: b.renotifyMin ?? REMINDER_RENOTIFY_DEFAULT, maxAlerts: REMINDER_MAX_ALERTS },
  };
}

const loadRow = (db: D1Database, id: string) => first<ReminderRow>(db, `${SELECT_REMINDERS} AND e.id = ?`, id);

/** A listed reminder this member may change, or the refusal (a done one is gone: 404). */
async function loadForWrite(c: Context<AppEnv>, tz: string, now: string, place: Place | null): Promise<{ row: ReminderRow; view: NonNullable<ReturnType<typeof reminderView>> } | Response> {
  const row = await loadRow(c.env.DB, c.req.param('id')!);
  const view = row && reminderView(row, tz, now, place);
  if (!row || !view) return fail(c, 404, 'not_found', 'That reminder no longer exists.');
  if (!canChange(row.created_by, c.get('member'))) return fail(c, 403, 'forbidden', cannotChangeText('reminder'));
  return { row, view };
}

const context = async (db: D1Database) => ({ tz: await householdTz(db), now: nowIso(), place: await householdPlace(db) });

export const reminders = new Hono<AppEnv>();

reminders.get('/reminders', requireMember, async (c) => {
  const { tz, now, place } = await context(c.env.DB);
  const views = (await all<ReminderRow>(c.env.DB, SELECT_REMINDERS)).map((r) => reminderView(r, tz, now, place)).filter((v) => v !== null);
  return c.json(views.sort((a, b) => ms(a.dueAt) - ms(b.dueAt) || a.title.localeCompare(b.title)));
});

reminders.post('/reminders', requireMember, async (c) => {
  const { tz, now, place } = await context(c.env.DB);
  const eventBody = toEventBody(await body(c), tz, now);
  if (typeof eventBody === 'string') return fail(c, 400, 'invalid_input', eventBody);
  const input = await parseEventInput(c.env.DB, eventBody, true);
  if (typeof input === 'string') return fail(c, 400, 'invalid_input', input);
  const id = newId('evt');
  await insertEventStatement(c.env.DB, id, input, c.get('member').id, now, null, true).run();
  return c.json(reminderView((await loadRow(c.env.DB, id))!, tz, now, place), 201);
});

reminders.patch('/reminders/:id', requireMember, async (c) => {
  const { tz, now, place } = await context(c.env.DB);
  const r = await loadForWrite(c, tz, now, place);
  if (r instanceof Response) return r;
  const eventBody = toEventBody({ ...r.view, ...(await body(c)) }, tz, now);
  if (typeof eventBody === 'string') return fail(c, 400, 'invalid_input', eventBody);
  const input = await parseEventInput(c.env.DB, eventBody, true);
  if (typeof input === 'string') return fail(c, 400, 'invalid_input', input);
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE events SET title = ?, start_date = ?, end_date = ?, start_time = ?, recurrence = ?, assigned_to = ?, remind_channels = ?, renotify_min = ?,
         max_alerts = ?, remind_random_from = ?, remind_random_to = ?, start_sun = ?, remind_offset_min = ?, updated_at = ?
        WHERE id = ?`).bind(input.title, input.start_date, input.end_date, input.start_time, input.recurrence, input.assigned_to, input.remind_channels,
      input.renotify_min, input.max_alerts, input.remind_random_from, input.remind_random_to, input.start_sun, input.remind_offset_min, now, r.row.id),
    removeFutureFires(c.env.DB, r.row.id, now),
  ]);
  return c.json(reminderView((await loadRow(c.env.DB, r.row.id))!, tz, now, place));
});

reminders.delete('/reminders/:id', requireMember, async (c) => {
  const { tz, now, place } = await context(c.env.DB);
  const r = await loadForWrite(c, tz, now, place);
  if (r instanceof Response) return r;
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE events SET deleted_at = ?, updated_at = ? WHERE id = ?').bind(now, now, r.row.id),
    removeFutureFires(c.env.DB, r.row.id, now),
  ]);
  return c.json({ ok: true });
});
