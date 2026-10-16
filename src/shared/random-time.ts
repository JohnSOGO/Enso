// SPEC §8.4, §5.1 — an event reminder's Random time: the window check both the API and the form ask, and the pick.
// Pure: the pick is a hash of its key (event id + occurrence date), never Math.random, so planning twice agrees (R12).
import { isTime } from './time';

/** Why this Random time window can't be saved, or null. Both or neither; real HH:MM; from before to (no overnight). */
export function randomWindowError(from: unknown, to: unknown): string | null {
  if ((from === null || from === undefined) && (to === null || to === undefined)) return null;
  if (!isTime(from) || !isTime(to)) return 'Random time needs a From and a To time (HH:MM).';
  return from < to ? null : 'Random time: From must be before To.';
}

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** FNV-1a, 32-bit. */
function hash(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

/** A time in [from, to), the same every time for the same key. */
export function randomTimeIn(key: string, from: string, to: string): string {
  const m = minutes(from) + (hash(key) % (minutes(to) - minutes(from)));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
