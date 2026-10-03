// SPEC §7C — things to do (pure): limits, validation, reminders, Plan it, cleaning a photo
// reading. `now`, `today` and `tz` are always parameters. Imports engine, never the reverse.
import type { Channel, ThingStatus } from './vocab';

export const TITLE_MAX = 120;
export const NOTE_MAX = 2000;
export const PLACE_MAX = 200;
export const URL_MAX = 500;

/** Photos (§7C.3): the server's limits and the phone's shrink settings. */
export const PHOTO_MAX_BYTES = 4 * 1024 * 1024;
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const;
export const PHOTO_LONG_SIDE = 1600;
export const PHOTO_QUALITY = 0.85;

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
  url: string | null;
  note: string | null;
}
