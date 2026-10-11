// SPEC §7D.5 — the machines' alert hours: when a machine alert may sound, and when the hours next open.
// Pure: `now` is always a parameter. Imports time only.
import { addDays, isTime, localToUtc, ms, utcToLocal, weekdayOf } from './time';

/** §7D.5 — when machine alerts may sound, household local HH:MM, from < to; null = any time that day. */
export interface DayHours { from: string; to: string }
export interface MachineHours { weekday: DayHours | null; weekend: DayHours | null }
export const DEFAULT_MACHINE_HOURS: MachineHours = { weekday: { from: '17:30', to: '20:30' }, weekend: { from: '09:00', to: '21:00' } };

/** The hours for one local date: Saturday and Sunday are the weekend. */
const hoursOn = (date: string, h: MachineHours) => (weekdayOf(date) % 6 === 0 ? h.weekend : h.weekday);

/** §7D.5 — null when a machine alert may sound at `now`, else the instant the hours next open. */
export function machineQuietUntil(h: MachineHours, tz: string, now: string): string | null {
  const local = utcToLocal(now, tz);
  const today = hoursOn(local.date, h);
  if (!today || (local.time >= today.from && local.time < today.to)) return null;
  for (let k = 0; k <= 7; k++) {
    const date = addDays(local.date, k);
    const day = hoursOn(date, h);
    const at = localToUtc(date, day ? day.from : '00:00', tz);
    if (ms(at) > ms(now)) return at;
  }
  return null; // unreachable: some day within a week opens later
}

/** The stored columns → the hours (a day with either end missing is any time). */
export function machineHoursOf(r: { machine_weekday_from: string | null; machine_weekday_to: string | null; machine_weekend_from: string | null; machine_weekend_to: string | null }): MachineHours {
  const day = (from: string | null, to: string | null) => (from && to ? { from, to } : null);
  return { weekday: day(r.machine_weekday_from, r.machine_weekday_to), weekend: day(r.machine_weekend_from, r.machine_weekend_to) };
}

/** PATCH /machines/hours body: both days, each `{ from, to }` (from < to) or null. Returns the hours or a message. */
export function parseMachineHours(b: Record<string, unknown>): MachineHours | string {
  const day = (v: unknown): DayHours | null | string => {
    if (v === null) return null;
    const d = v as Record<string, unknown> | undefined;
    if (!d || typeof d !== 'object' || !isTime(d.from) || !isTime(d.to)) return 'Hours must be { from, to } as HH:MM, or null for any time.';
    return d.from < d.to ? { from: d.from, to: d.to } : 'The start must be before the end, on the same day.';
  };
  const weekday = day(b.weekday), weekend = day(b.weekend);
  if (typeof weekday === 'string') return weekday;
  if (typeof weekend === 'string') return weekend;
  return { weekday, weekend };
}
