// SPEC §7B.8 — bounties and the score: the limits, parsing, a one-off's derived state, who may take it or say Done,
// when a chore run earns or drops, an admin's own earning OK'd at once, the score windows, the push texts and the
// wire types. Pure; imports only vocab and time.
import type { BountyStatus } from './vocab';
import { addMinutes, localToUtc, startOfWeek, utcToLocal } from './time';

export const POINTS_MIN = 1;
export const POINTS_MAX = 10; // ⚑ Q249
export const BOUNTY_TITLE_MAX = 60;
export const BOUNTY_NOTE_MAX = 120;
export const TAKE_HOURS = 3; // ⚑ Q251
export const NEW_BOUNTY_TITLE = '🪙 New bounty';
export const WAITING_TITLE = '🪙 Waiting for OK';

/** A `bounties` row (§4.2zq). */
export interface BountyRow {
  id: string; title: string; note: string | null; points: number; created_by: string;
  taken_by: string | null; taken_at: string | null; deleted_at: string | null; created_at: string; photo_key: string | null;
}

/** An `earnings` row (§4.2zq). */
export interface EarningRow {
  id: string; bounty_id: string | null; chore_run_id: string | null; member_id: string; points: number;
  done_at: string; ok_by: string | null; ok_at: string | null; dropped_at: string | null; photo_key: string | null;
}

/** A one-off as the API sends it. */
export interface Bounty {
  id: string; title: string; note: string | null; points: number; createdBy: string; createdAt: string;
  status: BountyStatus; takenBy: string | null; doneBy: string | null; earningId: string | null; hasPhoto: boolean;
}

/** A pending earning, for the Waiting for OK list. */
export interface Earning { id: string; kind: 'chore' | 'bounty'; title: string; points: number; memberId: string; doneAt: string; hasPhoto: boolean }

/** Points OK'd this week and this month. */
export interface Score { memberId: string; week: number; month: number }

/** Whether a dib taken at `takenAt` still holds at `now`. */
export const dibHolds = (takenAt: string | null, now: string): boolean =>
  takenAt !== null && now < addMinutes(takenAt, TAKE_HOURS * 60);

/** The state, derived: paid, pending, taken (a dib still holding), open. `earning` = its live one, if any. */
export function bountyStatus(b: Pick<BountyRow, 'taken_by' | 'taken_at'>, earning: Pick<EarningRow, 'ok_at'> | null, now: string): BountyStatus {
  if (earning) return earning.ok_at ? 'paid' : 'pending';
  return b.taken_by && dibHolds(b.taken_at, now) ? 'taken' : 'open';
}

/** Points → an integer 1–10, or a message. */
export function parsePoints(v: unknown): number | string {
  return typeof v === 'number' && Number.isInteger(v) && v >= POINTS_MIN && v <= POINTS_MAX
    ? v : `points must be a whole number from ${POINTS_MIN} to ${POINTS_MAX}.`;
}

/** A new one-off's fields, trimmed, or a message naming the field. */
export function parseBountyInput(b: { title?: unknown; note?: unknown; points?: unknown }): { title: string; note: string | null; points: number } | string {
  const title = typeof b.title === 'string' ? b.title.trim() : '';
  if (!title || title.length > BOUNTY_TITLE_MAX) return `title must be 1–${BOUNTY_TITLE_MAX} characters.`;
  if (b.note != null && typeof b.note !== 'string') return 'note must be text.';
  const note = typeof b.note === 'string' ? b.note.trim() : '';
  if (note.length > BOUNTY_NOTE_MAX) return `note can be at most ${BOUNTY_NOTE_MAX} characters.`;
  const points = parsePoints(b.points);
  if (typeof points === 'string') return points;
  return { title, note: note || null, points };
}

const stateError = (status: BountyStatus, takerName: string): string | null =>
  status === 'paid' ? 'That bounty is already paid.' : status === 'pending' ? 'That bounty is waiting for OK.'
    : status === 'taken' ? `${takerName} is on it.` : null;

/** Why I'll do it is refused, or null. `myOtherDib` = the title of another one-off I hold a live dib on. */
export function takeError(status: BountyStatus, takenBy: string | null, me: string, takerName: string, myOtherDib: string | null): string | null {
  if (status === 'taken' && takenBy === me) return null;
  const e = stateError(status, takerName);
  if (e) return e;
  return myOtherDib ? `You're already on ${myOtherDib}. Finish it or let it go first.` : null;
}

/** Why Done is refused, or null. No dib is needed. */
export function doneError(status: BountyStatus, takenBy: string | null, me: string, takerName: string): string | null {
  return status === 'taken' && takenBy === me ? null : stateError(status, takerName);
}

/** A run change → earn (just finished), drop (a finished run undone), or nothing. */
export function runEarningChange(before: { done_at: string | null }, after: { done_at: string | null }): 'earn' | 'drop' | null {
  if (!before.done_at && after.done_at) return 'earn';
  if (before.done_at && !after.done_at) return 'drop';
  return null;
}

/** An admin's own earning is OK'd by them at once (⚑ Q252). */
export const okAtOnce = (finisher: { id: string; admin: boolean }, now: string): { ok_by: string; ok_at: string } | null =>
  finisher.admin ? { ok_by: finisher.id, ok_at: now } : null;

/** The 1st of the month and this week's Sunday, as local dates. */
function windows(today: string) {
  return { week: startOfWeek(today), month: `${today.slice(0, 8)}01` };
}

/** The UTC start of the earlier window, so one read covers both (a week can span two months). */
export function scoreSince(today: string, tz: string): string {
  const w = windows(today);
  return localToUtc(w.week < w.month ? w.week : w.month, '00:00', tz);
}

/** Every active member's OK'd points this week (Sunday-start) and this month, by the local day the work was done. */
export function scoresOf(earnings: readonly Pick<EarningRow, 'member_id' | 'points' | 'done_at' | 'ok_at' | 'dropped_at'>[],
  activeIds: readonly string[], today: string, tz: string): Score[] {
  const w = windows(today);
  const out = new Map(activeIds.map((id) => [id, { memberId: id, week: 0, month: 0 }]));
  for (const e of earnings) {
    const s = out.get(e.member_id);
    if (!s || !e.ok_at || e.dropped_at) continue;
    const day = utcToLocal(e.done_at, tz).date;
    if (day > today) continue;
    if (day >= w.week) s.week += e.points;
    if (day >= w.month) s.month += e.points;
  }
  return [...out.values()];
}

/** The push to everyone but the poster. */
export const newBountyMessage = (title: string, points: number) => `${title} · ${points} points. Open Ensō → Chores → Bounties.`;

/** The push to the admins when an earning waits. */
export const waitingMessage = (name: string, title: string, points: number) => `${name} says done: ${title} · ${points} points. OK it in Chores → Bounties.`;
