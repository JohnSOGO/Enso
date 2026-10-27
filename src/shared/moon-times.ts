// SPEC §7.14 — the moon's rise, set, overhead and underfoot on a local date at a place (the solunar times). Low-precision
// moon position (Meeus ch. 47, main terms, about 0.3°), stepped through the day; good to a few minutes. Pure.
import type { Place } from './sun';
import { iso, localToUtc, addDays, ms } from './time';

export interface MoonTimes { rise: string | null; set: string | null; over: string | null; under: string | null }

const RAD = Math.PI / 180;
const UNIX_EPOCH_JD = 2440587.5;
const H0 = 0.125; // the moon's altitude at rise and set: parallax less refraction and its radius
const STEP_MIN = 10;

const wrap180 = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

/** The moon's altitude and hour angle (degrees, −180…180, 0 = overhead) at instant `t` (ms) seen from `place`. */
function moonAt(t: number, place: Place): { alt: number; ha: number } {
  const d = t / 86400000 + UNIX_EPOCH_JD - 2451545.0;
  const L = 218.316 + 13.176396 * d, Mp = (134.963 + 13.064993 * d) * RAD, F = (93.272 + 13.22935 * d) * RAD;
  const D = (297.85 + 12.190749 * d) * RAD, M = (357.529 + 0.98560028 * d) * RAD;
  const lon = (L + 6.289 * Math.sin(Mp) + 1.274 * Math.sin(2 * D - Mp) + 0.658 * Math.sin(2 * D) + 0.214 * Math.sin(2 * Mp)
    - 0.186 * Math.sin(M) - 0.114 * Math.sin(2 * F)) * RAD;
  const lat = (5.128 * Math.sin(F) + 0.281 * Math.sin(Mp + F) + 0.278 * Math.sin(Mp - F) + 0.173 * Math.sin(2 * D - F)) * RAD;
  const eps = (23.439 - 0.0000004 * d) * RAD;
  const ra = Math.atan2(Math.sin(lon) * Math.cos(eps) - Math.tan(lat) * Math.sin(eps), Math.cos(lon)) / RAD;
  const dec = Math.asin(Math.sin(lat) * Math.cos(eps) + Math.cos(lat) * Math.sin(eps) * Math.sin(lon));
  const ha = wrap180(280.46061837 + 360.98564736629 * d + place.lon - ra);
  const phi = place.lat * RAD;
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ha * RAD)) / RAD;
  return { alt, ha };
}

/** The first moment in [a, b) where f crosses from below 0 to 0 or above, by linear interpolation. */
const crossing = (a: number, fa: number, b: number, fb: number) => a + ((b - a) * -fa) / (fb - fa);

/** The moon's rise, set, overhead and underfoot instants (UTC, to the minute) on local `date` in zone `tz`; null when it
 *  doesn't happen that day (the moon rises about 50 minutes later each day, so about one day a month has no rise). */
export function moonTimes(date: string, place: Place, tz: string): MoonTimes {
  const out: MoonTimes = { rise: null, set: null, over: null, under: null };
  const start = ms(localToUtc(date, '00:00', tz)), end = ms(localToUtc(addDays(date, 1), '00:00', tz));
  const at = (t: number) => iso(Math.round(t / 60000) * 60000);
  let t0 = start, m0 = moonAt(t0, place);
  while (t0 < end) {
    const t1 = Math.min(t0 + STEP_MIN * 60000, end), m1 = moonAt(t1, place);
    const a0 = m0.alt - H0, a1 = m1.alt - H0;
    if (a0 < 0 && a1 >= 0) out.rise ??= at(crossing(t0, a0, t1, a1));
    if (a0 >= 0 && a1 < 0) out.set ??= at(crossing(t0, -a0, t1, -a1));
    if (m0.ha < 0 && m1.ha >= 0 && m1.ha - m0.ha < 180) out.over ??= at(crossing(t0, m0.ha, t1, m1.ha));
    if (m0.ha > 0 && m1.ha < 0 && m0.ha - m1.ha > 180) out.under ??= at(crossing(t0, m0.ha - 180, t1, m1.ha + 180));
    t0 = t1; m0 = m1;
  }
  return out;
}
