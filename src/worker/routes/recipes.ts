// SPEC §7E, §10 — recipes: CRUD, and reading one from a YouTube video. Every rule (limits, the link → id,
// when to ask Claude, cleaning the answer, found, the clash) is src/shared/recipes.ts; the fetching is
// youtube.ts, youtube-captions.ts and recipe-reader.ts. This route keeps the §7E.2 check order, counts
// reads, and persists. Any member may do anything; delete is soft (⚑ Q66). Each person sets only their own
// emoji (§7E.5), and every recipe answered carries everyone's through toRecipes.
import { Hono, type Context } from 'hono';
import type { AppEnv } from '../env';
import {
  RECIPE_READS_PER_DAY, cleanRecipeReading, hasRecipeText, isFound, parseRecipeInput, recipeFromRow, recipeVideoClash,
  sourcesOf, youtubeVideoId, type Recipe, type RecipeEmojiRow, type RecipeInput, type RecipeRow,
} from '../../shared/recipes';
import { emojiError } from '../../shared/emoji';
import type { RecipeSource } from '../../shared/vocab';
import { addDays, localToUtc, utcToLocal } from '../../shared/time';
import { all, first, householdTz, newId, nowIso, run } from '../db';
import { body, fail } from '../http';
import { requireMember } from '../session';
import { lookUpVideo } from '../youtube';
import { readCaptions } from '../youtube-captions';
import { readRecipe } from '../recipe-reader';

const LIVE = 'SELECT * FROM recipes WHERE deleted_at IS NULL';
const loadRow = (db: D1Database, id: string) => first<RecipeRow>(db, `${LIVE} AND id = ?`, id);
const GONE = 'That recipe no longer exists.';

async function loadRecipe(c: Context<AppEnv>): Promise<RecipeRow | Response> {
  return (await loadRow(c.env.DB, c.req.param('id')!)) ?? fail(c, 404, 'not_found', GONE);
}

/** The one way a recipe leaves this route: rows → the wire, each with everyone's emoji (§7E.5). One extra
 *  query — for a single row only its emojis, else every live recipe's. */
async function toRecipes(db: D1Database, rows: RecipeRow[]): Promise<Recipe[]> {
  const one = rows.length === 1 ? rows[0].id : null;
  const emojis = await all<RecipeEmojiRow>(db,
    `SELECT e.recipe_id, e.member_id, e.emoji FROM recipe_emojis e JOIN recipes r ON r.id = e.recipe_id
     WHERE r.deleted_at IS NULL${one ? ' AND e.recipe_id = ?' : ''} ORDER BY e.member_id`, ...(one ? [one] : []));
  return rows.map((r) => recipeFromRow(r, emojis));
}

/** A live recipe by id → 200/201 with its emojis. */
const answer = async (c: Context<AppEnv>, id: string, status: 200 | 201 = 200) =>
  c.json((await toRecipes(c.env.DB, [(await loadRow(c.env.DB, id))!]))[0], status);

const duplicate = (c: Context<AppEnv>, r: RecipeRow) =>
  c.json({ error: 'duplicate', message: `That video is already in Recipes: “${r.title}”.`, recipeId: r.id }, 409);

interface Video { id: string; title: string | null; channel: string | null }

function insert(db: D1Database, id: string, f: RecipeInput, video: Video | null, source: RecipeSource[],
  captionsError: string | null, me: string, now: string) {
  return run(db,
    `INSERT INTO recipes (id, title, video_id, video_title, channel, ingredients, steps, servings, time_text, found, source,
       captions_error, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, f.title, video?.id ?? null, video?.title ?? null, video?.channel ?? null, JSON.stringify(f.ingredients),
    JSON.stringify(f.steps), f.servings, f.time, isFound(f) ? 1 : 0, JSON.stringify(source), captionsError, me, now, now);
}

export const recipes = new Hono<AppEnv>();

recipes.get('/recipes', requireMember, async (c) => {
  const rows = await all<RecipeRow>(c.env.DB, `${LIVE} ORDER BY created_at DESC, id DESC`);
  return c.json(await toRecipes(c.env.DB, rows));
});

recipes.post('/recipes', requireMember, async (c) => {
  const input = parseRecipeInput(await body(c));
  if (typeof input === 'string') return fail(c, 400, 'invalid_input', input);
  const id = newId('rcp');
  await insert(c.env.DB, id, input, null, ['typed'], null, c.get('member').id, nowIso());
  return answer(c, id, 201);
});

recipes.post('/recipes/from-video', requireMember, async (c) => {
  // §7E.2 check order: link → duplicate → daily cap → keys → YouTube → captions → count → Claude → clean → save.
  const videoId = youtubeVideoId((await body(c)).url);
  if (!videoId) return fail(c, 400, 'invalid_input', "That isn't a YouTube video link.");
  const db = c.env.DB;
  const clash = recipeVideoClash(videoId, await all<RecipeRow>(db, `${LIVE} AND video_id IS NOT NULL`));
  if (clash) return duplicate(c, clash);

  const now = nowIso(), tz = await householdTz(db), today = utcToLocal(now, tz).date;
  const reads = await first<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM recipe_reads WHERE at >= ? AND at < ?',
    localToUtc(today, '00:00', tz), localToUtc(addDays(today, 1), '00:00', tz));
  if ((reads?.n ?? 0) >= RECIPE_READS_PER_DAY) {
    return fail(c, 429, 'rate_limited', `Videos can be read ${RECIPE_READS_PER_DAY} times a day, and today's are used up. Try again tomorrow, or type the recipe in.`);
  }
  const { YOUTUBE_API_KEY: ytKey, ANTHROPIC_API_KEY: aiKey } = c.env;
  if (!ytKey || !aiKey) return fail(c, 503, 'recipe_reading_off', "Reading recipes from videos isn't set up yet.");

  const video = await lookUpVideo(videoId, ytKey);
  if (!video.ok && video.kind === 'not_found') return fail(c, 404, 'video_unavailable', `Couldn't find that video. ${video.reason}`);
  if (!video.ok) return fail(c, 502, 'youtube_failed', `Couldn't look the video up: ${video.reason}`);
  const captions = await readCaptions(videoId);
  const me = c.get('member').id;
  await run(db, 'INSERT INTO recipe_reads (at, member_id) VALUES (?, ?)', now, me);

  const text = { description: video.description, transcript: captions.ok ? captions.text : null };
  let raw: Record<string, unknown> | null = null;
  if (hasRecipeText(text)) {
    const r = await readRecipe({ apiKey: aiKey, title: video.title, channel: video.channel, ...text });
    if (!r.ok && r.kind === 'refused') return fail(c, 422, 'recipe_refused', "Couldn't read a recipe from that video.");
    if (!r.ok) return fail(c, 502, 'recipe_reading_failed', `Couldn't read the recipe: ${r.reason}`);
    raw = r.raw;
  }
  const reading = cleanRecipeReading(raw, video.title);
  const id = newId('rcp');
  try {
    await insert(db, id, reading, { id: videoId, title: video.title, channel: video.channel }, sourcesOf(text),
      captions.ok ? null : captions.reason, me, now);
  } catch (err) {
    const won = recipeVideoClash(videoId, await all<RecipeRow>(db, `${LIVE} AND video_id = ?`, videoId));
    if (won) return duplicate(c, won); // another paste of the same link saved first (uq_recipe_video)
    throw err;
  }
  return answer(c, id, 201);
});

recipes.get('/recipes/:id', requireMember, async (c) => {
  const r = await loadRecipe(c);
  return r instanceof Response ? r : c.json((await toRecipes(c.env.DB, [r]))[0]);
});

recipes.patch('/recipes/:id', requireMember, async (c) => {
  const r = await loadRecipe(c);
  if (r instanceof Response) return r;
  const was = recipeFromRow(r);
  const b = await body(c);
  const input = parseRecipeInput({
    title: was.title, ingredients: was.ingredients, steps: was.steps, servings: was.servings, time: was.time,
    ...Object.fromEntries(['title', 'ingredients', 'steps', 'servings', 'time'].filter((k) => k in b).map((k) => [k, b[k]])),
  });
  if (typeof input === 'string') return fail(c, 400, 'invalid_input', input);
  await run(c.env.DB,
    'UPDATE recipes SET title = ?, ingredients = ?, steps = ?, servings = ?, time_text = ?, found = ?, updated_at = ? WHERE id = ?',
    input.title, JSON.stringify(input.ingredients), JSON.stringify(input.steps), input.servings, input.time,
    isFound(input) ? 1 : 0, nowIso(), r.id);
  return answer(c, r.id);
});

recipes.delete('/recipes/:id', requireMember, async (c) => {
  const now = nowIso();
  const res = await run(c.env.DB, 'UPDATE recipes SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL', now, now, c.req.param('id'));
  if (res.meta.changes !== 1) return fail(c, 404, 'not_found', GONE);
  return c.body(null, 204);
});

// §7E.5 — my emoji on a recipe: the member is the session's, never the body's; recipes.updated_at is untouched.
recipes.put('/recipes/:id/emoji', requireMember, async (c) => {
  const r = await loadRecipe(c);
  if (r instanceof Response) return r;
  const { emoji } = await body(c);
  const err = emojiError(emoji);
  if (err) return fail(c, 400, 'invalid_input', err);
  await run(c.env.DB,
    `INSERT INTO recipe_emojis (recipe_id, member_id, emoji, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(recipe_id, member_id) DO UPDATE SET emoji = excluded.emoji, updated_at = excluded.updated_at`,
    r.id, c.get('member').id, emoji, nowIso());
  return answer(c, r.id);
});

recipes.delete('/recipes/:id/emoji', requireMember, async (c) => {
  const r = await loadRecipe(c);
  if (r instanceof Response) return r;
  await run(c.env.DB, 'DELETE FROM recipe_emojis WHERE recipe_id = ? AND member_id = ?', r.id, c.get('member').id);
  return answer(c, r.id);
});
