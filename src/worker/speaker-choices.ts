// SPEC §9.2a — the members' chosen house speakers, read for the two writers of house rows (tick step 2,
// POST /announce) and for GET /me and GET /house/speakers. D1 reads only: no Hono, never writes, never speaks.
import { speakersError, speakersFor } from '../shared/speakers';
import { all, parseJson } from './db';

/** The stored member_prefs.house_speakers → the choice; NULL, or a value speakersError refuses → null (not chosen). */
export function choiceOf(text: string | null): string[] | null {
  const v = parseJson<unknown>(text, null);
  return v !== null && speakersError(v) === null ? (v as string[]) : null;
}

/** Each of these members' choices, in the order given (a member with no prefs row → null). */
export async function speakerChoices(db: D1Database, memberIds: readonly string[]): Promise<(string[] | null)[]> {
  if (!memberIds.length) return [];
  const rows = await all<{ member_id: string; house_speakers: string | null }>(db,
    `SELECT member_id, house_speakers FROM member_prefs WHERE member_id IN (${memberIds.map(() => '?').join(',')})`, ...memberIds);
  return memberIds.map((id) => choiceOf(rows.find((r) => r.member_id === id)?.house_speakers ?? null));
}

/** The speakers a house delivery for these members is spoken on: null = the default speakers, [] = none. */
export async function deliverySpeakers(db: D1Database, memberIds: readonly string[]): Promise<string[] | null> {
  return speakersFor(await speakerChoices(db, memberIds));
}
