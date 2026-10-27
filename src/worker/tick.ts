// SPEC §5.6 — orchestration only: load rows, call the pure engine, write results.
import { MATERIALIZE_AHEAD_H, alertMessage, stepFire, type FireRow } from '../shared/engine';
import { choreFromRow, type ChoreRow } from '../shared/chores';
import { planThingFires, type ThingRow } from '../shared/things';
import { addMinutes } from '../shared/time';
import type { Env } from './env';
import { activeMemberIds, all, first, placeOf } from './db';
import { funhouseDelivery, houseDelivery, pushDelivery } from './deliveries';
import { audienceOf, choreRunInserts, insertFire, reminderInserts, sourceOf, updateFire } from './fire-rows';
import { sendPushDeliveries } from './push';
import { allHouseSpeakers, sendHouseDeliveries } from './house';
import { deliverySpeakers } from './speaker-choices';
import { houseQuiet } from './house-quiet';
import { speaksOnHouse } from '../shared/phone-first';
import { messTick } from './mess-asks';
import { timerStartTick } from './timer-starts';
import { weatherTick } from './weather-days';
import { cookDayTick } from './cook-rows';
import { listPingTick } from './list-pings';
import { iouPingTick } from './iou-pings';
import { coastTick } from './coast-days';
import { fishEventsTick } from './fish-events-rows';
import { fishingPingTick } from './fishing-pings';

export interface TickSummary { materialized: number; stepped: number; alerts: number; deliveries: number }

export async function tick(env: Env, now: string): Promise<TickSummary> {
  const db = env.DB;
  const summary: TickSummary = { materialized: 0, stepped: 0, alerts: 0, deliveries: 0 };
  const settings = (await first<{ timezone: string; latitude: number | null; longitude: number | null }>(db,
    'SELECT timezone, latitude, longitude FROM settings WHERE id = 1'))!;
  const tz = settings.timezone, place = placeOf(settings.latitude, settings.longitude);

  // 1. Materialize reminder fires for the next 36 h.
  const to = addMinutes(now, MATERIALIZE_AHEAD_H * 60);
  const inserts = await reminderInserts(db, tz, now, to, place);
  // 1b. Plan chore runs (and their first fires) for the same window (§7B.3).
  const chores = await all<ChoreRow>(db, 'SELECT * FROM chores WHERE deleted_at IS NULL');
  if (chores.length) {
    const active = await activeMemberIds(db);
    for (const c of chores) inserts.push(...choreRunInserts(db, choreFromRow(c), tz, now, to, active, place));
  }
  // 1c. Plan thing reminders (§7C.2): only ideas, same window, INSERT OR IGNORE.
  const things = await all<ThingRow>(db,
    `SELECT * FROM things WHERE deleted_at IS NULL AND status = 'idea' AND (remind_start = 1 OR remind_on IS NOT NULL)`);
  for (const t of things) for (const f of planThingFires(t, tz, now, to)) inserts.push(insertFire(db, f, true));
  if (inserts.length) {
    const results = await db.batch(inserts);
    summary.materialized = results.reduce((n, r) => n + (r.meta.changes ?? 0), 0);
  }

  // 2. Step every open fire.
  const open = await all<FireRow & { away_by: string | null }>(db, `SELECT * FROM fires WHERE state != 'closed' ORDER BY due_at`);
  const newDeliveryIds: string[] = [];
  let everySpeakerNow: Promise<string[] | null> | undefined; // asked of HA at most once a tick (§7D.3)
  const quiet = await houseQuiet(db, now); // §9.2b: while quiet, no house row at all
  const on24h = new Set((await all<{ member_id: string }>(db, 'SELECT member_id FROM member_prefs WHERE clock_24h = 1')).map((r) => r.member_id)); // §8.17
  for (const fire of open) {
    const src = await sourceOf(db, fire, now);
    if (!src) continue;
    const { fire: next, alert, dayEnded } = stepFire(fire, src.cfg, now);
    if (next === fire) continue;
    summary.stepped++;
    const stmts = [updateFire(db, next)];
    // §9.2c: a timer's day ending ends Away too, so tomorrow rings.
    if (dayEnded && fire.away_by) stmts.push(db.prepare('UPDATE fires SET away_by = NULL, away_at = NULL WHERE id = ?').bind(fire.id));
    if (alert) {
      summary.alerts++;
      const message = src.say?.(next.alert_count) ?? alertMessage(fire.kind, src.title, next.alert_count, src.chore, src.startsToday, src.sunsetAt, src.bring);
      const message24 = typeof src.sunsetAt === 'string' ? alertMessage(fire.kind, src.title, next.alert_count, src.chore, src.startsToday, src.sunsetAt, src.bring, true) : message; // §8.17: a push in its member's clock
      const base = { fireId: next.id, alertNumber: next.alert_count };
      // §5.7, §7.5: who it is for. Nobody → the fire still steps, nothing is delivered.
      const aud = audienceOf(src, await activeMemberIds(db));
      // §9.2c: someone away from this alert → no phone rings either.
      if (src.cfg.channels.includes('push') && !fire.away_by) {
        for (const memberId of aud.push) {
          const d = pushDelivery(db, { ...base, memberId, message: on24h.has(memberId) ? message24 : message }, now);
          newDeliveryIds.push(d.id);
          stmts.push(d.stmt);
        }
      }
      // §9.4b: the FunHouse follows the phone — away stops it; quiet and phone first do not.
      if (aud.funhouse && !fire.away_by) stmts.push(funhouseDelivery(db, { ...base, message }, now).stmt);
      // §9.2a: on the speakers of everyone it is for — none ticked by any of them, the house quiet (§9.2b) or someone away from this alert (§9.2c), or a phone-first alert 1 (§9.2d) → not spoken (§7D.3: a machine, every speaker).
      const speakers = quiet || fire.away_by || !(aud.house && speaksOnHouse(next.alert_count, src.cfg)) ? []
        : src.allSpeakers ? (everySpeakerNow ??= allHouseSpeakers(env), await everySpeakerNow) : await deliverySpeakers(db, aud.push);
      if (speakers === null || speakers.length) {
        stmts.push(houseDelivery(db, { ...base, message: src.houseSay?.(next.alert_count) ?? message, speakers }, now).stmt); // §7G.3
      }
      summary.deliveries += stmts.length - 1;
      if (fire.state === 'scheduled' && fire.kind === 'reminder') {
        stmts.push(db.prepare(
          `UPDATE fires SET state = 'closed', close_reason = 'superseded', closed_at = ?
            WHERE event_id = ? AND id != ? AND state = 'ringing'`).bind(now, fire.event_id, fire.id));
      }
    }
    await db.batch(stmts);
  }

  // 3. Send the push deliveries created in this tick.
  if (newDeliveryIds.length) await sendPushDeliveries(env, newDeliveryIds, now);
  // 3b. Ask again about open messes, move unclaimed ones to To talk about, delete old mess photos (§7B.7).
  await messTick(env, now);
  // 3c. Announce each announcing timer whose window just opened (§5.5a).
  await timerStartTick(env, now);
  // 3d. Refresh the forecast once a day (§7.11).
  await weatherTick(env, now);
  // 3e. Close the cooking timers whose day is over (§7D.8).
  await cookDayTick(env, now);
  // 3f. Ping the owners of every day list items whose time has come (§7A.4).
  await listPingTick(env, now);
  // 3g. Ping the one who owes on a payback plan's due day (§7B.9).
  await iouPingTick(env, now);
  // 3h–3j. Refresh the tides, waves and wind, and the fish events, once a day; then the evening-before 🎣 ping (§7.14).
  await coastTick(env, now);
  await fishEventsTick(env, now);
  await fishingPingTick(env, now);
  // 4. Speak the queued and stale-claimed house deliveries (§9.2).
  await sendHouseDeliveries(env, now);
  return summary;
}
