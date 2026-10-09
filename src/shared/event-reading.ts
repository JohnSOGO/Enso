// SPEC §7.8, §7.9 — reading an event from a screenshot or copied text: the reading as it comes over the wire, cleanEventReading
// (the model's answer is input, never trusted) and readingToForm (which form fields it may fill). Pure; the
// Worker cleans with it and the PWA fills with it, so the two can't disagree.
import { isDate, isTime } from './time';
import { ALERT_TITLE_MAX, EVENT_ADDRESS_MAX, EVENT_NOTES_MAX } from './alert-limits';

/** §7.9 — copied text sent to POST /events/read-text: at most this many characters. */
export const EVENT_TEXT_MAX = 5000;

/** What reading a screenshot returns — each field a string or null; dates YYYY-MM-DD, times HH:MM. */
export interface EventReading {
  title: string | null;
  startDate: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  notes: string | null;
}

const text = (v: unknown, max: number): string | null =>
  typeof v === 'string' ? v.trim().slice(0, max).trim() || null : null;

/** The model's answer → fields the form may fill: trimmed, unreal dates and times dropped, reversed dates swapped,
 *  an end time without a start dropped. `today` is in the signature as for cleanPhotoReading; no rule reads it yet. */
export function cleanEventReading(raw: Partial<Record<keyof EventReading, unknown>> | null | undefined, _today: string): EventReading {
  const r = raw ?? {};
  let startDate = isDate(r.startDate) ? r.startDate : null;
  let endDate = isDate(r.endDate) ? r.endDate : null;
  if (startDate && endDate && endDate < startDate) [startDate, endDate] = [endDate, startDate];
  const startTime = isTime(r.startTime) ? r.startTime : null;
  return {
    title: text(r.title, ALERT_TITLE_MAX), startDate, endDate, startTime,
    endTime: startTime && isTime(r.endTime) ? r.endTime : null,
    location: text(r.location, EVENT_ADDRESS_MAX), notes: text(r.notes, EVENT_NOTES_MAX),
  };
}

/** The event form's fields a screenshot can fill. */
export interface EventFill { title: string; date: string; allDay: boolean; startTime: string; endTime: string; endDate: string; address: string; notes: string }

/** §7.8 — fills only the fields still as they were when the form opened; → the form and how many fields changed. */
export function readingToForm<F extends EventFill>(form: F, opened: EventFill, r: EventReading): { form: F; filled: number } {
  const next: F = { ...form };
  const open = (k: keyof EventFill) => form[k] === opened[k];
  if (r.title && open('title')) next.title = r.title;
  if (r.startDate && open('date')) next.date = r.startDate;
  if (r.startTime && open('allDay') && open('startTime')) {
    next.allDay = false;
    next.startTime = r.startTime;
    if (r.endTime && open('endTime')) next.endTime = r.endTime;
  } else if (!r.startTime && r.startDate && open('allDay')) {
    next.allDay = true;
    if (open('endDate')) next.endDate = r.endDate ?? next.date;
  }
  if (next.endDate < next.date) next.endDate = next.date;
  if (r.location && open('address')) next.address = r.location;
  if (r.notes && open('notes')) next.notes = r.notes;
  const keys: (keyof EventFill)[] = ['title', 'date', 'allDay', 'startTime', 'endTime', 'endDate', 'address', 'notes'];
  return { form: next, filled: keys.filter((k) => next[k] !== form[k]).length };
}
