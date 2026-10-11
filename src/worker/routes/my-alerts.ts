// SPEC §9.5 — GET / DELETE /me/alerts: each member's own pushes, newest first, and hiding them from that list.
// The only reader or writer of deliveries.dismissed_at; a hidden row is kept (Status and the ping limit count it).
// How a push is described (title, source) is src/shared/alert-history.ts.
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { ALERT_HISTORY_MAX, alertSource, pushTitle } from '../../shared/alert-history';
import type { AlertKind, DeliveryStatus } from '../../shared/vocab';
import { all, nowIso, run } from '../db';
import { fail } from '../http';
import { requireMember } from '../session';

export const myAlerts = new Hono<AppEnv>();

interface Row {
  id: string; message: string; title: string | null; notice: string | null; mess_id: string | null; status: DeliveryStatus;
  detail: string | null; alert_number: number; created_at: string; fire_id: string | null; kind: AlertKind | null; is_alarm: number | null;
}

const MINE = `channel = 'push' AND member_id = ? AND dismissed_at IS NULL`;

myAlerts.get('/me/alerts', requireMember, async (c) => {
  const rows = await all<Row>(c.env.DB,
    `SELECT d.id, d.message, d.title, d.notice, d.mess_id, d.status, d.detail, d.alert_number, d.created_at, d.fire_id, f.kind, e.is_alarm
       FROM deliveries d LEFT JOIN fires f ON f.id = d.fire_id LEFT JOIN events e ON e.id = f.event_id
      WHERE d.channel = 'push' AND d.member_id = ? AND d.dismissed_at IS NULL ORDER BY d.created_at DESC, d.id DESC LIMIT ?`, c.get('member').id, ALERT_HISTORY_MAX);
  return c.json({
    alerts: rows.map((r) => {
      const hasFire = r.fire_id !== null && r.kind !== null; // the same test push.ts sends by
      return {
        id: r.id, title: pushTitle({ hasFire, title: r.title }), message: r.message,
        source: alertSource({ hasFire, kind: r.kind, isAlarm: r.is_alarm === 1, notice: r.notice, messId: r.mess_id, title: r.title }),
        kind: hasFire ? r.kind : null, alertNumber: hasFire ? r.alert_number : null, status: r.status, detail: r.detail, createdAt: r.created_at,
      };
    }),
  });
});

myAlerts.delete('/me/alerts/:id', requireMember, async (c) => {
  const r = await run(c.env.DB, `UPDATE deliveries SET dismissed_at = ? WHERE id = ? AND ${MINE}`, nowIso(), c.req.param('id'), c.get('member').id);
  if (!r.meta.changes) return fail(c, 404, 'not_found', 'That alert is not in your list.');
  return c.body(null, 204);
});

myAlerts.delete('/me/alerts', requireMember, async (c) => {
  const r = await run(c.env.DB, `UPDATE deliveries SET dismissed_at = ? WHERE ${MINE}`, nowIso(), c.get('member').id);
  return c.json({ cleared: r.meta.changes });
});
