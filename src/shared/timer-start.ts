// SPEC §5.5a — a rolling timer's start announcement: when its active time range opens, the household hears that
// its day began. Pure: `now` is a parameter. Imports engine.ts and time.ts; engine.ts never imports this file.
import { MISSED_AFTER_MIN, inside, type TimerWindow } from './engine';
import { addDays, localToUtc, ms, utcToLocal } from './time';

/** ⚑ Q192 — how late after the window opens the announcement may still go. */
export const TIMER_START_LATE_MIN = MISSED_AFTER_MIN;

/** ⚑ Q191 — the refusal when a timer would announce with no window. */
export const ANNOUNCE_NEEDS_WINDOW = 'Set Active from / to so the timer has a day to start.';

/** The local date of the window opening `now` belongs to; null outside the window or more than TIMER_START_LATE_MIN after it. */
export function windowOpening(now: string, win: TimerWindow): string | null {
  if (!inside(now, win)) return null;
  const local = utcToLocal(now, win.tz);
  const date = win.from > win.to && local.time < win.to ? addDays(local.date, -1) : local.date;
  return ms(now) - ms(localToUtc(date, win.from, win.tz)) > TIMER_START_LATE_MIN * 60_000 ? null : date;
}

export interface TimerStartState { running: boolean; announceStart: boolean; announcedOn: string | null }

/** The opening date to announce now, or null (§5.5a). */
export function timerStartDue(t: TimerStartState, win: TimerWindow | undefined, now: string): string | null {
  if (!t.running || !t.announceStart || !win) return null;
  const date = windowOpening(now, win);
  return date && date !== t.announcedOn ? date : null;
}

/** "Pushups timer started — every 60 minutes" (§5.5a). */
export const timerStartMessage = (title: string, intervalMin: number) =>
  `${title} timer started — every ${intervalMin} ${intervalMin === 1 ? 'minute' : 'minutes'}`;
