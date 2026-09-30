// SPEC §7.4 — monthly options expiration: the 3rd Friday, or the Thursday before when
// that Friday is an exchange holiday (Good Friday, Juneteenth actual/observed).
import { addDays, weekdayOf, ymd } from './time';
import { nthWeekdayOfMonth } from './recurrence';

export interface MarketDay { date: string; name: string; emoji: string }

export const OPTIONS_EXPIRATION = { name: 'Monthly options expiration', emoji: '📈' } as const;

/** Easter Sunday (Gregorian, anonymous computus). */
export function easter(year: number): string {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(year, month, day);
}

/** Exchange holidays that can land on a 3rd Friday (days 15–21). */
function exchangeClosed(year: number): Set<string> {
  const juneteenth = ymd(year, 6, 19);
  const wd = weekdayOf(juneteenth);
  const observed = wd === 6 ? addDays(juneteenth, -1) : wd === 0 ? addDays(juneteenth, 1) : juneteenth;
  return new Set([addDays(easter(year), -2), observed]);
}

export function optionsExpirations(year: number): MarketDay[] {
  const closed = exchangeClosed(year);
  const out: MarketDay[] = [];
  for (let month = 1; month <= 12; month++) {
    const friday = nthWeekdayOfMonth(year, month, 5, 3);
    out.push({ date: closed.has(friday) ? addDays(friday, -1) : friday, ...OPTIONS_EXPIRATION });
  }
  return out;
}

export function marketDaysBetween(from: string, to: string): MarketDay[] {
  const out: MarketDay[] = [];
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
    for (const m of optionsExpirations(y)) if (m.date >= from && m.date <= to) out.push(m);
  }
  return out;
}
