// SPEC §9.2b — quiet the house: how long, when it ends, and whether it is on now. Pure; `now` is passed in.
import { HOUSE_QUIET_FOR, isOneOf, type HouseQuietFor } from './vocab';
import { addDays, addMinutes, localToUtc, utcToLocal } from './time';

const HOURS: Record<Exclude<HouseQuietFor, 'today'>, number> = { '1h': 1, '2h': 2, '4h': 4 };

/** The UTC instant quiet ends: now + 1 / 2 / 4 h, or `today` → the next household-local midnight (⚑ Q210). */
export function quietEnd(choice: HouseQuietFor, tz: string, now: string): string {
  if (choice !== 'today') return addMinutes(now, HOURS[choice] * 60);
  return localToUtc(addDays(utcToLocal(now, tz).date, 1), '00:00', tz);
}

/** `until` while it is still ahead, else null — quiet ends on its own. */
export const quietState = (until: string | null, now: string): string | null =>
  until !== null && Date.parse(until) > Date.parse(now) ? until : null;

export const quietError = (v: unknown): string | null =>
  isOneOf(HOUSE_QUIET_FOR, v) ? null : 'Choose how long: 1h, 2h, 4h or today.';
