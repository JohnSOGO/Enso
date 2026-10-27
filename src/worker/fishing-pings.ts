// SPEC §7.14 — the evening-before fishing ping: tick step 3j. From FISHING_PING_TIME, each active member with the 🎣 alert
// on whose range holds a great window or a fish event tomorrow, and no ping marked for tomorrow yet, gets one push,
// phone only, no fire (never spoken, never on the FunHouse). The rules and words are src/shared/fishing.ts.
import type { Env } from './env';
import { all, householdTz } from './db';
import { pushDelivery, type Written } from './deliveries';
import { sendPushDeliveries } from './push';
import { fishingBetween } from './fishing-days';
import { FISHING_PING_TIME, FISHING_PING_TITLE, fishingPing } from '../shared/fishing';
import { addDays, utcToLocal } from '../shared/time';

export async function fishingPingTick(env: Env, now: string): Promise<void> {
  const db = env.DB;
  const tz = await householdTz(db);
  const local = utcToLocal(now, tz);
  if (local.time < FISHING_PING_TIME) return;
  const tomorrow = addDays(local.date, 1);
  const members = await all<{ id: string; clock_24h: number }>(db,
    `SELECT m.id, p.clock_24h FROM members m JOIN member_prefs p ON p.member_id = m.id
      WHERE m.disabled_at IS NULL AND p.fishing_alert = 1
        AND NOT EXISTS (SELECT 1 FROM deliveries d WHERE d.member_id = m.id AND d.fishing_on = ?)`, tomorrow);
  const written: Written[] = [];
  for (const m of members) {
    const [day] = await fishingBetween(db, tomorrow, tomorrow, m.id);
    const message = day && fishingPing(day, tz, m.clock_24h === 1);
    if (message) written.push(pushDelivery(db, { memberId: m.id, message, title: FISHING_PING_TITLE, fishingOn: tomorrow }, now));
  }
  if (!written.length) return;
  await db.batch(written.map((w) => w.stmt));
  await sendPushDeliveries(env, written.map((w) => w.id), now);
}
