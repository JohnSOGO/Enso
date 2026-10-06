// SPEC §7C — things to do (pure): limits, validation, reminders, Plan it, cleaning a photo
// reading. `now`, `today` and `tz` are always parameters. Imports engine, never the reverse.
import { CHANNEL, THING_STATUS, isOneOf, type Channel, type ThingStatus } from './vocab';
import { isDate, localToUtc, ms } from './time';
import { newThingFire, type NewFire } from './engine';

export const TITLE_MAX = 120;
export const NOTE_MAX = 2000;
export const PLACE_MAX = 200;
export const ADDRESS_MAX = 300;
export const PHONE_MAX = 50;
export const COST_MAX = 200;
export const URL_MAX = 500;

/** Photo reading cost guard (§7C.4): reads per household per local day. ⚑ */
export const READS_PER_DAY = 40;
/** Reminders ring at this local time (§7C.2). ⚑ */
export const THING_REMIND_TIME = '09:00';
/** Done / let-go things stay listed this long (§10 GET /things). */
export const CLOSED_VISIBLE_DAYS = 60;

/** One `things` row as D1 returns it. */
export interface ThingRow {
  id: string;
  title: string;
  note: string | null;
  place: string | null;
  address: string | null;
  phone: string | null;
  cost: string | null;
  url: string | null;
  window_start: string | null;
  window_end: string | null;
  remind_start: number;
  remind_on: string | null;
  channels: string;
  photo_key: string | null;
  status: ThingStatus;
  planned_event_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** A thing on the wire (§10). */
export interface Thing {
  id: string;
  title: string;
  note: string | null;
  place: string | null;
  address: string | null;
  phone: string | null;
  cost: string | null;
  url: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  remindStart: boolean;
  remindOn: string | null;
  channels: Channel[];
  hasPhoto: boolean;
  status: ThingStatus;
  plannedEventId: string | null;
  plannedDate: string | null;
  createdBy: string;
  updatedAt: string;
}

/** What reading a photo returns (§7C.4) — each field a string or null, dates YYYY-MM-DD. */
export interface PhotoReading {
  title: string | null;
  startDate: string | null;
  endDate: string | null;
  place: string | null;
  address: string | null;
  phone: string | null;
  cost: string | null;
  url: string | null;
  note: string | null;
}

// ---- §7C.1 validation ----

/** Normalized thing fields from a POST/PATCH body. `status` is present only when the body named one. */
export interface ThingInput {
  title: string;
  note: string | null;
  place: string | null;
  address: string | null;
  phone: string | null;
  cost: string | null;
  url: string | null;
  window_start: string | null;
  window_end: string | null;
  remind_start: boolean;
  remind_on: string | null;
  channels: Channel[];
  status?: ThingStatus;
}

const empty = (v: unknown) => v === undefined || v === null || v === '';
/**
 * §7C.1 — the one link rule, for typing and photo readings alike: `http(s)://…` is kept; a bare
 * web address as flyers print it ("pumpkinjunctionsd.com", "www.example.org/tickets") gets
 * `https://`; another scheme (javascript:, ftp:) or no dotted host → null. Fits URL_MAX or null.
 */
export function webLink(raw: string): string | null {
  const s = raw.trim();
  let link: string | null = null;
  if (/^https?:\/\/[^\s/?#]+\.[^\s/?#]+\S*$/i.test(s)) link = s;
  else if (/^[a-z][a-z0-9+-]*:/i.test(s) && !/^[^\s/]+\.[^\s/]+:\d/.test(s)) link = null; // has a scheme: not ours
  else if (/^[\w-]+(\.[\w-]+)+(:\d+)?([/?#]\S*)?$/.test(s)) link = `https://${s}`;
  return link && link.length <= URL_MAX ? link : null;
}

/** Optional text: empty → null; else trimmed and at most `max`, or an error naming the field. */
function optText(v: unknown, field: string, max: number): string | null | { error: string } {
  if (empty(v)) return null;
  if (typeof v !== 'string' || v.trim().length > max) return { error: `${field} can be at most ${max} characters.` };
  return v.trim() || null;
}

/** POST/PATCH body (wire names) → normalized thing fields, or a message naming the offending field. */
export function parseThingInput(b: Record<string, unknown>): ThingInput | string {
  const title = typeof b.title === 'string' ? b.title.trim() : '';
  if (!title || title.length > TITLE_MAX) return `title must be 1–${TITLE_MAX} characters.`;
  const note = optText(b.note, 'note', NOTE_MAX);
  if (note && typeof note === 'object') return note.error;
  const place = optText(b.place, 'place', PLACE_MAX);
  if (place && typeof place === 'object') return place.error;
  const address = optText(b.address, 'address', ADDRESS_MAX);
  if (address && typeof address === 'object') return address.error;
  const phone = optText(b.phone, 'phone', PHONE_MAX);
  if (phone && typeof phone === 'object') return phone.error;
  const cost = optText(b.cost, 'cost', COST_MAX);
  if (cost && typeof cost === 'object') return cost.error;
  const url = optText(b.url, 'url', URL_MAX);
  if (url && typeof url === 'object') return url.error;
  const link = url ? webLink(url) : null;
  if (url && !link) return 'url must be a web address, like pumpkinjunction.com or https://….';
  for (const f of ['windowStart', 'windowEnd', 'remindOn'] as const) {
    if (!empty(b[f]) && !isDate(b[f])) return `${f} must be a real date, YYYY-MM-DD.`;
  }
  const window_start = empty(b.windowStart) ? null : (b.windowStart as string);
  const window_end = empty(b.windowEnd) ? null : (b.windowEnd as string);
  if (window_start && window_end && window_end < window_start) return 'windowEnd must be on or after windowStart.';
  if (!empty(b.remindStart) && typeof b.remindStart !== 'boolean') return 'remindStart must be true or false.';
  const remind_start = b.remindStart === true;
  if (remind_start && !window_start) return 'remindStart needs a windowStart to remind on.';
  const remind_on = empty(b.remindOn) ? null : (b.remindOn as string);
  const ch = b.channels ?? ['push'];
  if (!Array.isArray(ch) || !ch.every((c) => isOneOf(CHANNEL, c))) return `channels must be a list of: ${CHANNEL.join(', ')}.`;
  const channels = CHANNEL.filter((c) => ch.includes(c));
  if (channels.length === 0 && (remind_start || remind_on)) return 'channels: choose at least one for a thing with a reminder.';
  if (b.status !== undefined && !isOneOf(THING_STATUS, b.status)) return `status must be one of: ${THING_STATUS.join(', ')}.`;
  return {
    title, note, place, address, phone, cost, url: link, window_start, window_end, remind_start, remind_on, channels,
    ...(b.status !== undefined ? { status: b.status as ThingStatus } : {}),
  };
}

/** The wire shape (§10). `plannedDate` is the planned event's start date, looked up by the caller. */
export function thingFromRow(r: ThingRow, plannedDate: string | null): Thing {
  let listed: unknown = [];
  try { listed = JSON.parse(r.channels); } catch { listed = []; }
  return {
    id: r.id, title: r.title, note: r.note, place: r.place, address: r.address, phone: r.phone, cost: r.cost, url: r.url,
    windowStart: r.window_start, windowEnd: r.window_end, remindStart: r.remind_start === 1, remindOn: r.remind_on,
    channels: CHANNEL.filter((c) => Array.isArray(listed) && listed.includes(c)),
    hasPhoto: r.photo_key !== null, status: r.status, plannedEventId: r.planned_event_id, plannedDate,
    createdBy: r.created_by, updatedAt: r.updated_at,
  };
}

// ---- §7C.2 reminders ----

/** What reminder planning reads from a thing. */
export type ThingReminderSource = Pick<ThingRow, 'id' | 'status' | 'window_start' | 'remind_start' | 'remind_on'>;

/** Is `date` the thing's "when it starts" reminder? */
export const isStartReminder = (t: Pick<ThingRow, 'window_start' | 'remind_start'>, date: string | null): boolean =>
  t.remind_start === 1 && t.window_start !== null && t.window_start === date;

/** The thing's reminder dates, one per date (a picked date equal to the start date is the start reminder). */
export function remindersFor(t: ThingReminderSource): { date: string; start: boolean }[] {
  const out: { date: string; start: boolean }[] = [];
  if (t.remind_start === 1 && t.window_start) out.push({ date: t.window_start, start: true });
  if (t.remind_on && !out.some((r) => r.date === t.remind_on)) out.push({ date: t.remind_on, start: false });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Thing reminder fires whose due time falls in [fromUtc, toUtc). Only ideas have reminders. Idempotent. */
export function planThingFires(t: ThingReminderSource, tz: string, fromUtc: string, toUtc: string): NewFire[] {
  if (t.status !== 'idea') return [];
  const out: NewFire[] = [];
  for (const r of remindersFor(t)) {
    const due = localToUtc(r.date, THING_REMIND_TIME, tz);
    if (ms(due) >= ms(fromUtc) && ms(due) < ms(toUtc)) out.push(newThingFire(t.id, r.date, due));
  }
  return out;
}

// ---- §7C.2 Plan it ----

/** May the thing be planned on `date`? A real date, inside the window when there is one. ⚑ */
export function canPlanOn(t: Pick<ThingRow, 'window_start' | 'window_end'>, date: unknown): date is string {
  return isDate(date) && (!t.window_start || date >= t.window_start) && (!t.window_end || date <= t.window_end);
}

/** The planned event's notes: note, then place, address, phone, cost, link (one per line); the note is cut so the rest fits. */
export function plannedEventNotes(t: Pick<ThingRow, 'note' | 'place' | 'address' | 'phone' | 'cost' | 'url'>, max = NOTE_MAX): string | null {
  const tail = [t.place, t.address, t.phone, t.cost, t.url].filter((x): x is string => !!x).join('\n');
  const room = max - (tail ? tail.length + 1 : 0);
  const note = t.note ? t.note.slice(0, Math.max(0, room)).trim() : '';
  return [note, tail].filter(Boolean).join('\n') || null;
}

/** Open things (idea, planned): soonest window end first; open-ended and any-time last; then by title. */
export function openOrder<T extends Pick<Thing, 'windowEnd' | 'title'>>(things: readonly T[]): T[] {
  return [...things].sort((a, b) =>
    a.windowEnd === b.windowEnd ? a.title.localeCompare(b.title)
      : a.windowEnd === null ? 1 : b.windowEnd === null ? -1 : a.windowEnd.localeCompare(b.windowEnd));
}

// ---- §7C.4 a photo reading is input, never trusted ----

const cleanText = (v: unknown, max: number): string | null =>
  typeof v === 'string' ? v.trim().slice(0, max).trim() || null : null;

/**
 * The model's answer → fields the form may fill: trimmed to the limits, unreal dates dropped, a reversed
 * start/end swapped, the link through webLink (bare www… gets https://, other schemes dropped), empty → null. `today` is in the §7C.2 signature;
 * no written rule reads it yet.
 */
export function cleanPhotoReading(raw: Partial<Record<keyof PhotoReading, unknown>> | null | undefined, _today: string): PhotoReading {
  const r = raw ?? {};
  let startDate = isDate(r.startDate) ? r.startDate : null;
  let endDate = isDate(r.endDate) ? r.endDate : null;
  if (startDate && endDate && endDate < startDate) [startDate, endDate] = [endDate, startDate];
  const url = cleanText(r.url, URL_MAX);
  return {
    title: cleanText(r.title, TITLE_MAX), startDate, endDate, place: cleanText(r.place, PLACE_MAX),
    address: cleanText(r.address, ADDRESS_MAX), phone: cleanText(r.phone, PHONE_MAX), cost: cleanText(r.cost, COST_MAX),
    url: url ? webLink(url) : null, note: cleanText(r.note, NOTE_MAX),
  };
}
