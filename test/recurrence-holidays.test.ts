// SPEC §5.8 R4–R7 and §7.3 acceptance.
import { describe, expect, it } from 'vitest';
import { occurrences, positionInMonth, recurrenceError } from '../src/shared/recurrence';
import { easter, optionsExpirations } from '../src/shared/markets';
import { DEFAULT_DAYS_OFF, HOLIDAY_KEYS, publicHolidays } from '../src/shared/holidays';

const first = (n: number, xs: string[]) => xs.slice(0, n);

describe('recurrence', () => {
  it('R4 monthly on the 31st skips short months', () => {
    const ev = { start_date: '2027-01-31', recurrence: { freq: 'MONTHLY' as const }, exdates: [] };
    expect(first(3, occurrences(ev, '2027-01-01', '2027-12-31'))).toEqual(['2027-01-31', '2027-03-31', '2027-05-31']);
  });

  it('R5 weekly Mon/Wed/Fri until 2026-10-11', () => {
    const ev = { start_date: '2026-10-05', recurrence: { freq: 'WEEKLY' as const, byDay: ['MO', 'WE', 'FR'] as ('MO' | 'WE' | 'FR')[], until: '2026-10-11' }, exdates: [] };
    expect(occurrences(ev, '2026-01-01', '2026-12-31')).toEqual(['2026-10-05', '2026-10-07', '2026-10-09']);
  });

  const biweekly = { start_date: '2026-10-06', recurrence: { freq: 'WEEKLY' as const, interval: 2 }, exdates: [] as string[] };

  it('R6 every 2 weeks', () => {
    expect(first(3, occurrences(biweekly, '2026-01-01', '2026-12-31'))).toEqual(['2026-10-06', '2026-10-20', '2026-11-03']);
  });

  it('R7 every 2 weeks with an exdate', () => {
    expect(first(3, occurrences({ ...biweekly, exdates: ['2026-10-20'] }, '2026-01-01', '2026-12-31')))
      .toEqual(['2026-10-06', '2026-11-03', '2026-11-17']);
  });

  it('a window starting far after the start still lands on the right weeks', () => {
    expect(first(2, occurrences(biweekly, '2027-06-01', '2027-07-01'))).toEqual(['2027-06-01', '2027-06-15']); // 2027-06-01 is 34 weeks after the start
  });

  it('count limits occurrences and counts exdated ones (RFC 5545)', () => {
    const ev = { start_date: '2026-10-01', recurrence: { freq: 'DAILY' as const, count: 3 }, exdates: ['2026-10-02'] };
    expect(occurrences(ev, '2026-01-01', '2026-12-31')).toEqual(['2026-10-01', '2026-10-03']);
  });

  it('yearly on Feb 29 only in leap years', () => {
    const ev = { start_date: '2028-02-29', recurrence: { freq: 'YEARLY' as const }, exdates: [] };
    expect(occurrences(ev, '2028-01-01', '2036-12-31')).toEqual(['2028-02-29', '2032-02-29', '2036-02-29']);
  });

  it('one-off event', () => {
    expect(occurrences({ start_date: '2026-10-06', recurrence: null, exdates: [] }, '2026-10-01', '2026-10-31')).toEqual(['2026-10-06']);
  });

  it('validates input', () => {
    expect(recurrenceError({ freq: 'HOURLY' })).toMatch(/freq/);
    expect(recurrenceError({ freq: 'DAILY', byDay: ['MO'] })).toMatch(/byDay/);
    expect(recurrenceError({ freq: 'DAILY', until: '2026-01-01', count: 2 })).toMatch(/not both/);
    expect(recurrenceError({ freq: 'WEEKLY', byDay: ['MO'], interval: 2 })).toBeNull();
  });
});

describe('public holidays', () => {
  const on = (year: number, date: string) => publicHolidays(year).filter((h) => h.date === date).map((h) => h.name);

  it('2026 acceptance dates', () => {
    expect(on(2026, '2026-09-07')).toEqual(['Labor Day']);
    expect(on(2026, '2026-11-26')).toEqual(['Thanksgiving']);
    expect(on(2026, '2026-05-25')).toEqual(['Memorial Day']);
    expect(on(2026, '2026-07-04')).toEqual(['Independence Day']);
    expect(on(2026, '2026-07-03')).toEqual(['Independence Day (observed)']);
  });

  it('2027 Christmas and next New Year observed', () => {
    expect(on(2027, '2027-12-24')).toContain('Christmas (observed)'); // also Christmas Eve
    expect(on(2027, '2027-12-31')).toContain("New Year's Day (observed)"); // also New Year's Eve
    expect(on(2028, '2027-12-31')).toEqual([]);
  });

  it('every known holiday once a year (plus observed days)', () => {
    expect(publicHolidays(2026).filter((h) => !h.observed)).toHaveLength(HOLIDAY_KEYS.length);
    expect(on(2026, '2026-11-27')).toEqual(['Day after Thanksgiving']);
  });

  it("default days off are MojoSOGO's list: the core six + day after Thanksgiving + both eves", () => {
    expect(DEFAULT_DAYS_OFF).toEqual(['new_years_day', 'memorial_day', 'independence_day', 'labor_day', 'thanksgiving', 'day_after_thanksgiving', 'christmas_eve', 'christmas', 'new_years_eve']);
    const dates = publicHolidays(2026, DEFAULT_DAYS_OFF).map((h) => h.date);
    expect(dates).not.toContain('2026-10-12'); // Columbus Day
    expect(dates).not.toContain('2026-11-11'); // Veterans Day
    expect(dates).toContain('2026-11-27');
  });
});

describe('monthly by weekday (SPEC §4.3)', () => {
  it('3rd Friday', () => {
    const ev = { start_date: '2026-10-16', recurrence: { freq: 'MONTHLY' as const, byDay: ['FR' as const], setPos: 3 as const }, exdates: [] };
    expect(first(3, occurrences(ev, '2026-01-01', '2027-12-31'))).toEqual(['2026-10-16', '2026-11-20', '2026-12-18']);
  });
  it('last Friday', () => {
    const ev = { start_date: '2026-10-30', recurrence: { freq: 'MONTHLY' as const, byDay: ['FR' as const], setPos: -1 as const }, exdates: [] };
    expect(first(3, occurrences(ev, '2026-01-01', '2027-12-31'))).toEqual(['2026-10-30', '2026-11-27', '2026-12-25']);
  });
  it('the form derives the position from the date', () => {
    expect(positionInMonth('2026-10-16')).toEqual({ weekday: 'FR', setPos: 3 });
    expect(positionInMonth('2026-10-30')).toEqual({ weekday: 'FR', setPos: -1 });
  });
  it('validates', () => {
    expect(recurrenceError({ freq: 'MONTHLY', byDay: ['FR'] })).toMatch(/setPos/);
    expect(recurrenceError({ freq: 'MONTHLY', byDay: ['FR', 'MO'], setPos: 3 })).toMatch(/exactly one/);
    expect(recurrenceError({ freq: 'WEEKLY', setPos: 3 })).toMatch(/only allowed with MONTHLY/);
  });
});

describe('monthly options expiration (SPEC §7.4)', () => {
  const on = (year: number) => optionsExpirations(year).map((d) => d.date);
  it('Easter', () => {
    expect([easter(2025), easter(2026), easter(2027)]).toEqual(['2025-04-20', '2026-04-05', '2027-03-28']);
  });
  it('3rd Friday, or Thursday when the exchange is closed', () => {
    expect(on(2026)).toContain('2026-10-16');
    expect(on(2026)).toContain('2026-06-18'); // Fri 06-19 is Juneteenth
    expect(on(2025)).toContain('2025-04-17'); // Fri 04-18 is Good Friday
    expect(on(2026)).toContain('2026-04-17'); // Good Friday 2026 is 04-03
    expect(on(2026)).toHaveLength(12);
  });
});
