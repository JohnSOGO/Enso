// SPEC §8.4, §4.2 — the event form's Repeat section mappings in RepeatFields.tsx: repeatOf and weeksOf (a stored
// recurrence → the form), toRecurrence (the form → the recurrence saved) and repeatText (the one place repeat
// wording lives). A .tsx module, so it is loaded at run time: the Worker typecheck has no JSX.
import { describe, expect, it } from 'vitest';
import type { Recurrence, SetPos } from '../src/shared/recurrence';
import type { Weekday } from '../src/shared/vocab';

type Repeat = 'none' | 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'MONTHLY_POS' | 'MONTHLY_WEEKS' | 'YEARLY';
interface RepeatValue { repeat: Repeat; byDay: Weekday[]; weeks: SetPos[]; until: string }

const FIELDS = '../frontend/src/components/RepeatFields.tsx';
const { repeatOf, weeksOf, toRecurrence, repeatText, ownWeek } = (await import(/* @vite-ignore */ FIELDS)) as {
  repeatOf: (r: Recurrence | null) => Repeat;
  weeksOf: (r: Recurrence | null, date: string) => SetPos[];
  toRecurrence: (v: RepeatValue, date: string) => Recurrence | null;
  repeatText: (r: Recurrence | null, startDate: string) => string;
  ownWeek: (date: string) => SetPos[];
};

const THU_3RD = '2026-10-15'; // the 3rd Thursday of October 2026
const THU_LAST = '2026-10-29'; // the 5th, so "last"
const form = (repeat: Repeat, more: Partial<RepeatValue> = {}): RepeatValue => ({ repeat, byDay: [], weeks: [], until: '', ...more });

describe('repeatOf — a stored recurrence → the Repeat choice', () => {
  it('none, the plain frequencies, every other week and the three monthly kinds', () => {
    expect(repeatOf(null)).toBe('none');
    expect(repeatOf({ freq: 'DAILY' })).toBe('DAILY');
    expect(repeatOf({ freq: 'WEEKLY', byDay: ['MO'] })).toBe('WEEKLY');
    expect(repeatOf({ freq: 'WEEKLY', interval: 2, byDay: ['MO'] })).toBe('BIWEEKLY');
    expect(repeatOf({ freq: 'MONTHLY' })).toBe('MONTHLY');
    expect(repeatOf({ freq: 'MONTHLY', byDay: ['TH'], setPos: 3 })).toBe('MONTHLY_POS');
    expect(repeatOf({ freq: 'MONTHLY', byDay: ['TH'], setPos: [1, 3] })).toBe('MONTHLY_WEEKS');
    expect(repeatOf({ freq: 'YEARLY' })).toBe('YEARLY');
  });
});

describe('weeksOf / ownWeek — the ticked weeks', () => {
  it("certain weeks show as stored; anything else starts on the date's own week", () => {
    expect(ownWeek(THU_3RD)).toEqual([3]);
    expect(ownWeek(THU_LAST)).toEqual([-1]);
    expect(weeksOf({ freq: 'MONTHLY', byDay: ['TH'], setPos: [1, -1] }, THU_3RD)).toEqual([1, -1]);
    expect(weeksOf({ freq: 'MONTHLY', byDay: ['TH'], setPos: 3 }, THU_LAST)).toEqual([-1]);
    expect(weeksOf(null, THU_3RD)).toEqual([3]);
  });
});

describe('toRecurrence — the Repeat section → the recurrence saved', () => {
  it('none → null; daily and yearly carry only their frequency', () => {
    expect(toRecurrence(form('none', { until: '2026-12-31' }), THU_3RD)).toBeNull();
    expect(toRecurrence(form('DAILY'), THU_3RD)).toEqual({ freq: 'DAILY' });
    expect(toRecurrence(form('YEARLY'), THU_3RD)).toEqual({ freq: 'YEARLY' });
  });
  it('weekly and every other week: the ticked days in week order', () => {
    expect(toRecurrence(form('WEEKLY', { byDay: ['TH', 'MO'] }), THU_3RD)).toEqual({ freq: 'WEEKLY', byDay: ['MO', 'TH'] });
    expect(toRecurrence(form('BIWEEKLY', { byDay: ['SA', 'SU'] }), THU_3RD)).toEqual({ freq: 'WEEKLY', interval: 2, byDay: ['SU', 'SA'] });
  });
  it("monthly on the date's weekday position, or on certain weeks in month order", () => {
    expect(toRecurrence(form('MONTHLY'), THU_3RD)).toEqual({ freq: 'MONTHLY' });
    expect(toRecurrence(form('MONTHLY_POS'), THU_3RD)).toEqual({ freq: 'MONTHLY', byDay: ['TH'], setPos: 3 });
    expect(toRecurrence(form('MONTHLY_POS'), THU_LAST)).toEqual({ freq: 'MONTHLY', byDay: ['TH'], setPos: -1 });
    expect(toRecurrence(form('MONTHLY_WEEKS', { weeks: [-1, 3, 1] }), THU_3RD)).toEqual({ freq: 'MONTHLY', byDay: ['TH'], setPos: [1, 3, -1] });
  });
  it('until is kept when given', () => {
    expect(toRecurrence(form('DAILY', { until: '2026-12-31' }), THU_3RD)).toEqual({ freq: 'DAILY', until: '2026-12-31' });
  });
  it('round trip: each choice saved reads back as itself', () => {
    for (const repeat of ['none', 'DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'MONTHLY_POS', 'MONTHLY_WEEKS', 'YEARLY'] as const) {
      const r = toRecurrence(form(repeat, { byDay: ['TH'], weeks: [1, 3] }), THU_3RD);
      expect(repeatOf(r)).toBe(repeat);
      if (repeat === 'MONTHLY_WEEKS') expect(weeksOf(r, THU_3RD)).toEqual([1, 3]);
    }
  });
});

describe('repeatText — the repeat wording', () => {
  const at = (date: string, opts: Intl.DateTimeFormatOptions) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, opts);
  it('once and yearly name the date as the device shows it', () => {
    expect(repeatText(null, THU_3RD)).toBe(`Once, ${at(THU_3RD, { month: 'short', day: 'numeric', year: 'numeric' })}`);
    expect(repeatText({ freq: 'YEARLY' }, THU_3RD)).toBe(`Yearly on ${at(THU_3RD, { month: 'short', day: 'numeric' })}`);
  });
  it('daily and weekly, with their intervals; weekly without days uses the start date\'s weekday', () => {
    expect(repeatText({ freq: 'DAILY' }, THU_3RD)).toBe('Daily');
    expect(repeatText({ freq: 'DAILY', interval: 3 }, THU_3RD)).toBe('Every 3 days');
    expect(repeatText({ freq: 'WEEKLY', byDay: ['MO', 'TH'] }, THU_3RD)).toBe('Weekly on Mon, Thu');
    expect(repeatText({ freq: 'WEEKLY', interval: 2, byDay: ['TH'] }, THU_3RD)).toBe('Every 2 weeks on Thu');
    expect(repeatText({ freq: 'WEEKLY' }, THU_3RD)).toBe('Weekly on Thu');
  });
  it('monthly: on a day, on the nth weekday, on certain weeks, every n months', () => {
    expect(repeatText({ freq: 'MONTHLY' }, THU_3RD)).toBe('Monthly on day 15');
    expect(repeatText({ freq: 'MONTHLY', interval: 2 }, THU_3RD)).toBe('Monthly on day 15, every 2 months');
    expect(repeatText({ freq: 'MONTHLY', byDay: ['TH'], setPos: 3 }, THU_3RD)).toBe('Monthly on the 3rd Thursday');
    expect(repeatText({ freq: 'MONTHLY', byDay: ['TH'], setPos: -1 }, THU_LAST)).toBe('Monthly on the last Thursday');
    expect(repeatText({ freq: 'MONTHLY', byDay: ['TH'], setPos: [3, 1] }, THU_3RD)).toBe('1st & 3rd Thursday');
    expect(repeatText({ freq: 'MONTHLY', byDay: ['TH'], setPos: [-1, 2, 1] }, THU_3RD)).toBe('1st, 2nd & last Thursday');
    expect(repeatText({ freq: 'MONTHLY', byDay: ['TH'], setPos: [2] }, THU_3RD)).toBe('2nd Thursday');
  });
  it('until is said last', () => {
    expect(repeatText({ freq: 'WEEKLY', byDay: ['TH'], until: '2026-12-31' }, THU_3RD)).toBe('Weekly on Thu until 2026-12-31');
  });
});
