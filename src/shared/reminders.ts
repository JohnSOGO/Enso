// SPEC §8.5b — one-off reminders: an alarm with no repeat that rings until Done. The When chips, the "later than
// now" check and the listed state. Pure: `now` and `tz` are always passed in.
import type { ReminderState } from './vocab';
import { addDays, addMinutes, isDate, isTime, iso, localToUtc, ms, utcToLocal } from './time';

/** ⚑ Q312 — alerts before it waits silently in the Ringing bar until Done. */
export const REMINDER_MAX_ALERTS = 12;
/** ⚑ Q312 — Repeat until Done choices in minutes; the first default is 30 (also when the API is given none). */
export const REMINDER_RENOTIFY = [15, 30, 60] as const;
export const REMINDER_RENOTIFY_DEFAULT = 30;

/** ⚑ Q311 — the When chips, in form order; `time` null = In 1 hour. */
export const WHEN_CHOICE = [
  { id: 'hour', label: 'In 1 hour', time: null },
  { id: 'work', label: 'After work', time: '17:30' },
  { id: 'tonight', label: 'Tonight', time: '20:00' },
  { id: 'morning', label: 'Tomorrow morning', time: '08:00' },
] as const;
export type WhenChoiceId = (typeof WHEN_CHOICE)[number]['id'];
export const WHEN_DEFAULT: WhenChoiceId = 'work';

/** A chip's next local date + time: today while it is still ahead, else tomorrow (Tomorrow morning: always tomorrow); In 1 hour rounds up to 5 min. */
export function whenChoice(id: WhenChoiceId, now: string, tz: string): { date: string; time: string } {
  const c = WHEN_CHOICE.find((x) => x.id === id)!;
  if (c.time === null) {
    const at = addMinutes(now, 60);
    const rounded = Math.ceil(ms(at) / 300_000) * 300_000;
    return utcToLocal(iso(rounded), tz);
  }
  const today = utcToLocal(now, tz).date;
  const date = id !== 'morning' && ms(localToUtc(today, c.time, tz)) > ms(now) ? today : addDays(today, 1);
  return { date, time: c.time };
}

/** ⚑ Q314 — null when the local date + time is after now, else the message. */
export function reminderTimeError(date: unknown, time: unknown, tz: string, now: string): string | null {
  if (!isDate(date) || !isTime(time)) return 'Pick a date and a time.';
  return ms(localToUtc(date, time, tz)) > ms(now) ? null : 'Pick a time later than now.';
}

/** The listed state from the fire facts, or null for a done reminder (not listed). */
export function reminderState(f: { done: boolean; ringing: boolean; openDueAt: string | null; startAt: string }, now: string): ReminderState | null {
  if (f.done) return null;
  if (f.ringing) return 'ringing';
  if (f.openDueAt || ms(f.startAt) > ms(now)) return 'due';
  return 'missed';
}
