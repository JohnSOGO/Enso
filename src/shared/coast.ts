// SPEC §7.14 — coast data: the rules of the once-a-day tide, wave and wind refresh (addresses and answers). Kept apart
// from fishing so a surf or tide-pool item could read the same rows. Pure; the fetch and the rows are
// src/worker/coast-days.ts.
import type { Place } from './sun';
import { TIDE_KIND } from './vocab';

export interface TideTurn { at: string; kind: (typeof TIDE_KIND)[number]; heightFt: number }
export interface CoastDay { date: string; waveFt: number | null; windMph: number | null }

/** Days asked for, today first (like the forecast, §7.11). */
export const COAST_DAYS = 7;
/** Where the waves are asked (the marine grid has no cells inland): off Oceanside Pier. */
export const COAST_POINT: Place = { lat: 33.19, lon: -117.4 };

const compact = (date: string) => date.replaceAll('-', '');

/** NOAA CO-OPS high and low tides for `station`, `from`–`to` inclusive, in UTC. */
export const tidesUrl = (base: string, station: string, from: string, to: string) =>
  `${base}/api/prod/datagetter?product=predictions&interval=hilo&station=${station}&datum=MLLW&units=english`
  + `&time_zone=gmt&format=json&begin_date=${compact(from)}&end_date=${compact(to)}&application=enso`;

/** Open-Meteo marine: each day's highest wave, in metres. */
export const marineUrl = (base: string, at: Place, tz: string) =>
  `${base}/v1/marine?latitude=${at.lat}&longitude=${at.lon}&daily=wave_height_max&timezone=${encodeURIComponent(tz)}&forecast_days=${COAST_DAYS}`;

/** Open-Meteo forecast (the weather's address, §7.11): each day's strongest wind, in mph. */
export const windUrl = (base: string, at: Place, tz: string) =>
  `${base}/v1/forecast?latitude=${at.lat}&longitude=${at.lon}&daily=wind_speed_10m_max&wind_speed_unit=mph&timezone=${encodeURIComponent(tz)}&forecast_days=${COAST_DAYS}`;

/** `{ predictions: [{ t: 'YYYY-MM-DD HH:MM' (UTC), v: feet, type: 'H' | 'L' }] }` → the turns; anything else → null. */
export function parseTides(json: unknown): TideTurn[] | null {
  const p = (json as { predictions?: unknown } | null)?.predictions;
  if (!Array.isArray(p)) return null;
  const out: TideTurn[] = [];
  for (const r of p as { t?: unknown; v?: unknown; type?: unknown }[]) {
    if (typeof r?.t !== 'string' || !/^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(r.t) || !(TIDE_KIND as readonly unknown[]).includes(r.type)) return null;
    const v = Number(r.v);
    if (!Number.isFinite(v)) return null;
    out.push({ at: `${r.t.replace(' ', 'T')}:00.000Z`, kind: r.type as TideTurn['kind'], heightFt: Math.round(v * 10) / 10 });
  }
  return out;
}

const FT_PER_M = 3.28084;

/** Open-Meteo `daily.time` + `daily.<key>` (equal lists) → date → value (× `scale`, one decimal); anything else → null. */
export function parseDaily(json: unknown, key: string, scale = 1): Map<string, number | null> | null {
  const d = (json as { daily?: Record<string, unknown> } | null)?.daily;
  const time = d?.time, vals = d?.[key];
  if (!Array.isArray(time) || !Array.isArray(vals) || time.length !== vals.length) return null;
  return new Map(time.map((t, i) => [String(t), typeof vals[i] === 'number' ? Math.round(vals[i] * scale * 10) / 10 : null]));
}

export const parseWaves = (json: unknown) => parseDaily(json, 'wave_height_max', FT_PER_M);
export const parseWind = (json: unknown) => parseDaily(json, 'wind_speed_10m_max');
