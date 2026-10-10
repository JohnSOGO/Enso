// SPEC §5.6 — orchestration only: load rows, call the pure engine, write results.
import { MATERIALIZE_AHEAD_H, alertMessage, stepFire, planReminderFires, type FireRow } from '../shared/engine';
import { choreFromRow, type ChoreRow } from '../shared/chores';
import { planThingFires, type ThingRow } from '../shared/things';
import { audience } from '../shared/optins';
import type { SunEvent } from '../shared/vocab';
import type { Recurrence } from '../shared/recurrence';
import { addMinutes } from '../shared/time';
import type { Env } from './env';
import { activeMemberIds, all, first, parseJson, placeOf } from './db';
import { houseDelivery, pushDelivery } from './deliveries';
import { choreRunInserts, insertFire, sourceOf, updateFire } from './fire-rows';
import { sendPushDeliveries } from './push';
import { allHouseSpeakers, sendHouseDeliveries } from './house';
import { deliverySpeakers } from './speaker-choices';
import { messTick } from './mess-asks';
import { timerStartTick } from './timer-starts';
import { weatherTick } from './weather-days';

export interface TickSummary { materialized: number; stepped: number; alerts: number; deliveries: number }

export async function tick(env: Env, now: string): Promise<TickSummary> {
  const db = env.DB;
  const summary: TickSummary = { materialized: 0, stepped: 0, alerts: 0, deliveries: 0 };
  const settings = (await first<{ timezone: string; latitude: number | null; longitude: number | null }>(db,
    'SELECT timezone, latitude, longitude FROM settings WHERE id = 1'))!;
  const tz = settings.timezone, place = placeOf(settings.latitude, settings.longitude);

  // 1. Materialize reminder fires for the next 36 h.
  const evs = await all<{
    id: string; start_date: string; start_time: string | null; recurrence: string | null; exdates: string; remind_offset_min: number;
    start_sun: SunEvent | null;
  }>(db,
    `SELECT id, start_date, start_time, recurrence, exdates, remind_offset_min, start_sun FROM events
      WHERE deleted_at IS NULL AND remind_offset_min IS NOT NULL`);
  const to = addMinutes(now, MATERIALIZE_AHEAD_H * 60);
  const inserts: D1PreparedStatement[] = [];
  for (const e of evs) {
    const planned = planReminderFires({
      id: e.id, start_date: e.start_date, start_time: e.start_time, remind_offset_min: e.remind_offset_min, start_sun: e.start_sun,
      recurrence: parseJson<Recurrence | null>(e.recurrence, null), exdates: parseJson<string[]>(e.exdates, []),
    }, tz, now, to, place);
    for (const f of planned) inserts.push(insertFire(db, f, true));
  }
  // 1b. Plan chore runs (and their first fires) for the same window (§7B.3).
  const chores = await all<ChoreRow>(db, 'SELECT * FROM chores WHERE deleted_at IS NULL');
  if (chores.length) {
    const active = await activeMemberIds(db);
    for (const c of chores) inserts.push(...choreRunInserts(db, choreFromRow(c), tz, now, to, active));
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
  const open = await all<FireRow>(db, `SELECT * FROM fires WHERE state != 'closed' ORDER BY due_at`);
  const newDeliveryIds: string[] = [];
  let everySpeakerNow: Promise<string[] | null> | undefined; // asked of HA at most once a tick (§7D.3)
  for (const fire of open) {
    const src = await sourceOf(db, fire, now);
    if (!src) continue;
    const { fire: next, alert } = stepFire(fire, src.cfg, now);
    if (next === fire) continue;
    summary.stepped++;
    const stmts = [updateFire(db, next)];
    if (alert) {
      summary.alerts++;
      const message = alertMessage(fire.kind, src.title, next.alert_count, src.chore, src.startsToday, src.sunsetAt, src.bring);
      const base = { fireId: next.id, alertNumber: next.alert_count };
      // §5.7, §7.5: who it is for. Nobody → the fire still steps, nothing is delivered.
      const aud = audience({
        optional: src.optional ?? false, assignedTo: src.assignedTo, activeIds: await activeMemberIds(db),
        onIds: src.onIds ?? [], channels: src.cfg.channels,
      });
      if (src.cfg.channels.includes('push')) {
        for (const memberId of aud.push) {
          const d = pushDelivery(db, { ...base, memberId, message }, now);
          newDeliveryIds.push(d.id);
          stmts.push(d.stmt);
        }
      }
      // §9.2a: on the speakers of everyone it is for — none ticked by any of them → not spoken (§7D.3: a machine, every speaker).
      const speakers = !(src.cfg.channels.includes('house') && aud.house) ? []
        : src.allSpeakers ? (everySpeakerNow ??= allHouseSpeakers(env), await everySpeakerNow) : await deliverySpeakers(db, aud.push);
      if (speakers === null || speakers.length) {
        stmts.push(houseDelivery(db, { ...base, message, speakers }, now).stmt);
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
  // 4. Speak the queued and stale-claimed house deliveries (§9.2).
  await sendHouseDeliveries(env, now);
  return summary;
}
