// SPEC §7B.9 — payback pings: tick step 3g. Each live payback plan due today, at or after PLAN_PING_TIME, with something
// owed and not yet pinged today, pings the one who owes once, phone only, with no fire (never spoken, never on the
// FunHouse). The rules (due, the amount, the words) are src/shared/ious.ts; "pinged today" is read from
// deliveries.iou_plan_id.
import type { Env } from './env';
import { activeMemberIds, all, householdTz } from './db';
import { pushDelivery, type Written } from './deliveries';
import { sendPushDeliveries } from './push';
import { PAYBACK_TITLE, owedCents, paybackMessage, pingDue, type IouPaymentRow, type IouPlanRow, type IouRow } from '../shared/ious';
import { dayStartUtc, utcToLocal } from '../shared/time';

export async function iouPingTick(env: Env, now: string): Promise<void> {
  const db = env.DB;
  const tz = await householdTz(db);
  const local = utcToLocal(now, tz);
  const plans = await all<IouPlanRow & { to_name: string }>(db,
    `SELECT p.*, m.display_name AS to_name FROM iou_plans p JOIN members m ON m.id = p.owed_to
      WHERE p.ended_at IS NULL AND NOT EXISTS (SELECT 1 FROM deliveries d WHERE d.iou_plan_id = p.id AND d.created_at >= ?)`,
    dayStartUtc(now, tz));
  if (!plans.length) return;
  const active = await activeMemberIds(db);
  const written: Written[] = [];
  for (const p of plans) {
    if (!active.includes(p.owed_by)) continue;
    const [ious, payments] = await Promise.all([
      all<IouRow>(db, 'SELECT * FROM ious WHERE owed_by = ? AND owed_to = ? AND deleted_at IS NULL', p.owed_by, p.owed_to),
      all<IouPaymentRow>(db, 'SELECT * FROM iou_payments WHERE owed_by = ? AND owed_to = ? AND deleted_at IS NULL', p.owed_by, p.owed_to),
    ]);
    const owed = owedCents(ious, payments);
    if (!pingDue(p, local.date, local.time, owed)) continue;
    written.push(pushDelivery(db, {
      memberId: p.owed_by, message: paybackMessage(p.to_name, Math.min(p.cents_each, owed), owed), title: PAYBACK_TITLE, iouPlanId: p.id,
    }, now));
  }
  if (!written.length) return;
  await db.batch(written.map((w) => w.stmt));
  await sendPushDeliveries(env, written.map((w) => w.id), now);
}
