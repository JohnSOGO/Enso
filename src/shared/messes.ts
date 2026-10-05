// SPEC §7B.7 — whose mess? A mess someone cleaned up: who is asked, when they are asked again, when it goes to To
// talk about, who owes whom, the push texts and the wire type. Pure; imports only vocab and time.
import type { MessSettle, MessStatus } from './vocab';
import { addMinutes } from './time';

export const NUDGES_MAX = 4;
export const NUDGE_EVERY_MIN = 15;
export const DISCUSS_AFTER_H = 24;
export const MESS_NOTE_MAX = 120;
export const MESS_PHOTO_KEEP_DAYS = 30;
export const MESS_ASK_TITLE = '🧽 Whose mess?';
export const MESS_DISCUSS_TITLE = '🗣 To talk about';

/** A `messes` row (§4.2ze). */
export interface MessRow {
  id: string; reported_by: string; chore_id: string | null; note: string | null; photo_key: string | null;
  claimed_by: string | null; claimed_at: string | null; assigned_by: string | null; discuss_at: string | null;
  closed_at: string | null; closed_by: string | null; settled_at: string | null; settled_how: MessSettle | null;
  settled_by: string | null; deleted_at: string | null; created_at: string;
}

/** A mess as the API sends it. The photo key is never on the wire. */
export interface Mess {
  id: string; reportedBy: string; choreId: string | null; choreTitle: string | null; note: string | null;
  hasPhoto: boolean; createdAt: string; status: MessStatus; claimedBy: string | null; assignedBy: string | null;
  deniedBy: string[]; asked: string[];
}

/** `from` owes `to` this many points. */
export interface Balance { from: string; to: string; points: number }

/** The state, derived from the row: the first that holds of settled, closed, owed, discuss, open. */
export function messStatus(m: Pick<MessRow, 'settled_at' | 'closed_at' | 'claimed_by' | 'discuss_at'>): MessStatus {
  if (m.settled_at) return 'settled';
  if (m.closed_at) return 'closed';
  if (m.claimed_by) return 'owed';
  if (m.discuss_at) return 'discuss';
  return 'open';
}

/** Report fields → `{ note, choreId }`, or a message naming the field. */
export function parseMessInput(b: { note?: unknown; choreId?: unknown }): { note: string | null; choreId: string | null } | string {
  if (b.note != null && typeof b.note !== 'string') return 'note must be text.';
  const note = typeof b.note === 'string' ? b.note.trim() : '';
  if (note.length > MESS_NOTE_MAX) return `note can be at most ${MESS_NOTE_MAX} characters.`;
  if (b.choreId != null && typeof b.choreId !== 'string') return 'choreId must be text.';
  return { note: note || null, choreId: (b.choreId as string | null | undefined) || null };
}

/** Who still has to answer: while open or on To talk about, the active members but the reporter who haven't said Not me. */
export function askedOf(m: Parameters<typeof messStatus>[0] & Pick<MessRow, 'reported_by'>, activeIds: readonly string[], deniedIds: readonly string[]): string[] {
  const s = messStatus(m);
  if (s !== 'open' && s !== 'discuss') return [];
  return activeIds.filter((id) => id !== m.reported_by && !deniedIds.includes(id));
}

/** Whether a member who has had `sent` asks is due the next one. */
export const nudgeDue = (createdAt: string, sent: number, now: string): boolean =>
  sent < NUDGES_MAX && now >= addMinutes(createdAt, sent * NUDGE_EVERY_MIN);

/** Whether an open mess goes to To talk about: nobody left to ask, or DISCUSS_AFTER_H since the report. */
export const discussDue = (createdAt: string, asked: readonly string[], now: string): boolean =>
  asked.length === 0 || now >= addMinutes(createdAt, DISCUSS_AFTER_H * 60);

/** The points owed, netted per pair; a member sees their own pairs, an admin every pair. */
export function balancesOf(owed: readonly Pick<MessRow, 'reported_by' | 'claimed_by'>[], viewerId: string, isAdmin: boolean): Balance[] {
  const net = new Map<string, number>(); // "a|b" with a < b → points b owes a (negative: a owes b)
  for (const m of owed) {
    if (!m.claimed_by || m.claimed_by === m.reported_by) continue;
    const [a, b] = [m.reported_by, m.claimed_by].sort();
    const key = `${a}|${b}`;
    net.set(key, (net.get(key) ?? 0) + (m.reported_by === a ? 1 : -1));
  }
  const out: Balance[] = [];
  for (const [key, n] of net) {
    const [a, b] = key.split('|');
    if (n === 0 || (!isAdmin && viewerId !== a && viewerId !== b)) continue;
    out.push(n > 0 ? { from: b, to: a, points: n } : { from: a, to: b, points: -n });
  }
  return out.sort((x, y) => y.points - x.points || x.from.localeCompare(y.from) || x.to.localeCompare(y.to));
}

const where = (choreTitle: string | null, note: string | null) => `${choreTitle ? ` (${choreTitle})` : ''}${note ? `: ${note}` : ''}`;

/** The ask's push text. */
export const askMessage = (reporter: string, choreTitle: string | null, note: string | null) =>
  `${reporter} cleaned up a mess${where(choreTitle, note)}. Was it yours? Open Ensō to answer.`;

/** The admins' push when a mess goes to To talk about. */
export const discussMessage = (reporter: string, choreTitle: string | null, note: string | null) =>
  `Nobody has claimed the mess ${reporter} cleaned up${where(choreTitle, note)}. It's on To talk about.`;
