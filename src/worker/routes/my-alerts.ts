// SPEC §9.5 — GET / DELETE /me/alerts: each member's own pushes, newest first, and hiding them from that list.
// The only reader or writer of deliveries.dismissed_at; a hidden row is kept (Status and the ping limit count it).
// How a push is described (title, source) and when a handled one leaves the list (isCleared) is src/shared/alert-history.ts;
// a mess ask asks me per askedOf (a deleted mess no longer asks anyone).
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { ALERT_HISTORY_MAX, alertSource, isCleared, pushTitle } from '../../shared/alert-history';
import { MESS_ASK_TITLE, askedOf } from '../../shared/messes';
import type { AlertKind, DeliveryStatus, FireState } from '../../shared/vocab';
import { activeMemberIds, all, nowIso, run } from '../db';
import { fail } from '../http';
import { requireMember } from '../session';

export const myAlerts = new Hono<AppEnv>();

interface Row {
  id: string; message: string; title: string | null; notice: string | null; mess_id: string | null; status: DeliveryStatus;
  detail: string | null; alert_number: number; created_at: string; fire_id: string | null; kind: AlertKind | null; is_alarm: number | null; state: FireState | null;
  m_id: string | null; m_deleted: string | null; reported_by: string; settled_at: string | null; closed_at: string | null;
  claimed_by: string | null; discuss_at: string | null; denied_me: number;
}

const MINE = `channel = 'push' AND member_id = ? AND dismissed_at IS NULL`;

myAlerts.get('/me/alerts', requireMember, async (c) => {
  const me = c.get('member').id;
  const rows = await all<Row>(c.env.DB,
    `SELECT d.id, d.message, d.title, d.notice, d.mess_id, d.status, d.detail, d.alert_number, d.created_at, d.fire_id, f.kind, f.state, e.is_alarm,
            m.id AS m_id, m.deleted_at AS m_deleted, m.reported_by, m.settled_at, m.closed_at, m.claimed_by, m.discuss_at,
            EXISTS (SELECT 1 FROM mess_denials x WHERE x.mess_id = d.mess_id AND x.member_id = d.member_id) AS denied_me
       FROM deliveries d LEFT JOIN fires f ON f.id = d.fire_id LEFT JOIN events e ON e.id = f.event_id LEFT JOIN messes m ON m.id = d.mess_id
      WHERE d.channel = 'push' AND d.member_id = ? AND d.dismissed_at IS NULL ORDER BY d.created_at DESC, d.id DESC LIMIT ?`, me, ALERT_HISTORY_MAX);
  const active = rows.some((r) => r.title === MESS_ASK_TITLE) ? await activeMemberIds(c.env.DB) : [];
  const messAsksMe = (r: Row) => r.title !== MESS_ASK_TITLE || !r.mess_id ? null
    : r.m_id !== null && !r.m_deleted && askedOf(r, active, r.denied_me ? [me] : []).includes(me);
  return c.json({
    alerts: rows.filter((r) => !isCleared({ fireState: r.state, messAsksMe: messAsksMe(r) })).map((r) => {
      const hasFire = r.fire_id !== null && r.kind !== null; // the same test push.ts sends by
      return {
        id: r.id, title: pushTitle({ hasFire, title: r.title }), message: r.message,
        source: alertSource({ hasFire, kind: r.kind, isAlarm: r.is_alarm === 1, notice: r.notice, messId: r.mess_id, title: r.title }),
        kind: hasFire ? r.kind : null, alertNumber: hasFire ? r.alert_number : null, fireId: hasFire ? r.fire_id : null, messId: r.mess_id, status: r.status, detail: r.detail, createdAt: r.created_at,
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
