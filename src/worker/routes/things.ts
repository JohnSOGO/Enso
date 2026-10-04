// SPEC §7C, §10 — things to do: CRUD, Plan it, and closing a thing's scheduled fires on every edit.
// Every rule (limits, window, reminders, planning dates, order) is src/shared/things.ts; this route
// loads rows, calls it, and writes each change in ONE db.batch. Any member may do anything (§7C.1).
import { Hono, type Context } from 'hono';
import type { AppEnv } from '../env';
import {
  CLOSED_VISIBLE_DAYS, canPlanOn, openOrder, parseThingInput, plannedEventNotes, thingFromRow, type ThingRow,
} from '../../shared/things';
import { addMinutes } from '../../shared/time';
import { all, first, newId, nowIso } from '../db';
import { body, fail } from '../http';
import { requireMember } from '../session';
import { insertEventStatement, parseEventInput } from '../event-rows';

type Row = ThingRow & { planned_date: string | null };

/** A thing with its planned event's date (null when there is none, or it was deleted). */
const SELECT = `SELECT t.*, e.start_date AS planned_date FROM things t
  LEFT JOIN events e ON e.id = t.planned_event_id AND e.deleted_at IS NULL WHERE t.deleted_at IS NULL`;

const view = (r: Row) => thingFromRow(r, r.planned_date);
const loadRow = (db: D1Database, id: string) => first<Row>(db, `${SELECT} AND t.id = ?`, id);

/** The thing named by :id, or a 404 response. Shared with routes/thing-photos.ts. */
export async function loadThing(c: Context<AppEnv>): Promise<Row | Response> {
  const t = await loadRow(c.env.DB, c.req.param('id')!);
  return t ?? fail(c, 404, 'not_found', 'That thing no longer exists.');
}

/** §7C.2 — an edit makes the thing's future scheduled reminders obsolete; the next tick re-plans what still applies. */
const removeFutureFires = (db: D1Database, thingId: string, now: string) => db.prepare(
  `UPDATE fires SET state = 'closed', close_reason = 'removed', closed_at = ?
    WHERE thing_id = ? AND state = 'scheduled' AND due_at > ?`).bind(now, thingId, now);

export const things = new Hono<AppEnv>();

things.get('/things', requireMember, async (c) => {
  const since = addMinutes(nowIso(), -CLOSED_VISIBLE_DAYS * 24 * 60);
  const rows = await all<Row>(c.env.DB, `${SELECT} ORDER BY t.updated_at DESC`);
  return c.json({
    open: openOrder(rows.filter((r) => r.status === 'idea' || r.status === 'planned').map(view)),
    closed: rows.filter((r) => (r.status === 'done' || r.status === 'dropped') && r.updated_at >= since).map(view),
  });
});

things.post('/things', requireMember, async (c) => {
  const input = parseThingInput(await body(c));
  if (typeof input === 'string') return fail(c, 400, 'invalid_input', input);
  const id = newId('thg'), now = nowIso();
  // A new thing is always an idea; it is planned only through Plan it.
  await c.env.DB.prepare(
    `INSERT INTO things (id, title, note, place, address, phone, cost, url, window_start, window_end, remind_start, remind_on,
       channels, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'idea', ?, ?, ?)`,
  ).bind(id, input.title, input.note, input.place, input.address, input.phone, input.cost, input.url, input.window_start, input.window_end, input.remind_start ? 1 : 0,
    input.remind_on, JSON.stringify(input.channels), c.get('member').id, now, now).run();
  return c.json(view((await loadRow(c.env.DB, id))!), 201);
});

things.get('/things/:id', requireMember, async (c) => {
  const t = await loadThing(c);
  return t instanceof Response ? t : c.json(view(t));
});

things.patch('/things/:id', requireMember, async (c) => {
  const t = await loadThing(c);
  if (t instanceof Response) return t;
  const b = await body(c);
  const input = parseThingInput({ ...view(t), status: undefined, ...b });
  if (typeof input === 'string') return fail(c, 400, 'invalid_input', input);
  const status = input.status ?? t.status;
  if (status === 'planned' && t.status !== 'planned') return fail(c, 400, 'invalid_input', 'status: use Plan it to plan a thing.');
  // Back to an idea: it is no longer planned, so it forgets the event (the event itself stays on the calendar).
  const plannedEventId = status === 'idea' ? null : t.planned_event_id;
  const db = c.env.DB, now = nowIso();
  await db.batch([
    db.prepare(
      `UPDATE things SET title = ?, note = ?, place = ?, address = ?, phone = ?, cost = ?, url = ?, window_start = ?, window_end = ?, remind_start = ?, remind_on = ?,
         channels = ?, status = ?, planned_event_id = ?, updated_at = ? WHERE id = ?`,
    ).bind(input.title, input.note, input.place, input.address, input.phone, input.cost, input.url, input.window_start,
      input.window_end, input.remind_start ? 1 : 0, input.remind_on, JSON.stringify(input.channels), status, plannedEventId, now, t.id),
    removeFutureFires(db, t.id, now),
  ]);
  return c.json(view((await loadRow(db, t.id))!));
});

things.delete('/things/:id', requireMember, async (c) => {
  const t = await loadThing(c);
  if (t instanceof Response) return t;
  const db = c.env.DB, now = nowIso();
  await db.batch([
    db.prepare('UPDATE things SET deleted_at = ?, photo_key = NULL, updated_at = ? WHERE id = ?').bind(now, now, t.id),
    removeFutureFires(db, t.id, now),
  ]);
  if (t.photo_key) await c.env.PHOTOS.delete(t.photo_key); // §7C.3: deleting a thing deletes its photo
  return c.body(null, 204);
});

things.post('/things/:id/plan', requireMember, async (c) => {
  const t = await loadThing(c);
  if (t instanceof Response) return t;
  if (t.status !== 'idea') return fail(c, 409, 'not_an_idea', `This thing is ${t.status}; only an idea can be planned.`);
  const b = await body(c);
  if (!canPlanOn(t, b.date)) {
    return fail(c, 400, 'invalid_input', t.window_start || t.window_end
      ? `date must be a real date from ${t.window_start ?? 'any time'} to ${t.window_end ?? 'any time'}.`
      : 'date must be a real date, YYYY-MM-DD.');
  }
  // The event's fields go through the event form's own validation.
  const input = await parseEventInput(c.env.DB, {
    title: t.title, notes: plannedEventNotes(t), startDate: b.date, startTime: b.time ?? null,
  });
  if (typeof input === 'string') return fail(c, 400, 'invalid_input', input);
  const db = c.env.DB, now = nowIso(), eventId = newId('evt');
  await db.batch([
    insertEventStatement(db, eventId, input, c.get('member').id, now, t.id),
    db.prepare(`UPDATE things SET status = 'planned', planned_event_id = ?, updated_at = ? WHERE id = ?`).bind(eventId, now, t.id),
    // The event has its own reminder; every scheduled thing reminder closes, whatever its due time.
    db.prepare(`UPDATE fires SET state = 'closed', close_reason = 'removed', closed_at = ? WHERE thing_id = ? AND state = 'scheduled'`)
      .bind(now, t.id),
  ]);
  return c.json({ thing: view((await loadRow(db, t.id))!), eventId });
});
