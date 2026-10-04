// SPEC §9.3 — POST /announce: a house announcement, now. A delivery with no fire: one `house` row the
// relay speaks, and one `push` row per other member, sent at once. The sender's name comes from the session.
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { announceError, announceMessage } from '../../shared/announce';
import { audience } from '../../shared/optins';
import type { Channel } from '../../shared/vocab';
import { all, newId, nowIso } from '../db';
import { body, fail } from '../http';
import { requireMember } from '../session';
import { activeMemberIds } from '../tick';
import { sendPushDeliveries } from '../push';

export const announce = new Hono<AppEnv>();

announce.post('/announce', requireMember, async (c) => {
  const b = await body(c);
  const err = announceError({ text: b.text, channels: b.channels });
  if (err) return fail(c, 400, 'invalid_input', err);
  const db = c.env.DB;
  const me = c.get('member');
  const channels = b.channels as Channel[];
  const message = announceMessage(me.display_name, b.text as string);
  const now = nowIso();

  const ids: string[] = [];
  const pushIds: string[] = [];
  const stmts: D1PreparedStatement[] = [];
  if (channels.includes('house')) {
    const id = newId('dlv');
    ids.push(id);
    stmts.push(db.prepare(
      `INSERT INTO deliveries (id, fire_id, alert_number, channel, member_id, message, status, created_at, updated_at)
       VALUES (?, NULL, 1, 'house', NULL, ?, 'queued', ?, ?)`).bind(id, message, now, now));
  }
  if (channels.includes('push')) {
    const aud = audience({ optional: false, assignedTo: [], activeIds: await activeMemberIds(db), onIds: [], channels });
    for (const memberId of aud.push.filter((id) => id !== me.id)) {
      const id = newId('dlv');
      ids.push(id);
      pushIds.push(id);
      stmts.push(db.prepare(
        `INSERT INTO deliveries (id, fire_id, alert_number, channel, member_id, message, status, created_at, updated_at)
         VALUES (?, NULL, 1, 'push', ?, ?, 'queued', ?, ?)`).bind(id, memberId, message, now, now));
    }
  }
  // Phone only, and nobody else in the household: say so rather than succeed with nothing sent.
  if (!stmts.length) return fail(c, 409, 'no_recipients', 'There is nobody else to send a phone announcement to.');
  await db.batch(stmts);
  if (pushIds.length) await sendPushDeliveries(c.env, pushIds, now);

  const deliveries = await all<{ id: string; channel: Channel; memberId: string | null; status: string }>(db,
    `SELECT id, channel, member_id AS memberId, status FROM deliveries WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY channel, member_id`,
    ...ids);
  return c.json({ deliveries }, 201);
});
