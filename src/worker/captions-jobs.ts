// SPEC §7E.2c, §4.2s — the captions-from-home job on a recipe row: queue, the conditional claim (with stale reclaim
// and attempts), ending a job, and giving up. Every write of the captions_job columns is here; recipe-reread.ts's
// success UPDATE uses END_CAPTIONS_JOB. No Hono; never decides whether to queue (wantsHomeCaptions, the route).
import type { CaptionsJob } from '../shared/vocab';
import {
  CAPTIONS_CLAIM_STALE_MIN, CAPTIONS_JOB_ATTEMPTS, CAPTIONS_JOB_GIVE_UP_MIN, HOME_CAPTIONS_GAVE_UP,
} from '../shared/recipe-reading';
import { all, run } from './db';

/** The SET clause that ends a job: done and failed are not stored (§4.2s). */
export const END_CAPTIONS_JOB = 'captions_job = NULL, captions_queued_at = NULL, captions_claimed_at = NULL, captions_attempts = 0';

const minutesBefore = (now: string, min: number) => new Date(Date.parse(now) - min * 60_000).toISOString();

/** Queue a job on a live recipe (from-video, after its INSERT). */
export function queueCaptionsJob(db: D1Database, id: string, now: string) {
  return run(db,
    `UPDATE recipes SET captions_job = 'queued', captions_queued_at = ?, captions_claimed_at = NULL, captions_attempts = 0
     WHERE id = ? AND deleted_at IS NULL`, now, id);
}

/** End a job; `captionsError` given → captions_error is set to it, undefined → captions_error untouched. */
export function endCaptionsJobStatement(db: D1Database, id: string, captionsError: string | undefined): D1PreparedStatement {
  return captionsError === undefined
    ? db.prepare(`UPDATE recipes SET ${END_CAPTIONS_JOB} WHERE id = ?`).bind(id)
    : db.prepare(`UPDATE recipes SET ${END_CAPTIONS_JOB}, captions_error = ? WHERE id = ?`).bind(captionsError, id);
}

/** Give up the jobs the home PC never answered: queued over CAPTIONS_JOB_GIVE_UP_MIN, or a stale claim whose
 *  attempts are used up or whose job was queued over that long ago (§7E.2c ⚑ Q96). → how many. */
export async function giveUpCaptionsJobs(db: D1Database, now: string): Promise<number> {
  const old = minutesBefore(now, CAPTIONS_JOB_GIVE_UP_MIN), stale = minutesBefore(now, CAPTIONS_CLAIM_STALE_MIN);
  const res = await run(db,
    `UPDATE recipes SET ${END_CAPTIONS_JOB}, captions_error = ?
     WHERE (captions_job = 'queued' AND captions_queued_at <= ?)
        OR (captions_job = 'claimed' AND captions_claimed_at <= ? AND (captions_attempts >= ? OR captions_queued_at <= ?))`,
    HOME_CAPTIONS_GAVE_UP, old, stale, CAPTIONS_JOB_ATTEMPTS, old);
  return res.meta.changes ?? 0;
}

interface Candidate { id: string; video_id: string; captions_job: CaptionsJob; captions_claimed_at: string | null }

/** Claim the oldest job — queued, or a stale claim with attempts left — after giving up the exhausted ones. Each
 *  claim is a conditional per-row UPDATE (job and claim time as read), so two claims never get the same job. */
export async function claimNextCaptionsJob(db: D1Database, now: string): Promise<{ recipeId: string; videoId: string } | null> {
  await giveUpCaptionsJobs(db, now);
  const candidates = await all<Candidate>(db,
    `SELECT id, video_id, captions_job, captions_claimed_at FROM recipes
     WHERE captions_job IS NOT NULL AND deleted_at IS NULL AND video_id IS NOT NULL
       AND (captions_job = 'queued' OR (captions_job = 'claimed' AND captions_claimed_at <= ? AND captions_attempts < ?))
     ORDER BY captions_queued_at, id LIMIT 5`,
    minutesBefore(now, CAPTIONS_CLAIM_STALE_MIN), CAPTIONS_JOB_ATTEMPTS);
  for (const c of candidates) {
    const res = await run(db,
      `UPDATE recipes SET captions_job = 'claimed', captions_claimed_at = ?, captions_attempts = captions_attempts + 1
       WHERE id = ? AND deleted_at IS NULL AND captions_job = ? AND captions_claimed_at IS ?`,
      now, c.id, c.captions_job, c.captions_claimed_at);
    if (res.meta.changes === 1) return { recipeId: c.id, videoId: c.video_id };
  }
  return null;
}
