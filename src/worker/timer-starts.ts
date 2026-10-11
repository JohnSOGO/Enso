// SPEC §5.5a — tick step 3c: the start announcement of each announcing timer whose window just opened. Fire-less
// deliveries (§4.2k) on the timer's channels and audience; the rules and the words are src/shared/timer-start.ts.
import type { Env } from './env';
import { activeMemberIds, all, householdTz, parseJson } from './db';
import { funhouseDelivery, houseDelivery, pushDelivery } from './deliveries';
import { sendPushDeliveries } from './push';
import { deliverySpeakers } from './speaker-choices';
import { houseQuiet } from './house-quiet';
import { audience } from '../shared/optins';
import { timerWindow } from '../shared/engine';
import { timerStartDue, timerStartMessage } from '../shared/timer-start';
import type { Channel } from '../shared/vocab';

interface AnnouncingTimer {
  id: string; title: string; interval_min: number; channels: string; assigned_to: string;
  active_from: string; active_to: string; announced_on: string | null;
}

export async function timerStartTick(env: Env, now: string): Promise<void> {
  const db = env.DB;
  const timers = await all<AnnouncingTimer>(db,
    `SELECT id, title, interval_min, channels, assigned_to, active_from, active_to, announced_on FROM timers
      WHERE deleted_at IS NULL AND running = 1 AND announce_start = 1 AND active_from IS NOT NULL AND active_to IS NOT NULL`);
  if (!timers.length) return;
  const tz = await householdTz(db), activeIds = await activeMemberIds(db), quiet = await houseQuiet(db, now); // §9.2b
  const pushIds: string[] = [];
  for (const t of timers) {
    const date = timerStartDue({ running: true, announceStart: true, announcedOn: t.announced_on },
      timerWindow(t.active_from, t.active_to, tz), now);
    if (!date) continue;
    // Only the tick that changed the row announces (two overlapping ticks say it once).
    const won = await db.prepare('UPDATE timers SET announced_on = ? WHERE id = ? AND announced_on IS NOT ?').bind(date, t.id, date).run();
    if (!won.meta.changes) continue;
    const channels = parseJson<Channel[]>(t.channels, []), message = timerStartMessage(t.title, t.interval_min);
    const aud = audience({ optional: false, assignedTo: parseJson<string[]>(t.assigned_to, []), activeIds, onIds: [], channels });
    const stmts: D1PreparedStatement[] = [];
    // Title NULL: the push shows "📢 Announcement" and is never counted as a founder ping (Q186).
    if (channels.includes('push')) {
      for (const memberId of aud.push) {
        const d = pushDelivery(db, { memberId, message }, now);
        pushIds.push(d.id);
        stmts.push(d.stmt);
      }
    }
    const speakers = !quiet && channels.includes('house') && aud.house ? await deliverySpeakers(db, aud.push) : [];
    if (speakers === null || speakers.length) stmts.push(houseDelivery(db, { message, speakers }, now).stmt);
    if (aud.funhouse) stmts.push(funhouseDelivery(db, { message }, now).stmt); // §9.4b, not quieted
    if (stmts.length) await db.batch(stmts);
  }
  if (pushIds.length) await sendPushDeliveries(env, pushIds, now);
}
