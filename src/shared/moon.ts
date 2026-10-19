// SPEC §7.12 — the four principal moon phases, computed (Meeus, Astronomical Algorithms ch. 49, main terms).
import { addDays, utcToLocal } from './time';

export interface MoonPhase { date: string; name: string; emoji: string }

const PHASES = [
  { name: 'New moon', emoji: '🌑' },
  { name: 'First quarter', emoji: '🌓' },
  { name: 'Full moon', emoji: '🌕' },
  { name: 'Last quarter', emoji: '🌗' },
] as const;

const RAD = Math.PI / 180;
const DELTA_T_DAYS = 69 / 86400; // TT − UT, near enough for a day-sized answer
const UNIX_EPOCH_JD = 2440587.5;
const SYNODIC_MONTHS_PER_YEAR = 12.3685;

/** The instant (ms since the epoch, UTC) of phase `quarter` (0 new … 3 last) of lunation `n` counted from 2000-01-06. */
function phaseInstant(n: number, quarter: number): number {
  const k = n + quarter / 4;
  const T = k / 1236.85;
  const jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * T * T - 0.00000015 * T ** 3 + 0.00000000073 * T ** 4;
  const E = 1 - 0.002516 * T - 0.0000074 * T * T;
  const M = (2.5534 + 29.1053567 * k - 0.0000014 * T * T) * RAD; // sun's anomaly
  const Mp = (201.5643 + 385.81693528 * k + 0.0107582 * T * T) * RAD; // moon's anomaly
  const F = (160.7108 + 390.67050284 * k - 0.0016118 * T * T) * RAD; // moon's latitude argument
  const Om = (124.7746 - 1.56375588 * k + 0.0020672 * T * T) * RAD;
  const s = Math.sin;
  let c: number;
  if (quarter === 0 || quarter === 2) {
    const full = quarter === 2;
    c = (full ? -0.40614 : -0.4072) * s(Mp) + (full ? 0.17302 : 0.17241) * E * s(M) + (full ? 0.01614 : 0.01608) * s(2 * Mp)
      + (full ? 0.01043 : 0.01039) * s(2 * F) + (full ? 0.00734 : 0.00739) * E * s(Mp - M) - (full ? 0.00515 : 0.00514) * E * s(Mp + M)
      + (full ? 0.00209 : 0.00208) * E * E * s(2 * M) - 0.00111 * s(Mp - 2 * F) - 0.00057 * s(Mp + 2 * F) + 0.00056 * E * s(2 * Mp + M)
      - 0.00042 * s(3 * Mp) + 0.00042 * E * s(M + 2 * F) + 0.00038 * E * s(M - 2 * F) - 0.00024 * E * s(2 * Mp - M) - 0.00017 * s(Om);
  } else {
    c = -0.62801 * s(Mp) + 0.17172 * E * s(M) - 0.01183 * E * s(Mp + M) + 0.00862 * s(2 * Mp) + 0.00804 * s(2 * F)
      + 0.00454 * E * s(Mp - M) + 0.00204 * E * E * s(2 * M) - 0.0018 * s(Mp - 2 * F) - 0.0007 * s(Mp + 2 * F) - 0.0004 * s(3 * Mp)
      - 0.00034 * E * s(2 * Mp - M) + 0.00032 * E * s(M + 2 * F) + 0.00032 * E * s(M - 2 * F) - 0.00028 * E * E * s(Mp + 2 * M)
      + 0.00027 * E * s(2 * Mp + M) - 0.00017 * s(Om);
    const w = 0.00306 - 0.00038 * E * Math.cos(M) + 0.00026 * Math.cos(Mp) - 0.00002 * Math.cos(Mp - M) + 0.00002 * Math.cos(Mp + M) + 0.00002 * Math.cos(2 * F);
    c += quarter === 1 ? w : -w;
  }
  return (jde + c - DELTA_T_DAYS - UNIX_EPOCH_JD) * 86400000;
}

/** The principal phases whose instant falls on a day in [from, to] in the household zone `tz`, in date order. */
export function moonPhasesBetween(from: string, to: string, tz: string): MoonPhase[] {
  const year = (d: string) => Number(d.slice(0, 4)) + (Number(d.slice(5, 7)) - 1) / 12;
  const first = Math.floor((year(addDays(from, -2)) - 2000) * SYNODIC_MONTHS_PER_YEAR) - 1;
  const last = Math.ceil((year(addDays(to, 2)) - 2000) * SYNODIC_MONTHS_PER_YEAR) + 1;
  const out: MoonPhase[] = [];
  for (let n = first; n <= last; n++) {
    for (let q = 0; q < 4; q++) {
      const date = utcToLocal(new Date(phaseInstant(n, q)).toISOString(), tz).date;
      if (date >= from && date <= to) out.push({ date, ...PHASES[q] });
    }
  }
  return out;
}
