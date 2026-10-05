// SPEC §7E, §10 — recipes: CRUD, reading one from any link (§7E.6: its kind detected; a page through recipe-link-reader.ts)
// or a YouTube video, and re-reading one from its transcript, pasted or
// screenshotted (§7E.2b; screenshots are read, never stored). Every rule (limits, the link → id,
// whose comments are the creator's, when to ask Claude, cleaning the answer, found, the clash) is src/shared/recipes.ts or,
// for reading a video, src/shared/recipe-reading.ts; the fetching is
// youtube.ts, youtube-captions.ts and recipe-reader.ts; the re-read itself (re-fetch, count, Claude, clean,
// UPDATE) is recipe-reread.ts. This route keeps the §7E.2 / §7E.2b check orders, counts reads, and persists. Any member may do anything; delete is soft (⚑ Q66). Each person sets only their own
// emoji (§7E.5), and every recipe answered carries everyone's through toRecipes. From-video is the one place
// SogoAI is asked for captions, in-line (§7E.2c: wantsHomeCaptions decides, home-captions.ts asks).
import { Hono, type Context } from 'hono';
import type { AppEnv, Env } from '../env';
import {
  isFound, parseRecipeInput, recipeFromRow, recipeVideoClash, type Recipe, type RecipeEmojiRow, type RecipeInput, type RecipeRow,
} from '../../shared/recipes';
import { recipeLinkOf, siteName } from '../../shared/recipe-link';
import {
  COMMENTS_LOOKED_AT, HOME_CAPTIONS_OFF, PASTED_MAX, RECIPE_READS_PER_DAY, cleanRecipeReading, cleanTranscript, creatorComments,
  hasRecipeText, homeCaptionsError, parseScreenshots, sourcesOf, wantsHomeCaptions,
} from '../../shared/recipe-reading';
import { emojiError } from '../../shared/emoji';
import type { RecipeSource } from '../../shared/vocab';
import { addDays, localToUtc, utcToLocal } from '../../shared/time';
import { all, first, householdTz, newId, nowIso, run } from '../db';
import { body, fail } from '../http';
import { requireMember } from '../session';
import { lookUpComments, lookUpVideo } from '../youtube';
import { readCaptions } from '../youtube-captions';
import { readRecipe } from '../recipe-reader';
import { readRecipeLink } from '../recipe-link-reader';
import { rereadRecipe } from '../recipe-reread';
import { homeCaptionsConfigOf, readCaptionsFromHome } from '../home-captions';

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
  c.json({ error: 'duplicate', message: `That ${r.link ? 'link' : 'video'} is already in Recipes: “${r.title}”.`, recipeId: r.id }, 409);

/** Where a read recipe came from: a YouTube video, or a page's cleaned link and its site's name (§7E.6). */
type From = { video: { id: string; title: string | null; channel: string | null } } | { link: string; site: string };

/** The daily cap (§7E.2 step 4, §7E.2b step 5): today's video reads, in the household's day, are used up → 429. */
async function readsUsedUp(c: Context<AppEnv>, now: string): Promise<Response | null> {
  const db = c.env.DB, tz = await householdTz(db), today = utcToLocal(now, tz).date;
  const reads = await first<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM recipe_reads WHERE at >= ? AND at < ?',
    localToUtc(today, '00:00', tz), localToUtc(addDays(today, 1), '00:00', tz));
  if ((reads?.n ?? 0) < RECIPE_READS_PER_DAY) return null;
  return fail(c, 429, 'rate_limited', `Videos can be read ${RECIPE_READS_PER_DAY} times a day, and today's are used up. Try again tomorrow, or type the recipe in.`);
}

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

const readingOff = (c: Context<AppEnv>, what = 'videos') => fail(c, 503, 'recipe_reading_off', `Reading recipes from ${what} isn't set up yet.`);

/** Why the captions and the creator's comments couldn't be read (NULL when they were, or weren't tried). */
interface ReadErrors { captions: string | null; comments: string | null }

function insert(db: D1Database, id: string, f: RecipeInput, from: From | null, source: RecipeSource[],
  errors: ReadErrors, me: string, now: string) {
  const video = from && 'video' in from ? from.video : null, page = from && 'link' in from ? from : null;
  return run(db,
    `INSERT INTO recipes (id, title, video_id, video_title, channel, link, ingredients, steps, servings, time_text, found, source,
       captions_error, comments_error, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, f.title, video?.id ?? null, video?.title ?? null, video?.channel ?? page?.site ?? null, page?.link ?? null, JSON.stringify(f.ingredients),
    JSON.stringify(f.steps), f.servings, f.time, isFound(f) ? 1 : 0, JSON.stringify(source), errors.captions, errors.comments,
    me, now, now);
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
  await insert(c.env.DB, id, input, null, ['typed'], { captions: null, comments: null }, c.get('member').id, nowIso());
  return answer(c, id, 201);
});

/** §7E.6 — any link: its kind detected; a page is read here, a video below (§7E.2). */
async function fromLink(c: Context<AppEnv>): Promise<Response> {
  const kind = recipeLinkOf((await body(c)).url);
  if (!kind) return fail(c, 400, 'invalid_input', "That isn't a link that can be read.");
  if (kind.kind === 'video') return fromVideo(c, kind.videoId);
  // §7E.6 check order: link → duplicate → daily cap → key → the page → count → look-up + fill → clean → save.
  const db = c.env.DB, { link } = kind, site = siteName(link);
  const clash = await first<RecipeRow>(db, `${LIVE} AND link = ?`, link);
  if (clash) return duplicate(c, clash);
  const now = nowIso();
  const usedUp = await readsUsedUp(c, now);
  if (usedUp) return usedUp;
  const aiKey = c.env.ANTHROPIC_API_KEY;
  if (!aiKey) return readingOff(c, 'links');
  const me = c.get('member').id;
  await run(db, 'INSERT INTO recipe_reads (at, member_id) VALUES (?, ?)', now, me);
  const r = await readRecipeLink({ apiKey: aiKey, link, site });
  if (!r.ok && r.kind === 'refused') return fail(c, 422, 'recipe_refused', "Couldn't read a recipe from that link.");
  if (!r.ok) return fail(c, 502, 'recipe_reading_failed', `Couldn't read the recipe: ${r.reason}`);
  const id = newId('rcp');
  try {
    await insert(db, id, cleanRecipeReading(r.raw, r.title), { link, site },
      sourcesOf({ description: null, transcript: null, comments: null, page: r.notes }), { captions: null, comments: null }, me, now);
  } catch (err) {
    const won = await first<RecipeRow>(db, `${LIVE} AND link = ?`, link);
    if (won) return duplicate(c, won); // another paste of the same link saved first (uq_recipe_link)
    throw err;
  }
  return answer(c, id, 201);
}

recipes.post('/recipes/from-link', requireMember, fromLink);
recipes.post('/recipes/from-video', requireMember, fromLink); // the same handler, for phones on an older app (§7E.6)

async function fromVideo(c: Context<AppEnv>, videoId: string): Promise<Response> {
  // §7E.2 check order: link → duplicate → daily cap → keys → YouTube → captions + the creator's comments → count →
  // Claude → clean → save.
  const db = c.env.DB;
  const clash = recipeVideoClash(videoId, await all<RecipeRow>(db, `${LIVE} AND video_id IS NOT NULL`));
  if (clash) return duplicate(c, clash);

  const now = nowIso();
  const usedUp = await readsUsedUp(c, now);
  if (usedUp) return usedUp;
  const { YOUTUBE_API_KEY: ytKey, ANTHROPIC_API_KEY: aiKey } = c.env;
  if (!ytKey || !aiKey) return readingOff(c);

  const video = await lookUpVideo(videoId, ytKey);
  if (!video.ok && video.kind === 'not_found') return fail(c, 404, 'video_unavailable', `Couldn't find that video. ${video.reason}`);
  if (!video.ok) return fail(c, 502, 'youtube_failed', `Couldn't look the video up: ${video.reason}`);
  // Steps 7 (with SogoAI when blocked, §7E.2c) and 8 side by side; neither is ever fatal.
  const [captions, comments] = await Promise.all([captionsFor(videoId, c.env), lookUpComments(videoId, ytKey, COMMENTS_LOOKED_AT)]);
  const me = c.get('member').id;
  await run(db, 'INSERT INTO recipe_reads (at, member_id) VALUES (?, ?)', now, me);

  const text = {
    description: video.description, transcript: 'text' in captions ? captions.text : null,
    comments: comments.ok ? creatorComments(comments.comments, video.channelId) : null,
  };
  const errors: ReadErrors = {
    captions: 'error' in captions ? captions.error : null,
    comments: comments.ok || comments.kind === 'none' ? null : comments.reason, // turned off is not an error ⚑ Q78
  };
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
    await insert(db, id, reading, { video: { id: videoId, title: video.title, channel: video.channel } }, sourcesOf(text), errors, me, now);
  } catch (err) {
    const won = recipeVideoClash(videoId, await all<RecipeRow>(db, `${LIVE} AND video_id = ?`, videoId));
    if (won) return duplicate(c, won); // another paste of the same link saved first (uq_recipe_video)
    throw err;
  }
  return answer(c, id, 201);
}

recipes.post('/recipes/:id/transcript', requireMember, async (c) => {
  // §7E.2b check order: recipe → a video → the text → daily cap → keys → YouTube + the creator's comments (no
  // captions attempt) → count → Claude → clean → found, else nothing changes → save.
  const r = await loadRecipe(c);
  if (r instanceof Response) return r;
  if (!r.video_id && !r.link) return fail(c, 400, 'invalid_input', 'Only a recipe read from a video or a link takes a transcript.');
  const { text, screenshots: shots } = await body(c);
  const screenshots = parseScreenshots(shots);
  if (typeof screenshots === 'string') return fail(c, 400, 'invalid_input', screenshots);
  if (text !== undefined && text !== null && (typeof text !== 'string' || text.length > PASTED_MAX)) {
    return fail(c, 400, 'invalid_input', `The pasted transcript must be text of at most ${PASTED_MAX} characters.`);
  }
  const pasted = typeof text === 'string' ? cleanTranscript(text) : null;
  if (!pasted && !screenshots.length) return fail(c, 400, 'invalid_input', 'Add a screenshot of the transcript, or paste its text.');
  const now = nowIso();
  const usedUp = await readsUsedUp(c, now);
  if (usedUp) return usedUp;
  const { YOUTUBE_API_KEY: ytKey, ANTHROPIC_API_KEY: aiKey } = c.env;
  if ((r.video_id && !ytKey) || !aiKey) return readingOff(c, r.video_id ? 'videos' : 'links');

  const out = await rereadRecipe(c.env.DB, { yt: ytKey ?? '', ai: aiKey }, r, { pasted, screenshots },
    c.get('member').id, now);
  if (out.ok) return answer(c, r.id);
  switch (out.kind) {
    case 'video_unavailable': return fail(c, 404, 'video_unavailable', `Couldn't find that video. ${out.reason}`);
    case 'youtube_failed': return fail(c, 502, 'youtube_failed', `Couldn't look the video up: ${out.reason}`);
    case 'recipe_refused': return fail(c, 422, 'recipe_refused', "Couldn't read a recipe from that transcript.");
    case 'recipe_reading_failed': return fail(c, 502, 'recipe_reading_failed', `Couldn't read the recipe: ${out.reason}`);
    case 'no_recipe': return fail(c, 422, 'no_recipe', 'No recipe in that transcript — nothing was changed.');
  }
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
