// SPEC §9.1 — Web Push sending.
// PROTOTYPE: the VAPID sender is milestone M5 and is not built yet. Every push delivery is
// resolved VISIBLY as `failed` with a reason, never left queued or silently dropped.
import type { Env } from './env';
import { all } from './db';

export const PUSH_NOT_BUILT = 'push_sender_not_built (M5)';
export const NO_SUBSCRIPTION = 'no_subscription';

export async function sendPushDeliveries(env: Env, deliveryIds: string[], now: string): Promise<void> {
  const db = env.DB;
  const placeholders = deliveryIds.map(() => '?').join(',');
  const rows = await all<{ id: string; member_id: string; subs: number }>(db,
    `SELECT d.id, d.member_id, (SELECT COUNT(*) FROM push_subscriptions s WHERE s.member_id = d.member_id) AS subs
       FROM deliveries d WHERE d.id IN (${placeholders})`, ...deliveryIds);
  const stmts = rows.map((r) =>
    db.prepare(`UPDATE deliveries SET status = 'failed', detail = ?, attempts = attempts + 1, updated_at = ? WHERE id = ?`)
      .bind(r.subs === 0 ? NO_SUBSCRIPTION : PUSH_NOT_BUILT, now, r.id));
  if (stmts.length) await db.batch(stmts);
}
