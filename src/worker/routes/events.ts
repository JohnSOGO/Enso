// SPEC §4.2 events, §7 calendar, §7.5 optional events, §10 /calendar + /events. Sun events (§7.7) are never here.
import { Hono, type Context } from 'hono';
import type { AppEnv } from '../env';
import { addDays, diffDays, isDate } from '../../shared/time';
import { occurrences, type Recurrence } from '../../shared/recurrence';
import { publicHolidaysBetween } from '../../shared/holidays';
import { marketDaysBetween } from '../../shared/markets';
import { isOnFor } from '../../shared/optins';
import { all, first, newId, nowIso, parseJson } from '../db';
import { body, fail } from '../http';
import { requireMember } from '../session';
import { canChange } from '../../shared/roles';
import { eventView, insertEventStatement, onEventIds, optInStatement, parseEventInput, removeFutureFires, type EventRow } from '../event-rows';
import { daysOff } from './household';

const MAX_RANGE_DAYS = 120;

async function loadEditable(c: Context<AppEnv>): Promise<EventRow | Response> {
  const e = await first<EventRow>(c.env.DB, 'SELECT * FROM events WHERE id = ? AND deleted_at IS NULL AND is_alarm = 0 AND start_sun IS NULL', c.req.param('id'));
  if (!e) return fail(c, 404, 'not_found', 'That event no longer exists.');
  const me = c.get('member');
  if (!canChange(e.created_by, me)) return fail(c, 403, 'forbidden', 'Only the creator or an admin can change this event.');
  return e;
}

export const events = new Hono<AppEnv>();

events.get('/calendar', requireMember, async (c) => {
  const from = c.req.query('from'), to = c.req.query('to');
  if (!isDate(from) || !isDate(to) || to < from) return fail(c, 400, 'invalid_input', 'from and to must be YYYY-MM-DD with from ≤ to.');
  if (diffDays(to, from) > MAX_RANGE_DAYS) return fail(c, 400, 'invalid_input', `The range can be at most ${MAX_RANGE_DAYS} days.`);
  const rows = await all<EventRow & { color: string; creator_name: string }>(c.env.DB,
    `SELECT e.*, m.color, m.display_name AS creator_name FROM events e JOIN members m ON m.id = e.created_by
      WHERE e.deleted_at IS NULL AND e.is_alarm = 0 AND e.start_sun IS NULL AND e.start_date <= ? AND (e.recurrence IS NOT NULL OR e.end_date >= ?)`, to, from);
  const me = c.get('member').id, on = await onEventIds(c.env.DB, me);
  const occ = [];
  for (const e of rows) {
    if (!isOnFor(e, me, on.has(e.id) ? [me] : [])) continue; // §7.5: an optional event exists only for who has it on
    const span = diffDays(e.end_date, e.start_date);
    const ev = { start_date: e.start_date, recurrence: parseJson<Recurrence | null>(e.recurrence, null), exdates: parseJson<string[]>(e.exdates, []) };
    for (const date of occurrences(ev, addDays(from, -span), to)) {
      occ.push({
        eventId: e.id, date, endDate: addDays(date, span), startTime: e.start_time, endTime: e.end_time,
        title: e.title, allDay: e.start_time === null, color: e.color, createdBy: e.created_by, creatorName: e.creator_name,
        assignedTo: parseJson<string[]>(e.assigned_to, []), hasReminder: e.remind_offset_min !== null, recurring: e.recurrence !== null, emoji: e.emoji,
      });
    }
  }
  occ.sort((a, b) => (a.date + (a.startTime ?? '')).localeCompare(b.date + (b.startTime ?? '')));
  return c.json({ occurrences: occ, publicHolidays: publicHolidaysBetween(from, to, await daysOff(c.env.DB)), marketDays: marketDaysBetween(from, to) });
});

events.post('/events', requireMember, async (c) => {
  const input = await parseEventInput(c.env.DB, await body(c));
  if (typeof input === 'string') return fail(c, 400, 'invalid_input', input);
  const id = newId('evt'), me = c.get('member').id, now = nowIso();
  // §7.5: the creator of an optional event has it on from the start.
  await c.env.DB.batch([insertEventStatement(c.env.DB, id, input, me, now), ...(input.optional ? [optInStatement(c.env.DB, id, me, now)] : [])]);
  return c.json(eventView((await first<EventRow>(c.env.DB, 'SELECT * FROM events WHERE id = ?', id))!), 201);
});

events.get('/events/:id', requireMember, async (c) => {
  const e = await first<EventRow>(c.env.DB, 'SELECT * FROM events WHERE id = ? AND deleted_at IS NULL AND is_alarm = 0 AND start_sun IS NULL', c.req.param('id'));
  if (!e) return fail(c, 404, 'not_found', 'That event no longer exists.');
  return c.json({ ...eventView(e), on: (await onEventIds(c.env.DB, c.get('member').id)).has(e.id) });
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
         assigned_to = ?, remind_offset_min = ?, remind_channels = ?, renotify_min = ?, max_alerts = ?, optional = ?, emoji = ?, updated_at = ?
       WHERE id = ?`).bind(
      input.title, input.notes, input.start_date, input.start_time, input.end_date, input.end_time, input.recurrence,
      input.assigned_to, input.remind_offset_min, input.remind_channels, input.renotify_min, input.max_alerts, input.optional, input.emoji, now, e.id),
    removeFutureFires(c.env.DB, e.id, now),
    // §7.5 ⚑: whoever edits an event into optional has it on.
    ...(input.optional && !e.optional ? [optInStatement(c.env.DB, e.id, c.get('member').id, now)] : []),
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
