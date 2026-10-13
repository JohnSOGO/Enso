// SPEC §7A.4 — Ping owners: tick step 3f. Each timed item on an every day list with Ping owners, not ticked today and
// not yet pinged today, pings its owner (the assignee, else every active member) once, phone only, with no fire. The
// rules (today, due, the title) are src/shared/lists.ts; "pinged today" is read from deliveries.list_item_id.
import type { Env } from './env';
import { activeMemberIds, all, householdTz } from './db';
import { pushDelivery } from './deliveries';
import { sendPushDeliveries } from './push';
import { listPingTitle, pingDue, todaysItems } from '../shared/lists';
import { dayStartUtc, utcToLocal } from '../shared/time';

interface PingRow {
  id: string; text: string; time: string; assignee_id: string | null; checked_at: string | null; name: string; emoji: string | null;
}

export async function listPingTick(env: Env, now: string): Promise<void> {
  const db = env.DB;
  const tz = await householdTz(db);
  const dayStart = dayStartUtc(now, tz), localNow = utcToLocal(now, tz).time;
  const rows = await all<PingRow>(db,
    `SELECT i.id, i.text, i.time, i.assignee_id, i.checked_at, l.name, l.emoji FROM list_items i JOIN lists l ON l.id = i.list_id
      WHERE l.deleted_at IS NULL AND l.daily = 1 AND l.ping_owners = 1 AND i.deleted_at IS NULL AND i.time IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM deliveries d WHERE d.list_item_id = i.id AND d.created_at >= ?)`, dayStart);
  const due = todaysItems(rows, dayStart).filter((i) => i.checked_at === null && pingDue(i.time, localNow));
  if (!due.length) return;
  const active = await activeMemberIds(db);
  const written = due.flatMap((i) => {
    const owners = i.assignee_id && active.includes(i.assignee_id) ? [i.assignee_id] : active; // ⚑ Q288
    return owners.map((memberId) => pushDelivery(db, { memberId, message: i.text, title: listPingTitle(i), listItemId: i.id }, now));
  });
  if (!written.length) return;
  await db.batch(written.map((w) => w.stmt));
  await sendPushDeliveries(env, written.map((w) => w.id), now);
}
