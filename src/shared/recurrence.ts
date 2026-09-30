// SPEC §4.3 — the single recurrence format, used by the calendar view AND the engine.
import { FREQ, WEEKDAY, isOneOf, type Freq, type Weekday } from './vocab';
import { addDays, daysInMonth, diffDays, isDate, startOfWeek, weekdayOf, ymd } from './time';

export interface Recurrence {
  freq: Freq;
  interval?: number;
  byDay?: Weekday[];
  /** MONTHLY only: the nth `byDay` of the month; -1 = last (RRULE "BYDAY=3FR"). */
  setPos?: SetPos;
  until?: string;
  count?: number;
}

export const SET_POS = [1, 2, 3, 4, -1] as const;
export type SetPos = (typeof SET_POS)[number];

export interface Recurring {
  start_date: string;
  recurrence: Recurrence | null;
  exdates: string[];
}

const MAX_GENERATED = 20_000;

/** Validates untrusted input. Returns an error message, or null when valid. */
export function recurrenceError(r: unknown): string | null {
  if (r === null) return null;
  if (typeof r !== 'object') return 'recurrence must be an object or null';
  const x = r as Record<string, unknown>;
  if (!isOneOf(FREQ, x.freq)) return `freq must be one of ${FREQ.join(', ')}`;
  if (x.interval !== undefined && !(Number.isInteger(x.interval) && (x.interval as number) >= 1 && (x.interval as number) <= 99)) return 'interval must be 1–99';
  if (x.byDay !== undefined) {
    if (x.freq !== 'WEEKLY' && x.freq !== 'MONTHLY') return 'byDay is only allowed with WEEKLY or MONTHLY';
    if (!Array.isArray(x.byDay) || x.byDay.length === 0 || !x.byDay.every((d) => isOneOf(WEEKDAY, d))) return 'byDay must be a non-empty list of SU..SA';
  }
  if (x.freq === 'MONTHLY' && (x.byDay !== undefined || x.setPos !== undefined)) {
    if (!Array.isArray(x.byDay) || x.byDay.length !== 1) return 'MONTHLY by weekday needs exactly one byDay';
    if (!(SET_POS as readonly unknown[]).includes(x.setPos)) return 'setPos must be 1, 2, 3, 4 or -1 (last)';
  }
  if (x.setPos !== undefined && x.freq !== 'MONTHLY') return 'setPos is only allowed with MONTHLY';
  if (x.until !== undefined && !isDate(x.until)) return 'until must be YYYY-MM-DD';
  if (x.count !== undefined && !(Number.isInteger(x.count) && (x.count as number) >= 1)) return 'count must be a positive integer';
  if (x.until !== undefined && x.count !== undefined) return 'use until or count, not both';
  return null;
}

/** The nth (1–4) or last (-1) given weekday (0 = Sunday) of a month, as YYYY-MM-DD. */
export function nthWeekdayOfMonth(year: number, month1: number, weekday: number, n: SetPos): string {
  if (n === -1) {
    const last = ymd(year, month1, daysInMonth(year, month1));
    return addDays(last, -((weekdayOf(last) - weekday + 7) % 7));
  }
  const first = ymd(year, month1, 1);
  return addDays(first, ((weekday - weekdayOf(first) + 7) % 7) + (n - 1) * 7);
}

/** How the form describes a date's position: 16 Oct 2026 (a Friday) → { weekday: 'FR', setPos: 3 }. */
export function positionInMonth(date: string): { weekday: Weekday; setPos: SetPos } {
  const day = Number(date.slice(8, 10));
  const n = Math.ceil(day / 7);
  return { weekday: WEEKDAY[weekdayOf(date)], setPos: (n >= 5 ? -1 : n) as SetPos };
}

/** Occurrence start dates (local) within [from, to], inclusive, in order. */
export function occurrences(ev: Recurring, from: string, to: string): string[] {
  const r = ev.recurrence;
  const skip = new Set(ev.exdates);
  const out: string[] = [];
  const accept = (d: string) => { if (d >= from && d <= to && !skip.has(d)) out.push(d); };

  if (!r) { accept(ev.start_date); return out; }

  const interval = r.interval ?? 1;
  const last = r.until && r.until < to ? r.until : to;
  let generated = 0;
  // Emits a generated occurrence; returns false when generation must stop.
  const emit = (d: string): boolean => {
    if (d > last) return false;
    if (r.count !== undefined && generated >= r.count) return false;
    generated++;
    accept(d);
    return generated < MAX_GENERATED;
  };

  switch (r.freq) {
    case 'DAILY': {
      let k = 0;
      if (r.count === undefined && from > ev.start_date) {
        k = Math.floor(diffDays(from, ev.start_date) / interval);
      }
      for (; ; k++) if (!emit(addDays(ev.start_date, k * interval))) break;
      break;
    }
    case 'WEEKLY': {
      const days = (r.byDay ?? [WEEKDAY[weekdayOf(ev.start_date)]])
        .map((d) => WEEKDAY.indexOf(d)).sort((a, b) => a - b);
      const week0 = startOfWeek(ev.start_date);
      let w = 0;
      if (r.count === undefined && from > ev.start_date) {
        w = Math.max(0, Math.floor(diffDays(startOfWeek(from), week0) / 7 / interval) * interval);
      }
      outer: for (; ; w += interval) {
        for (const day of days) {
          const d = addDays(week0, w * 7 + day);
          if (d < ev.start_date) continue;
          if (!emit(d)) break outer;
        }
      }
      break;
    }
    case 'MONTHLY': {
      const [y, m, day] = ev.start_date.split('-').map(Number);
      for (let k = 0; ; k += interval) {
        const mi = m - 1 + k;
        const yy = y + Math.floor(mi / 12);
        const mm = (mi % 12) + 1;
        if (ymd(yy, mm, 1) > last) break;
        if (r.byDay && r.setPos) {
          const d = nthWeekdayOfMonth(yy, mm, WEEKDAY.indexOf(r.byDay[0]), r.setPos);
          if (d < ev.start_date) continue;
          if (!emit(d)) break;
        } else if (day <= daysInMonth(yy, mm) && !emit(ymd(yy, mm, day))) break;
      }
      break;
    }
    case 'YEARLY': {
      const [y, m, day] = ev.start_date.split('-').map(Number);
      for (let k = 0; ; k += interval) {
        if (ymd(y + k, 1, 1) > last) break;
        if (day <= daysInMonth(y + k, m) && !emit(ymd(y + k, m, day))) break;
      }
      break;
    }
  }
  return out;
}
