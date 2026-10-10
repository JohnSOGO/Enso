// SPEC §7.11, §4.2zi — the weather_days table: the once-a-day forecast refresh (tick step 3d) and the /calendar
// rows. The rules (when, the address, the answer, what a code means) are src/shared/weather.ts. Never throws.
import type { Env } from './env';
import { all, first, placeOf } from './db';
import { forecastUrl, parseForecast, weatherDue, weatherOf, type WeatherDay } from '../shared/weather';
import { utcToLocal } from '../shared/time';

const WEATHER_FETCH_TIMEOUT_MS = 10_000;

export async function weatherTick(env: Env, now: string): Promise<void> {
  if (!env.WEATHER_URL) return;
  const db = env.DB;
  try {
    const s = (await first<{ timezone: string; latitude: number | null; longitude: number | null; weather_tried_at: string | null }>(db,
      'SELECT timezone, latitude, longitude, weather_tried_at FROM settings WHERE id = 1'))!;
    const place = placeOf(s.latitude, s.longitude);
    if (!place) return;
    const last = await first<{ at: string | null }>(db, 'SELECT MAX(fetched_at) AS at FROM weather_days');
    if (!weatherDue({ triedAt: s.weather_tried_at, fetchedAt: last?.at ?? null }, now, s.timezone)) return;
    // Only the tick that changed the row asks (two overlapping ticks fetch once).
    const won = await db.prepare('UPDATE settings SET weather_tried_at = ? WHERE id = 1 AND weather_tried_at IS ?')
      .bind(now, s.weather_tried_at).run();
    if (!won.meta.changes) return;
    const res = await fetch(forecastUrl(env.WEATHER_URL, place, s.timezone), { signal: AbortSignal.timeout(WEATHER_FETCH_TIMEOUT_MS) });
    if (!res.ok) { console.log('weather', `HTTP ${res.status}`); return; }
    const days = parseForecast(await res.json().catch(() => null));
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
