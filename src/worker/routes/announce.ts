// SPEC §9.3 — POST /announce: a house announcement, now. A delivery with no fire: one `house` row the
// Worker speaks right after answering (§9.2) on everyone's ticked speakers (§9.2a), and one `push` row per other member, sent at once. The
// sender's name comes from the session.
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { announceError, announceMessage } from '../../shared/announce';
import { audience } from '../../shared/optins';
import type { Channel } from '../../shared/vocab';
import { activeMemberIds, all, nowIso } from '../db';
import { houseDelivery, pushDelivery } from '../deliveries';
import { body, fail } from '../http';
import { requireMember } from '../session';
import { sendPushDeliveries } from '../push';
import { sendHouseDeliveries } from '../house';
import { deliverySpeakers } from '../speaker-choices';

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
  let houseId: string | null = null;
  const stmts: D1PreparedStatement[] = [];
  // §9.2a: for every active member, so on everyone's ticked speakers together; none ticked → not spoken.
  const speakers = channels.includes('house') ? await deliverySpeakers(db, await activeMemberIds(db)) : [];
  if (speakers === null || speakers.length) {
    const d = houseDelivery(db, { message, speakers }, now);
    ids.push(houseId = d.id);
    stmts.push(d.stmt);
  }
  if (channels.includes('push')) {
    const aud = audience({ optional: false, assignedTo: [], activeIds: await activeMemberIds(db), onIds: [], channels });
    for (const memberId of aud.push.filter((id) => id !== me.id)) {
      const d = pushDelivery(db, { memberId, message }, now);
      ids.push(d.id);
      pushIds.push(d.id);
      stmts.push(d.stmt);
    }
  }
  // Nothing would be sent — say why rather than succeed with nothing sent.
  if (!stmts.length && channels.includes('house') && speakers?.length === 0) return fail(c, 409, 'no_speakers', 'Nobody has a house speaker ticked.');
  if (!stmts.length) return fail(c, 409, 'no_recipients', 'There is nobody else to send a phone announcement to.');
  await db.batch(stmts);
  if (pushIds.length) await sendPushDeliveries(c.env, pushIds, now);

  const deliveries = await all<{ id: string; channel: Channel; memberId: string | null; status: string }>(db,
    `SELECT id, channel, member_id AS memberId, status FROM deliveries WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY channel, member_id`,
    ...ids);
  // Read above while the house row is still `queued`; now speak it without waiting for the next tick.
  if (houseId) c.executionCtx.waitUntil(sendHouseDeliveries(c.env, now, [houseId]));
  return c.json({ deliveries }, 201);
});
