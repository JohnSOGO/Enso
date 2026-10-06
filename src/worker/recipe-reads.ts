// SPEC §7E.2, §7E.2c, §7E.6 — reading a new recipe, after the route's own checks (link, duplicate, daily cap, keys),
// and the recipe-read budget (recipe_reads, in the household's day, against RECIPE_READS_PER_DAY). A video: YouTube,
// then the captions (SogoAI asked in-line when YouTube blocked the Worker, §7E.2c) beside the creator's comments,
// count, Claude via recipe-reader.ts, cleaned. A page: count, recipe-link-reader.ts, cleaned. Each failure is an
// outcome kind + reason; the caller maps them to HTTP and saves the recipes row. No Hono here.
import type { Env } from './env';
import {
  COMMENTS_LOOKED_AT, HOME_CAPTIONS_OFF, RECIPE_READS_PER_DAY, cleanRecipeReading, commentsError, creatorComments,
  hasRecipeText, homeCaptionsError, sourcesOf, wantsHomeCaptions, type RecipeReading,
} from '../shared/recipe-reading';
import type { RecipeSource } from '../shared/vocab';
import { addDays, localToUtc, utcToLocal } from '../shared/time';
import { first, householdTz, run } from './db';
import { lookUpComments, lookUpVideo, type VideoLookup } from './youtube';
import type { ClaudeFailure } from './claude';
import { readCaptions } from './youtube-captions';
import { readRecipe } from './recipe-reader';
import { readRecipeLink } from './recipe-link-reader';
import { homeCaptionsConfigOf, readCaptionsFromHome } from './home-captions';

/** The daily cap (§7E.2 step 4, §7E.2b step 5): today's recipe reads, in the household's day, are used up. */
export async function recipeReadsUsedUp(db: D1Database, now: string): Promise<boolean> {
  const tz = await householdTz(db), today = utcToLocal(now, tz).date;
  const reads = await first<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM recipe_reads WHERE at >= ? AND at < ?',
    localToUtc(today, '00:00', tz), localToUtc(addDays(today, 1), '00:00', tz));
  return (reads?.n ?? 0) >= RECIPE_READS_PER_DAY;
}

/** Count one read against the daily cap — the one INSERT INTO recipe_reads. */
export const countRecipeRead = (db: D1Database, now: string, memberId: string) =>
  run(db, 'INSERT INTO recipe_reads (at, member_id) VALUES (?, ?)', now, memberId);

/** Why the captions and the creator's comments couldn't be read (NULL when they were, or weren't tried). */
export interface ReadErrors { captions: string | null; comments: string | null }

/** Every way a read or re-read fails; the route maps each kind to HTTP. */
export type RecipeReadFailure = {
  ok: false; kind: 'video_unavailable' | 'youtube_failed' | 'recipe_refused' | 'recipe_reading_failed' | 'no_recipe'; reason: string;
};

/** YouTube had no such video → video_unavailable; any other YouTube failure → youtube_failed. */
export const videoFailure = (v: Extract<VideoLookup, { ok: false }>): RecipeReadFailure =>
  ({ ok: false, kind: v.kind === 'not_found' ? 'video_unavailable' : 'youtube_failed', reason: v.reason });

/** Claude refused → recipe_refused; any other Claude failure → recipe_reading_failed. */
export const claudeFailure = (r: ClaudeFailure): RecipeReadFailure =>
  ({ ok: false, kind: r.kind === 'refused' ? 'recipe_refused' : 'recipe_reading_failed', reason: r.reason });

export type VideoRead =
  | { ok: true; reading: RecipeReading; video: { id: string; title: string | null; channel: string | null }; source: RecipeSource[]; errors: ReadErrors }
  | RecipeReadFailure;

export type PageRead = { ok: true; reading: RecipeReading; source: RecipeSource[] } | RecipeReadFailure;

/** §7E.2 step 7 with §7E.2c: the Worker's own attempt; when YouTube blocked it, SogoAI asked in-line. → the
 *  captions' text, or why there is none (a home failure as "from home: …"). Never throws. */
async function captionsFor(videoId: string, env: Env): Promise<{ text: string } | { error: string }> {
  const own = await readCaptions(videoId);
  if (own.ok) return { text: own.text };
  if (!wantsHomeCaptions(own)) return { error: own.reason };
  const cfg = homeCaptionsConfigOf(env);
  if (!cfg) return { error: homeCaptionsError(HOME_CAPTIONS_OFF) };
  const home = await readCaptionsFromHome(cfg, videoId);
  return home.ok ? { text: home.text } : { error: homeCaptionsError(home.reason) };
}

/** §7E.2 from step 6: YouTube → captions + the creator's comments → count → Claude → clean. */
export async function readVideoRecipe(db: D1Database, env: Env, keys: { yt: string; ai: string }, videoId: string,
  memberId: string, now: string): Promise<VideoRead> {
  const video = await lookUpVideo(videoId, keys.yt);
  if (!video.ok) return videoFailure(video);
  // Steps 7 (with SogoAI when blocked, §7E.2c) and 8 side by side; neither is ever fatal.
  const [captions, comments] = await Promise.all([captionsFor(videoId, env), lookUpComments(videoId, keys.yt, COMMENTS_LOOKED_AT)]);
  await countRecipeRead(db, now, memberId);

  const text = {
    description: video.description, transcript: 'text' in captions ? captions.text : null,
    comments: comments.ok ? creatorComments(comments.comments, video.channelId) : null,
  };
  const errors: ReadErrors = {
    captions: 'error' in captions ? captions.error : null,
    comments: commentsError(comments), // turned off is not an error ⚑ Q78
  };
  let raw: Record<string, unknown> | null = null;
  if (hasRecipeText(text)) {
    const r = await readRecipe({ apiKey: keys.ai, title: video.title, channel: video.channel, ...text });
    if (!r.ok) return claudeFailure(r);
    raw = r.raw;
  }
  return {
    ok: true, reading: cleanRecipeReading(raw, video.title),
    video: { id: videoId, title: video.title, channel: video.channel }, source: sourcesOf(text), errors,
  };
}

/** §7E.6 from the count: recipe-link-reader.ts → clean. */
export async function readPageRecipe(db: D1Database, aiKey: string, link: string, site: string,
  memberId: string, now: string): Promise<PageRead> {
  await countRecipeRead(db, now, memberId);
  const r = await readRecipeLink({ apiKey: aiKey, link, site });
  if (!r.ok) return claudeFailure(r);
  return {
    ok: true, reading: cleanRecipeReading(r.raw, r.title),
    source: sourcesOf({ description: null, transcript: null, comments: null, page: r.notes }),
  };
}
