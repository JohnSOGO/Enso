// SPEC §7.11, §4.2zi — the weather_days table: the once-a-day forecast refresh (tick step 3d) and the /calendar
// rows. The rules (when, the address, the answer, what a code means) are src/shared/weather.ts. Never throws.
import type { Env } from './env';
import { all, first, placeOf } from './db';
import { claimDailyRefresh, fetchRead } from './daily-refresh';
import { forecastUrl, parseForecast, weatherOf, type WeatherDay } from '../shared/weather';
import { utcToLocal } from '../shared/time';

export async function weatherTick(env: Env, now: string): Promise<void> {
  if (!env.WEATHER_URL) return;
  const db = env.DB;
  try {
    const s = (await first<{ timezone: string; latitude: number | null; longitude: number | null }>(db,
      'SELECT timezone, latitude, longitude FROM settings WHERE id = 1'))!;
    const place = placeOf(s.latitude, s.longitude);
    if (!place) return;
    // Only the tick that wins the claim asks (two overlapping ticks fetch once).
    if (!await claimDailyRefresh(db, 'weather_tried_at', 'SELECT MAX(fetched_at) AS at FROM weather_days', now, s.timezone)) return;
    const json = await fetchRead('weather', forecastUrl(env.WEATHER_URL, place, s.timezone), (r) => r.json().catch(() => null));
    if (json === null) return;
    const days = parseForecast(json);
    if (!days) { console.log('weather', 'not a forecast'); return; }
    const today = utcToLocal(now, s.timezone).date;
    await db.batch([
      db.prepare('DELETE FROM weather_days'),
      ...days.filter((d) => d.date >= today).map((d) => db.prepare(
        'INSERT INTO weather_days (date, code, high_f, low_f, fetched_at) VALUES (?, ?, ?, ?, ?)').bind(d.date, d.code, d.highF, d.lowF, now)),
    ]);
  } catch (e) {
    console.log('weather', (e as Error).message);
  }
}

/** The stored forecast days in [from, to], ready for /calendar. */
export async function weatherBetween(db: D1Database, from: string, to: string): Promise<WeatherDay[]> {
  const rows = await all<{ date: string; code: number; high_f: number; low_f: number }>(db,
    'SELECT date, code, high_f, low_f FROM weather_days WHERE date BETWEEN ? AND ? ORDER BY date', from, to);
  return rows.flatMap((r) => {
    const w = weatherOf(r.code);
    return w ? [{ date: r.date, ...w, high: r.high_f, low: r.low_f }] : [];
  });
}
