// SPEC §7E.2b, §7E.2c — re-reading a video recipe in place, after the caller's own checks (recipe, video, text,
// daily cap, keys): re-fetch the video and the creator's comments side by side, count the read when asked,
// Claude via recipe-reader.ts, cleanRecipeReading, found false → nothing changes, else the one UPDATE. Returns an
// outcome kind and a reason; the caller maps them to HTTP. No Hono here.
import type { RecipeRow } from '../shared/recipes';
import { COMMENTS_LOOKED_AT, cleanRecipeReading, creatorComments, sourcesOf, type VideoText } from '../shared/recipe-reading';
import { nowIso, run } from './db';
import { lookUpComments, lookUpVideo } from './youtube';
import { readRecipe } from './recipe-reader';

export type RereadOutcome =
  | { ok: true }
  | { ok: false; kind: 'video_unavailable' | 'youtube_failed' | 'recipe_refused' | 'recipe_reading_failed' | 'no_recipe'; reason: string };

/** Re-read `row` (a recipe with a video_id) from the text given. `countFor`: the member the read is counted
 *  against in recipe_reads, or null to not count it. Claude's captions slot gets `given.transcript`, else the
 *  pasted text. */
export async function rereadRecipe(db: D1Database, keys: { yt: string; ai: string }, row: RecipeRow,
  given: Pick<VideoText, 'transcript' | 'pasted' | 'screenshots'>, countFor: string | null, now: string): Promise<RereadOutcome> {
  const videoId = row.video_id!;
  const [video, comments] = await Promise.all([lookUpVideo(videoId, keys.yt), lookUpComments(videoId, keys.yt, COMMENTS_LOOKED_AT)]);
  if (!video.ok && video.kind === 'not_found') return { ok: false, kind: 'video_unavailable', reason: video.reason };
  if (!video.ok) return { ok: false, kind: 'youtube_failed', reason: video.reason };
  if (countFor !== null) await run(db, 'INSERT INTO recipe_reads (at, member_id) VALUES (?, ?)', now, countFor);

  const read: VideoText = {
    description: video.description, ...given,
    comments: comments.ok ? creatorComments(comments.comments, video.channelId) : null,
  };
  const res = await readRecipe({
    apiKey: keys.ai, title: video.title, channel: video.channel, ...read, transcript: given.transcript ?? given.pasted ?? null,
  });
  if (!res.ok && res.kind === 'refused') return { ok: false, kind: 'recipe_refused', reason: res.reason };
  if (!res.ok) return { ok: false, kind: 'recipe_reading_failed', reason: res.reason };
  const reading = cleanRecipeReading(res.raw, video.title);
  if (!reading.found) return { ok: false, kind: 'no_recipe', reason: 'No recipe in that transcript.' };
  await run(db,
    `UPDATE recipes SET title = ?, ingredients = ?, steps = ?, servings = ?, time_text = ?, found = 1, source = ?,
       captions_error = NULL, comments_error = ?, updated_at = ? WHERE id = ?`,
    reading.title, JSON.stringify(reading.ingredients), JSON.stringify(reading.steps), reading.servings, reading.time,
    JSON.stringify(sourcesOf(read)), comments.ok || comments.kind === 'none' ? null : comments.reason, nowIso(), row.id);
  return { ok: true };
}
