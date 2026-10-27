// SPEC §7.14, §4.2zzm — the tide_turns and coast_days tables: the once-a-day coast refresh (tick step 3h) and the rows
// fishing reads. The rules (addresses, answers) are src/shared/coast.ts. Never throws.
import type { Env } from './env';
import { all, first, placeOf } from './db';
import { claimDailyRefresh, fetchRead } from './daily-refresh';
import { COAST_DAYS, COAST_POINT, marineUrl, parseTides, parseWaves, parseWind, tidesUrl, windUrl, type CoastDay, type TideTurn } from '../shared/coast';
import { TIDE_STATIONS } from '../shared/fishing-spots';
import { addDays, utcToLocal } from '../shared/time';

export async function coastTick(env: Env, now: string): Promise<void> {
  if (!env.TIDES_URL) return;
  const db = env.DB;
  try {
    const s = (await first<{ timezone: string; latitude: number | null; longitude: number | null }>(db,
      'SELECT timezone, latitude, longitude FROM settings WHERE id = 1'))!;
    const place = placeOf(s.latitude, s.longitude);
    if (!place) return;
    if (!await claimDailyRefresh(db, 'coast_tried_at', 'SELECT MAX(fetched_at) AS at FROM coast_days', now, s.timezone)) return;
    const today = utcToLocal(now, s.timezone).date, last = addDays(today, COAST_DAYS - 1);
    // A day's tides in UTC run past local midnight, so ask one more day on each side.
    const tides: { station: string; turns: TideTurn[] }[] = [];
    for (const station of TIDE_STATIONS) {
      const turns = parseTides(await fetchRead('tides', tidesUrl(env.TIDES_URL, station, addDays(today, -1), addDays(last, 1)), (r) => r.json()));
      if (!turns) { console.log('tides', `${station}: no tides`); return; } // tried, not refreshed: retried in an hour
      tides.push({ station, turns });
    }
    // Waves and wind are extras: a failure leaves them unknown, never stops the tides.
    const waves = env.MARINE_URL ? parseWaves(await fetchRead('waves', marineUrl(env.MARINE_URL, COAST_POINT, s.timezone), (r) => r.json())) : null;
    const wind = env.WEATHER_URL ? parseWind(await fetchRead('wind', windUrl(env.WEATHER_URL, place, s.timezone), (r) => r.json())) : null;
    const days = Array.from({ length: COAST_DAYS }, (_, i) => addDays(today, i));
    await db.batch([
      db.prepare('DELETE FROM tide_turns'),
      db.prepare('DELETE FROM coast_days'),
      ...tides.flatMap(({ station, turns }) => turns.map((t) => db.prepare(
        'INSERT OR IGNORE INTO tide_turns (station, at, kind, height_ft, fetched_at) VALUES (?, ?, ?, ?, ?)').bind(station, t.at, t.kind, t.heightFt, now))),
      ...days.map((d) => db.prepare('INSERT INTO coast_days (date, wave_ft, wind_mph, fetched_at) VALUES (?, ?, ?, ?)')
        .bind(d, waves?.get(d) ?? null, wind?.get(d) ?? null, now)),
    ]);
  } catch (e) {
    console.log('coast', (e as Error).message);
  }
}

/** The stored coast days in [from, to] and every tide turn by station (the caller picks a local day's). */
export async function coastBetween(db: D1Database, from: string, to: string): Promise<{ days: CoastDay[]; tides: Map<string, TideTurn[]> }> {
  const days = (await all<{ date: string; wave_ft: number | null; wind_mph: number | null }>(db,
    'SELECT date, wave_ft, wind_mph FROM coast_days WHERE date BETWEEN ? AND ? ORDER BY date', from, to))
    .map((r) => ({ date: r.date, waveFt: r.wave_ft, windMph: r.wind_mph }));
  const tides = new Map<string, TideTurn[]>();
  if (!days.length) return { days, tides };
  for (const r of await all<{ station: string; at: string; kind: 'H' | 'L'; height_ft: number }>(db,
    'SELECT station, at, kind, height_ft FROM tide_turns ORDER BY at')) {
    tides.set(r.station, [...(tides.get(r.station) ?? []), { at: r.at, kind: r.kind, heightFt: r.height_ft }]);
  }
  return { days, tides };
}
