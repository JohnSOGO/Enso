// SPEC §7.5, §10 — a member's own switch on an optional event: /optional-events, /events/{id}/optin.
import { Hono, type Context } from 'hono';
import type { AppEnv } from '../env';
import type { Recurrence } from '../../shared/recurrence';
import { all, first, nowIso, parseJson } from '../db';
import { fail } from '../http';
import { requireMember } from '../session';
import { onEventIds, optInStatement, optOutStatement } from '../event-rows';
import { isAdmin } from '../../shared/roles';
import { isMaskedFor, PRIVATE_TITLE } from '../../shared/event-access';

export const optins = new Hono<AppEnv>();

optins.get('/optional-events', requireMember, async (c) => {
  const rows = await all<{ id: string; title: string; recurrence: string | null; start_date: string; emoji: string | null; assigned_to: string; created_by: string; private: number }>(c.env.DB,
    `SELECT id, title, recurrence, start_date, emoji, assigned_to, created_by, private FROM events
      WHERE optional = 1 AND deleted_at IS NULL AND is_alarm = 0 ORDER BY title COLLATE NOCASE, start_date`);
  const me = c.get('member'), on = await onEventIds(c.env.DB, me.id), viewer = { id: me.id, admin: isAdmin(me) };
  return c.json(rows.map((e) => {
    const masked = isMaskedFor({ assignedTo: parseJson<string[]>(e.assigned_to, []), createdBy: e.created_by, private: e.private === 1 }, viewer); // §6.3
    return { id: e.id, title: masked ? PRIVATE_TITLE : e.title, recurrence: parseJson<Recurrence | null>(e.recurrence, null), startDate: e.start_date,
      emoji: masked ? null : e.emoji, on: on.has(e.id) };
  }));
});

/** Any member, for themselves only; 404 when the event is gone, 400 when it isn't optional (alarms never are). */
async function setOn(c: Context<AppEnv>, on: boolean) {
  const e = await first<{ optional: number }>(c.env.DB, 'SELECT optional FROM events WHERE id = ? AND deleted_at IS NULL', c.req.param('id'));
  if (!e) return fail(c, 404, 'not_found', 'That event no longer exists.');
  if (e.optional !== 1) return fail(c, 400, 'invalid_input', 'This event is not optional, so it is on for everyone.');
  const me = c.get('member').id, id = c.req.param('id')!;
  await (on ? optInStatement(c.env.DB, id, me, nowIso()) : optOutStatement(c.env.DB, id, me)).run();
  return c.body(null, 204);
}

optins.put('/events/:id/optin', requireMember, (c) => setOn(c, true));
optins.delete('/events/:id/optin', requireMember, (c) => setOn(c, false));
