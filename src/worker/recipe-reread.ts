// SPEC §7E.2b — re-reading a recipe in place (keeping its first screenshot as its picture, ⚑ Q174), after the caller's own checks (recipe, video or link,
// text, daily cap, keys): for a video, re-fetch it and the creator's comments side by side (a link: nothing, ⚑ Q169); count the read,
// Claude via recipe-reader.ts, cleanRecipeReading, found false → nothing changes, else the one UPDATE. Returns an
// outcome kind and a reason; the caller maps them to HTTP. No Hono here.
import type { RecipeRow } from '../shared/recipes';
import { COMMENTS_LOOKED_AT, cleanRecipeReading, creatorComments, sourcesOf, type RecipeReading, type Screenshot, type VideoText } from '../shared/recipe-reading';
import type { RecipeSource } from '../shared/vocab';
import { nowIso, run } from './db';
import { lookUpComments, lookUpVideo } from './youtube';
import { readRecipe } from './recipe-reader';
import { countRecipeRead } from './recipe-reads';
import { replacePhoto } from './photo-store';

export type RereadOutcome =
  | { ok: true }
  | { ok: false; kind: 'video_unavailable' | 'youtube_failed' | 'recipe_refused' | 'recipe_reading_failed' | 'no_recipe'; reason: string };

/** Re-read `row` (any recipe: a video's, a link's or a typed one) from the transcript given. `countFor`: the member the read is
 *  counted against in recipe_reads. Claude's captions slot gets the pasted text. */
export async function rereadRecipe(db: D1Database, keys: { yt: string; ai: string }, row: RecipeRow,
  given: Pick<VideoText, 'pasted' | 'screenshots'>, countFor: string, now: string, photos: R2Bucket): Promise<RereadOutcome> {
  const out = row.video_id ? await rereadVideo(db, keys, row, given, countFor, now) : await rereadLink(db, keys.ai, row, given, countFor, now);
  if (out.ok && given.screenshots?.length) await keepPicture(db, photos, row, given.screenshots[0]);
  return out;
}

/** ⚑ Q174 — the first screenshot of a successful read becomes the recipe's picture; the one it replaces is deleted. */
async function keepPicture(db: D1Database, photos: R2Bucket, row: RecipeRow, shot: Screenshot) {
  await replacePhoto(photos, 'recipes', row.id, Uint8Array.from(atob(shot.data), (ch) => ch.charCodeAt(0)), shot.type, row.photo_key,
    (key) => run(db, 'UPDATE recipes SET photo_key = ? WHERE id = ?', key, row.id));
}

async function rereadVideo(db: D1Database, keys: { yt: string; ai: string }, row: RecipeRow,
  given: Pick<VideoText, 'pasted' | 'screenshots'>, countFor: string, now: string): Promise<RereadOutcome> {
  const videoId = row.video_id!;
  const [video, comments] = await Promise.all([lookUpVideo(videoId, keys.yt), lookUpComments(videoId, keys.yt, COMMENTS_LOOKED_AT)]);
  if (!video.ok && video.kind === 'not_found') return { ok: false, kind: 'video_unavailable', reason: video.reason };
  if (!video.ok) return { ok: false, kind: 'youtube_failed', reason: video.reason };
  await countRecipeRead(db, now, countFor);

  const read: VideoText = {
    description: video.description, transcript: null, ...given,
    comments: comments.ok ? creatorComments(comments.comments, video.channelId) : null,
  };
  const res = await readRecipe({
    apiKey: keys.ai, title: video.title, channel: video.channel, ...read, transcript: given.pasted ?? null,
  });
  if (!res.ok && res.kind === 'refused') return { ok: false, kind: 'recipe_refused', reason: res.reason };
  if (!res.ok) return { ok: false, kind: 'recipe_reading_failed', reason: res.reason };
  const reading = cleanRecipeReading(res.raw, video.title);
  if (!reading.found) return { ok: false, kind: 'no_recipe', reason: 'No recipe in that transcript.' };
  await save(db, row.id, reading, sourcesOf(read), comments.ok || comments.kind === 'none' ? null : comments.reason);
  return { ok: true };
}

/** The one UPDATE: the reading, found, source wholesale, captions_error cleared, comments_error from this read. */
const save = (db: D1Database, id: string, reading: RecipeReading, source: RecipeSource[], commentsError: string | null) => run(db,
  `UPDATE recipes SET title = ?, ingredients = ?, steps = ?, servings = ?, time_text = ?, found = 1, source = ?,
     captions_error = NULL, comments_error = ?, updated_at = ? WHERE id = ?`,
  reading.title, JSON.stringify(reading.ingredients), JSON.stringify(reading.steps), reading.servings, reading.time,
  JSON.stringify(source), commentsError, nowIso(), id);

/** §7E.2b on a link or typed recipe (§7E.6 ⚑ Q169, ⚑ Q173): nothing fetched; Claude reads what was given with the
 *  recipe's title and, for a link, its site. */
async function rereadLink(db: D1Database, aiKey: string, row: RecipeRow, given: Pick<VideoText, 'pasted' | 'screenshots'>,
  countFor: string, now: string): Promise<RereadOutcome> {
  await countRecipeRead(db, now, countFor);
  const read: VideoText = { description: null, transcript: null, comments: null, ...given };
  const res = await readRecipe({
    apiKey: aiKey, title: row.title, channel: null, site: row.link ? row.channel : null, ...read, transcript: given.pasted ?? null,
  });
  if (!res.ok && res.kind === 'refused') return { ok: false, kind: 'recipe_refused', reason: res.reason };
  if (!res.ok) return { ok: false, kind: 'recipe_reading_failed', reason: res.reason };
  const reading = cleanRecipeReading(res.raw, row.title);
  if (!reading.found) return { ok: false, kind: 'no_recipe', reason: 'No recipe in that transcript.' };
  await save(db, row.id, reading, sourcesOf(read), null);
  return { ok: true };
}
