// SPEC §4.3 — the single recurrence format, used by the calendar view AND the engine.
import { FREQ, WEEKDAY, isOneOf, type Freq, type Weekday } from './vocab';
import { addDays, daysInMonth, diffDays, isDate, startOfWeek, weekdayOf, ymd } from './time';

export interface Recurrence {
  freq: Freq;
  interval?: number;
  byDay?: Weekday[];
  until?: string;
  count?: number;
}

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
    if (x.freq !== 'WEEKLY') return 'byDay is only allowed with WEEKLY';
    if (!Array.isArray(x.byDay) || x.byDay.length === 0 || !x.byDay.every((d) => isOneOf(WEEKDAY, d))) return 'byDay must be a non-empty list of SU..SA';
  }
  if (x.until !== undefined && !isDate(x.until)) return 'until must be YYYY-MM-DD';
  if (x.count !== undefined && !(Number.isInteger(x.count) && (x.count as number) >= 1)) return 'count must be a positive integer';
  if (x.until !== undefined && x.count !== undefined) return 'use until or count, not both';
  return null;
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
        if (day <= daysInMonth(yy, mm) && !emit(ymd(yy, mm, day))) break;
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
