// SPEC §7.3 — the one table of known holidays, computed (never a hand-typed list of dates).
import { addDays, daysInMonth, weekdayOf, ymd } from './time';

export interface PublicHoliday { date: string; key: HolidayKey; name: string; observed: boolean }

function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  const first = ymd(year, month, 1);
  return addDays(first, ((weekday - weekdayOf(first) + 7) % 7) + (n - 1) * 7);
}

function lastWeekday(year: number, month: number, weekday: number): string {
  const last = ymd(year, month, daysInMonth(year, month));
  return addDays(last, -((weekdayOf(last) - weekday + 7) % 7));
}

const MON = 1, THU = 4;

interface Rule {
  name: string;
  date: (year: number) => string;
  /** Fixed-date federal holidays get a weekday "observed" day when they fall on a weekend. */
  observed?: boolean;
  dayOffByDefault: boolean;
}

export const HOLIDAYS = {
  new_years_day: { name: "New Year's Day", date: (y) => ymd(y, 1, 1), observed: true, dayOffByDefault: true },
  mlk_day: { name: 'Martin Luther King Jr. Day', date: (y) => nthWeekday(y, 1, MON, 3), dayOffByDefault: false },
  presidents_day: { name: "Presidents' Day", date: (y) => nthWeekday(y, 2, MON, 3), dayOffByDefault: false },
  memorial_day: { name: 'Memorial Day', date: (y) => lastWeekday(y, 5, MON), dayOffByDefault: true },
  juneteenth: { name: 'Juneteenth', date: (y) => ymd(y, 6, 19), observed: true, dayOffByDefault: false },
  independence_day: { name: 'Independence Day', date: (y) => ymd(y, 7, 4), observed: true, dayOffByDefault: true },
  labor_day: { name: 'Labor Day', date: (y) => nthWeekday(y, 9, MON, 1), dayOffByDefault: true },
  columbus_day: { name: 'Columbus Day', date: (y) => nthWeekday(y, 10, MON, 2), dayOffByDefault: false },
  veterans_day: { name: 'Veterans Day', date: (y) => ymd(y, 11, 11), observed: true, dayOffByDefault: false },
  thanksgiving: { name: 'Thanksgiving', date: (y) => nthWeekday(y, 11, THU, 4), dayOffByDefault: true },
  day_after_thanksgiving: { name: 'Day after Thanksgiving', date: (y) => addDays(nthWeekday(y, 11, THU, 4), 1), dayOffByDefault: true },
  christmas_eve: { name: 'Christmas Eve', date: (y) => ymd(y, 12, 24), dayOffByDefault: false }, // ⚑ "NYE or Christmas Eve"
  christmas: { name: 'Christmas', date: (y) => ymd(y, 12, 25), observed: true, dayOffByDefault: true },
  new_years_eve: { name: "New Year's Eve", date: (y) => ymd(y, 12, 31), dayOffByDefault: false }, // ⚑ see above
} satisfies Record<string, Rule>;

export type HolidayKey = keyof typeof HOLIDAYS;
export const HOLIDAY_KEYS = Object.keys(HOLIDAYS) as HolidayKey[];
export const DEFAULT_DAYS_OFF: HolidayKey[] = HOLIDAY_KEYS.filter((k) => HOLIDAYS[k].dayOffByDefault);

export function isHolidayKey(v: unknown): v is HolidayKey {
  return typeof v === 'string' && (HOLIDAY_KEYS as string[]).includes(v);
}

function observedDate(date: string): string | null {
  const wd = weekdayOf(date);
  if (wd === 6) return addDays(date, -1);
  if (wd === 0) return addDays(date, 1);
  return null;
}

/**
 * Holidays whose date (actual or observed) falls in `year`, limited to `keys` (default: all).
 * Next year's New Year's Day observed on Dec 31 of `year` is included.
 */
export function publicHolidays(year: number, keys: readonly HolidayKey[] = HOLIDAY_KEYS): PublicHoliday[] {
  const out: PublicHoliday[] = [];
  for (const key of keys) {
    const rule: Rule = HOLIDAYS[key];
    for (const y of [year, year + 1]) {
      const date = rule.date(y);
      if (y === year) out.push({ date, key, name: rule.name, observed: false });
      const obs = rule.observed ? observedDate(date) : null;
      if (obs && obs.startsWith(String(year))) out.push({ date: obs, key, name: `${rule.name} (observed)`, observed: true });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function publicHolidaysBetween(from: string, to: string, keys: readonly HolidayKey[] = HOLIDAY_KEYS): PublicHoliday[] {
  const out: PublicHoliday[] = [];
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
    for (const h of publicHolidays(y, keys)) if (h.date >= from && h.date <= to) out.push(h);
  }
  return out;
}
