// SPEC §8.5b — one-off reminders: is_alarm events with recurrence NULL that ring until Done; §8.5c — or WEEKLY on the
// chosen days with a Random window. Validates, persists and composes the view; the rules are src/shared/reminders.ts.
import { Hono, type Context } from 'hono';
import type { AppEnv } from '../env';
import type { Channel } from '../../shared/vocab';
import { localToUtc, ms, utcToLocal } from '../../shared/time';
import type { Recurrence } from '../../shared/recurrence';
import { canChange, cannotChangeText } from '../../shared/roles';
import {
  REMINDER_MAX_ALERTS, REMINDER_RENOTIFY_DEFAULT, nextWindowRing, reminderState, reminderTimeError, windowDays, windowError, type ReminderWindow,
} from '../../shared/reminders';
import { all, first, householdTz, newId, nowIso, parseJson } from '../db';
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
    EXISTS (SELECT 1 FROM fires f WHERE f.event_id = e.id AND f.state = 'closed' AND f.close_reason IN ('done', 'acked')) AS done
  FROM events e WHERE e.is_alarm = 1 AND (e.recurrence IS NULL OR e.remind_random_from IS NOT NULL) AND e.deleted_at IS NULL`;

function reminderView(e: ReminderRow, tz: string, now: string) {
  const startAt = localToUtc(e.start_date, e.start_time!, tz);
  const recurrence = parseJson<Recurrence | null>(e.recurrence, null);
  const window: ReminderWindow | null = e.remind_random_from
    ? { days: recurrence?.byDay ?? [], from: e.remind_random_from, to: e.remind_random_to! } : null;
  const state = reminderState({ done: e.done === 1, ringing: e.ringing === 1, openDueAt: e.open_due_at, startAt, window: !!window }, now);
  if (!state) return null;
  const next = window && !e.open_due_at ? nextWindowRing({
    id: e.id, start_date: e.start_date, start_time: e.start_time, recurrence, exdates: parseJson<string[]>(e.exdates, []),
    remind_offset_min: e.remind_offset_min, remind_random_from: e.remind_random_from, remind_random_to: e.remind_random_to,
  }, now, tz) : null;
  return {
    id: e.id, title: e.title, date: e.start_date, time: e.start_time,
    channels: parseJson<Channel[]>(e.remind_channels, []), renotifyMin: e.renotify_min,
    assignedTo: parseJson<string[]>(e.assigned_to, []), createdBy: e.created_by, state, dueAt: e.open_due_at ?? next ?? startAt, window,
  };
}

/** Reminder fields → the event body parseEventInput understands, or the refusal. A window (§8.5c) starts today. */
function toEventBody(b: Record<string, unknown>, tz: string, now: string): Record<string, unknown> | string {
  const base = { title: b.title, endTime: null, assignedTo: b.assignedTo ?? [] };
  if (b.window) {
    const err = windowError(b.window);
    if (err) return err;
    const w = b.window as ReminderWindow;
    return {
      ...base, startDate: utcToLocal(now, tz).date, startTime: w.from, recurrence: { freq: 'WEEKLY', byDay: windowDays(w.days) },
      reminder: { offsetMin: 0, channels: b.channels, renotifyMin: null, maxAlerts: 1, randomFrom: w.from, randomTo: w.to }, // ⚑ Q319
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
async function loadForWrite(c: Context<AppEnv>, tz: string, now: string): Promise<{ row: ReminderRow; view: NonNullable<ReturnType<typeof reminderView>> } | Response> {
  const row = await loadRow(c.env.DB, c.req.param('id')!);
  const view = row && reminderView(row, tz, now);
  if (!row || !view) return fail(c, 404, 'not_found', 'That reminder no longer exists.');
  if (!canChange(row.created_by, c.get('member'))) return fail(c, 403, 'forbidden', cannotChangeText('reminder'));
  return { row, view };
}

export const reminders = new Hono<AppEnv>();

reminders.get('/reminders', requireMember, async (c) => {
  const tz = await householdTz(c.env.DB), now = nowIso();
  const views = (await all<ReminderRow>(c.env.DB, SELECT_REMINDERS)).map((r) => reminderView(r, tz, now)).filter((v) => v !== null);
  return c.json(views.sort((a, b) => ms(a.dueAt) - ms(b.dueAt) || a.title.localeCompare(b.title)));
});

reminders.post('/reminders', requireMember, async (c) => {
  const tz = await householdTz(c.env.DB), now = nowIso();
  const eventBody = toEventBody(await body(c), tz, now);
  if (typeof eventBody === 'string') return fail(c, 400, 'invalid_input', eventBody);
  const input = await parseEventInput(c.env.DB, eventBody);
  if (typeof input === 'string') return fail(c, 400, 'invalid_input', input);
  const id = newId('evt');
  await insertEventStatement(c.env.DB, id, input, c.get('member').id, now, null, true).run();
  return c.json(reminderView((await loadRow(c.env.DB, id))!, tz, now), 201);
});

reminders.patch('/reminders/:id', requireMember, async (c) => {
  const tz = await householdTz(c.env.DB), now = nowIso();
  const r = await loadForWrite(c, tz, now);
  if (r instanceof Response) return r;
  const eventBody = toEventBody({ ...r.view, ...(await body(c)) }, tz, now);
  if (typeof eventBody === 'string') return fail(c, 400, 'invalid_input', eventBody);
  const input = await parseEventInput(c.env.DB, eventBody);
  if (typeof input === 'string') return fail(c, 400, 'invalid_input', input);
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE events SET title = ?, start_date = ?, end_date = ?, start_time = ?, recurrence = ?, assigned_to = ?, remind_channels = ?, renotify_min = ?,
         max_alerts = ?, remind_random_from = ?, remind_random_to = ?, updated_at = ?
        WHERE id = ?`).bind(input.title, input.start_date, input.end_date, input.start_time, input.recurrence, input.assigned_to, input.remind_channels,
      input.renotify_min, input.max_alerts, input.remind_random_from, input.remind_random_to, now, r.row.id),
    removeFutureFires(c.env.DB, r.row.id, now),
  ]);
  return c.json(reminderView((await loadRow(c.env.DB, r.row.id))!, tz, now));
});

reminders.delete('/reminders/:id', requireMember, async (c) => {
  const tz = await householdTz(c.env.DB), now = nowIso();
  const r = await loadForWrite(c, tz, now);
  if (r instanceof Response) return r;
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE events SET deleted_at = ?, updated_at = ? WHERE id = ?').bind(now, now, r.row.id),
    removeFutureFires(c.env.DB, r.row.id, now),
  ]);
  return c.json({ ok: true });
});
