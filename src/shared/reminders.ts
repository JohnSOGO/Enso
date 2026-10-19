// SPEC §8.5b — one-off reminders: an alarm with no repeat that rings until Done. The When chips, the "later than
// now" check and the listed state; §8.5c — random times in a window on chosen days. Pure: `now` and `tz` are always passed in.
import { AFTER_KIND, WEEKDAY, isOneOf, type Action, type AfterKind, type ReminderState, type Weekday } from './vocab';
import { addDays, addMinutes, isDate, isTime, iso, localToUtc, ms, utcToLocal } from './time';
import { randomWindowError } from './random-time';
import { planReminderFires, type ReminderEvent } from './engine';
import type { Recurrence } from './recurrence';

/** ⚑ Q312 — alerts before it waits silently in the Ringing bar until Done. */
export const REMINDER_MAX_ALERTS = 12;
/** ⚑ Q312 — Repeat until Done choices in minutes; the first default is 30 (also when the API is given none). */
export const REMINDER_RENOTIFY = [15, 30, 60] as const;
export const REMINDER_RENOTIFY_DEFAULT = 30;

/** ⚑ Q315 — After work / After school when a member hasn't set it: by role. */
export const AFTER_DEFAULT = { admin: { kind: 'work', time: '17:30' }, member: { kind: 'school', time: '15:00' } } as const;
export const AFTER_LABEL: Record<AfterKind, string> = { work: 'After work', school: 'After school' };
export interface After { kind: AfterKind; time: string }

/** A member's After kind and time: what they stored, else their role's default. */
export function afterOf(m: { admin: boolean; kind: string | null; time: string | null }): After {
  const d = AFTER_DEFAULT[m.admin ? 'admin' : 'member'];
  return { kind: (m.kind as AfterKind | null) ?? d.kind, time: m.time ?? d.time };
}

/** null, or the 400 message for a PATCH /me afterKind / afterTime (null clears either). */
export function afterError(kind: unknown, time: unknown): string | null {
  if (kind !== undefined && kind !== null && !isOneOf(AFTER_KIND, kind)) return `afterKind must be one of: ${AFTER_KIND.join(', ')}.`;
  if (time !== undefined && time !== null && !isTime(time)) return 'afterTime must be HH:MM.';
  return null;
}

/** ⚑ Q311 — the When chips, in form order; `time` null = In 1 hour; 'work' is the person's After time (label by kind). */
export const WHEN_CHOICE = [
  { id: 'hour', label: 'In 1 hour', time: null },
  { id: 'work', label: AFTER_LABEL.work, time: AFTER_DEFAULT.admin.time },
  { id: 'tonight', label: 'Tonight', time: '20:00' },
  { id: 'morning', label: 'Tomorrow morning', time: '08:00' },
] as const;
export type WhenChoiceId = (typeof WHEN_CHOICE)[number]['id'];
export const WHEN_DEFAULT: WhenChoiceId = 'work';

/** A chip's next local date + time: today while it is still ahead, else tomorrow (Tomorrow morning: always tomorrow); In 1 hour rounds up to 5 min. */
export function whenChoice(id: WhenChoiceId, now: string, tz: string, afterTime?: string): { date: string; time: string } {
  const found = WHEN_CHOICE.find((x) => x.id === id)!;
  const c = id === 'work' && afterTime ? { ...found, time: afterTime } : found;
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

/** The listed state from the fire facts, or null for a done reminder (not listed). A window (§8.5c) is never missed. */
export function reminderState(f: { done: boolean; ringing: boolean; openDueAt: string | null; startAt: string; window?: boolean }, now: string): ReminderState | null {
  if (f.done) return null;
  if (f.ringing) return 'ringing';
  if (f.openDueAt || f.window || ms(f.startAt) > ms(now)) return 'due';
  return 'missed';
}

/** §8.5c — a window reminder's days and [from, to). */
export interface ReminderWindow { days: Weekday[]; from: string; to: string }
/** ⚑ Q320 — a new window: Weekdays, 8:00am–11:00am. */
export const WINDOW_DEFAULT: ReminderWindow = { days: ['MO', 'TU', 'WE', 'TH', 'FR'], from: '08:00', to: '11:00' };

/** null, or the 400 message for a window: at least one real day, then randomWindowError. */
export function windowError(w: unknown): string | null {
  if (!w || typeof w !== 'object') return 'Random times need days and a From and To time.';
  const x = w as Record<string, unknown>;
  if (!Array.isArray(x.days) || x.days.length === 0 || !x.days.every((d) => isOneOf(WEEKDAY, d))) return 'Pick at least one day.';
  return isTime(x.from) && isTime(x.to) ? randomWindowError(x.from, x.to) : 'Random times need a From and a To time (HH:MM).';
}

/** The days in week order, each once. */
export const windowDays = (days: Weekday[]): Weekday[] => WEEKDAY.filter((d) => days.includes(d));

/** §8.5c — the next ring the tick will plan: the same planReminderFires pick, over the next 8 days; null when none. */
export function nextWindowRing(ev: ReminderEvent, now: string, tz: string): string | null {
  return planReminderFires(ev, tz, now, addMinutes(now, 8 * 1440))[0]?.due_at ?? null;
}

/** ⚑ Q321 — Done or Ack on a window reminder's ring ends it: its repeat with `until` that day, else null. */
export function windowEnd(
  ev: { is_alarm: number; remind_random_from: string | null; recurrence: Recurrence | null },
  fire: { kind: string; occurrence_date: string | null }, action: Action,
): Recurrence | null {
  if (fire.kind !== 'reminder' || !ev.is_alarm || !ev.remind_random_from || !ev.recurrence || !fire.occurrence_date) return null;
  if (action !== 'done' && action !== 'ack') return null;
  return { ...ev.recurrence, until: fire.occurrence_date };
}
