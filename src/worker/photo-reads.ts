// SPEC §7C.4, §7A.3 — the household's daily photo-read budget: today in the household zone, whether today's
// READS_PER_DAY reads (counted in photo_reads) are used up, and recording one read. The route decides the check
// order and the message; this only counts and records. No Hono.
import { READS_PER_DAY } from '../shared/things';
import { addDays, localToUtc, utcToLocal } from '../shared/time';
import { first, householdTz, run } from './db';

/** The household zone and today's date in it, at `now`. */
export async function householdToday(db: D1Database, now: string): Promise<{ tz: string; today: string }> {
  const tz = await householdTz(db);
  return { tz, today: utcToLocal(now, tz).date };
}

/** True when the household has already read READS_PER_DAY photos today (local midnight to midnight). */
export async function photoReadsUsedUp(db: D1Database, today: string, tz: string): Promise<boolean> {
  const reads = await first<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM photo_reads WHERE at >= ? AND at < ?',
    localToUtc(today, '00:00', tz), localToUtc(addDays(today, 1), '00:00', tz));
  return (reads?.n ?? 0) >= READS_PER_DAY;
}

/** Counts one read against today's budget. */
export async function recordPhotoRead(db: D1Database, at: string, memberId: string): Promise<void> {
  await run(db, 'INSERT INTO photo_reads (at, member_id) VALUES (?, ?)', at, memberId);
}
