// SPEC §7.7 — sunset for a local date and a place, by the NOAA general solar position
// algorithm (fractional year γ, equation of time, declination, hour angle at zenith 90.833°).
// Pure: no clock, no I/O; imports nothing but time.ts.
import { iso } from './time';

export interface Place { lat: number; lon: number }

const DAY_MS = 86_400_000;
const ZENITH = 90.833; // the sun's centre 0.833° below the horizon: refraction + its radius
const rad = (d: number) => (d * Math.PI) / 180;

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** Sunset in minutes after 00:00 UTC of `day0`, evaluated at `atMin` (minutes after day0), or null (polar). */
function sunsetMinutes(dayOfYear: number, daysInYear: number, atMin: number, place: Place): number | null {
  const g = ((2 * Math.PI) / daysInYear) * (dayOfYear - 1 + (atMin / 60 - 12) / 24);
  const eqtime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g)
    - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g)
    + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const lat = rad(place.lat);
  const cosHa = Math.cos(rad(ZENITH)) / (Math.cos(lat) * Math.cos(decl)) - Math.tan(lat) * Math.tan(decl);
  if (!(cosHa >= -1 && cosHa <= 1)) return null; // the sun stays up, or stays down, all day
  const ha = (Math.acos(cosHa) * 180) / Math.PI;
  return 720 - 4 * (place.lon - ha) - eqtime;
}

/**
 * The UTC instant of sunset on local date `date` (YYYY-MM-DD) at `place`, rounded to the minute,
 * or null when the sun does not set that day. Never a substitute time.
 */
export function sunsetUtc(date: string, place: Place): string | null {
  const [y, m, d] = date.split('-').map(Number);
  const day0 = Date.UTC(y, m - 1, d);
  const dayOfYear = Math.round((day0 - Date.UTC(y, 0, 1)) / DAY_MS) + 1;
  const daysInYear = isLeap(y) ? 366 : 365;
  // Evaluate at the date's local solar noon, then once more at the sunset that gives.
  const first = sunsetMinutes(dayOfYear, daysInYear, 720 - 4 * place.lon, place);
  if (first === null) return null;
  const min = sunsetMinutes(dayOfYear, daysInYear, first, place);
  if (min === null) return null;
  return iso(day0 + Math.round(min) * 60_000);
}
