// SPEC §7.3 — US federal holidays, computed (never a hand-typed list of dates).
import { addDays, daysInMonth, weekdayOf, ymd } from './time';

export interface PublicHoliday { date: string; name: string; observed: boolean }

function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  const first = ymd(year, month, 1);
  return addDays(first, ((weekday - weekdayOf(first) + 7) % 7) + (n - 1) * 7);
}

function lastWeekday(year: number, month: number, weekday: number): string {
  const last = ymd(year, month, daysInMonth(year, month));
  return addDays(last, -((weekdayOf(last) - weekday + 7) % 7));
}

const MON = 1, THU = 4;

/** Fixed-date holidays: [month, day, name]. */
const FIXED: [number, number, string][] = [
  [1, 1, "New Year's Day"],
  [6, 19, 'Juneteenth'],
  [7, 4, 'Independence Day'],
  [11, 11, 'Veterans Day'],
  [12, 25, 'Christmas'],
];

function observedDate(date: string): string | null {
  const wd = weekdayOf(date);
  if (wd === 6) return addDays(date, -1);
  if (wd === 0) return addDays(date, 1);
  return null;
}

/**
 * Holidays whose date (actual or observed) falls in `year`.
 * Next year's New Year's Day observed on Dec 31 of `year` is included.
 */
export function publicHolidays(year: number): PublicHoliday[] {
  const out: PublicHoliday[] = [
    { date: nthWeekday(year, 1, MON, 3), name: 'Martin Luther King Jr. Day', observed: false },
    { date: nthWeekday(year, 2, MON, 3), name: "Presidents' Day", observed: false },
    { date: lastWeekday(year, 5, MON), name: 'Memorial Day', observed: false },
    { date: nthWeekday(year, 9, MON, 1), name: 'Labor Day', observed: false },
    { date: nthWeekday(year, 10, MON, 2), name: 'Columbus Day', observed: false },
    { date: nthWeekday(year, 11, THU, 4), name: 'Thanksgiving', observed: false },
  ];
  for (const y of [year, year + 1]) {
    for (const [m, d, name] of FIXED) {
      const date = ymd(y, m, d);
      const obs = observedDate(date);
      if (y === year) out.push({ date, name, observed: false });
      if (obs && obs.startsWith(String(year))) out.push({ date: obs, name: `${name} (observed)`, observed: true });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function publicHolidaysBetween(from: string, to: string): PublicHoliday[] {
  const out: PublicHoliday[] = [];
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
    for (const h of publicHolidays(y)) if (h.date >= from && h.date <= to) out.push(h);
  }
  return out;
}
