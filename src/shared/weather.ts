// SPEC §7.11 — weather on the calendar: the WMO weather-code table, the Open-Meteo forecast address and answer,
// when the once-a-day refresh is due, and the day-sheet words. Pure: `now` and the zone are parameters.
import type { Place } from './sun';
import { ms, utcToLocal } from './time';

/** One forecast day as stored (§4.2zi). */
export interface ForecastDay { date: string; code: number; highF: number; lowF: number }
/** One day on the /calendar wire. */
export interface WeatherDay { date: string; emoji: string; words: string; high: number; low: number }

export const FORECAST_DAYS = 7;
/** How long after a try the next may go when no good refresh happened today. */
export const WEATHER_RETRY_MIN = 60;

const TABLE: [number[], string, string][] = [
  [[0], '☀️', 'Clear'],
  [[1], '🌤️', 'Mostly clear'],
  [[2], '⛅', 'Partly cloudy'],
  [[3], '☁️', 'Cloudy'],
  [[45, 48], '🌫️', 'Fog'],
  [[51, 53, 55, 56, 57], '🌦️', 'Drizzle'],
  [[61, 63, 65, 66, 67, 80, 81, 82], '🌧️', 'Rain'],
  [[71, 73, 75, 77, 85, 86], '🌨️', 'Snow'],
  [[95, 96, 99], '⛈️', 'Thunderstorms'],
];

/** The emoji and words of a WMO code, or null when it is not in the table. */
export function weatherOf(code: number): { emoji: string; words: string } | null {
  const row = TABLE.find(([codes]) => codes.includes(code));
  return row ? { emoji: row[1], words: row[2] } : null;
}

export function forecastUrl(base: string, place: Place, tz: string): string {
  const q = new URLSearchParams({
    latitude: String(place.lat), longitude: String(place.lon),
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    temperature_unit: 'fahrenheit', timezone: tz, forecast_days: String(FORECAST_DAYS),
  });
  return `${base.replace(/\/+$/, '')}/v1/forecast?${q}`;
}

const isNums = (x: unknown, n: number): x is number[] => Array.isArray(x) && x.length === n && x.every((v) => typeof v === 'number' && Number.isFinite(v));

/** Open-Meteo's daily answer as rows (days with an unknown code left out), or null when it isn't that shape. */
export function parseForecast(json: unknown): ForecastDay[] | null {
  const d = (json as { daily?: Record<string, unknown> } | null)?.daily;
  if (!d || !Array.isArray(d.time) || !d.time.length) return null;
  const n = d.time.length;
  if (!d.time.every((t) => typeof t === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t))) return null;
  if (!isNums(d.weather_code, n) || !isNums(d.temperature_2m_max, n) || !isNums(d.temperature_2m_min, n)) return null;
  const codes = d.weather_code, highs = d.temperature_2m_max, lows = d.temperature_2m_min;
  return (d.time as string[])
    .map((date, i) => ({ date, code: codes[i], highF: Math.round(highs[i]), lowF: Math.round(lows[i]) }))
    .filter((r) => weatherOf(r.code));
}

/** Due when the last good refresh was not on today's local date and the last try is an hour old or never (§7.11). */
export function weatherDue(s: { triedAt: string | null; fetchedAt: string | null }, now: string, tz: string): boolean {
  const today = utcToLocal(now, tz).date;
  if (s.fetchedAt && utcToLocal(s.fetchedAt, tz).date === today) return false;
  return !s.triedAt || ms(now) - ms(s.triedAt) >= WEATHER_RETRY_MIN * 60_000;
}

/** "☀️ Clear · high 72° · low 58°" (the day sheet). */
export const weatherText = (w: WeatherDay) => `${w.emoji} ${w.words} · high ${w.high}° · low ${w.low}°`;
