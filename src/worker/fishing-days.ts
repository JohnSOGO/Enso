// SPEC §7.14 — one member's fishing days: the best windows within their "How far will we go" and the fish events
// in it, from the coast rows and the fish events through src/shared/fishing.ts. Read by /calendar and fishing-pings.ts.
import { first, placeOf } from './db';
import { coastBetween } from './coast-days';
import { fishEventsBetween } from './fish-events-rows';
import { bestWindows, phaseNear, type FishingDay } from '../shared/fishing';
import { FISH_EMOJI, freeDaysBetween } from '../shared/fish-events';
import { DEFAULT_FISHING_RANGE, driveMinutes, spotsWithin } from '../shared/fishing-spots';
import { moonPhasesBetween } from '../shared/moon';
import { moonTimes } from '../shared/moon-times';
import { sunriseUtc, sunsetUtc } from '../shared/sun';
import { addDays } from '../shared/time';

export async function fishingBetween(db: D1Database, from: string, to: string, memberId: string): Promise<FishingDay[]> {
  const s = (await first<{ timezone: string; latitude: number | null; longitude: number | null; range: number | null }>(db,
    `SELECT s.timezone, s.latitude, s.longitude, p.fishing_range AS range FROM settings s
       LEFT JOIN member_prefs p ON p.member_id = ? WHERE s.id = 1`, memberId))!;
  const home = placeOf(s.latitude, s.longitude);
  if (!home) return [];
  const tz = s.timezone, range = s.range ?? DEFAULT_FISHING_RANGE, spots = spotsWithin(home, range);
  const [{ days, tides }, events] = await Promise.all([coastBetween(db, from, to), fishEventsBetween(db, from, to)]);
  const phases = moonPhasesBetween(addDays(from, -1), addDays(to, 1), tz);
  const out = new Map<string, FishingDay>();
  const day = (date: string) => out.get(date) ?? (out.set(date, { date, windows: [], events: [] }), out.get(date)!);
  for (const c of days) {
    const base = {
      sunrise: sunriseUtc(c.date, home), sunset: sunsetUtc(c.date, home), moon: moonTimes(c.date, home, tz),
      phase: phaseNear(phases, c.date), windMph: c.windMph, waveFt: c.waveFt,
    };
    // Every stored turn is handed in: only one near a window counts.
    const windows = bestWindows(spots, (spot) => ({ ...base, tides: (spot.station && tides.get(spot.station)) || [] }));
    if (windows.length) day(c.date).windows = windows;
  }
  for (const e of events) {
    if (e.lat !== null && e.lon !== null && driveMinutes(home, { lat: e.lat, lon: e.lon }) > range) continue;
    day(e.date).events.push({ emoji: FISH_EMOJI, title: e.title, url: e.url });
  }
  for (const f of freeDaysBetween(from, to)) day(f.date).events.push({ emoji: f.emoji, title: f.title, url: f.url });
  return [...out.values()].sort((a, b) => a.date.localeCompare(b.date));
}
