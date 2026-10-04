// SPEC §7E — recipe rules (pure): limits, a YouTube link → its video id and the derived watch /
// thumbnail links, when a video's text is worth reading, cleaning Claude's reading, typed input,
// the one-live-recipe-per-video clash, and the wire shape (each person's emoji rules: recipe-emoji.ts). Imports lists + vocab only.
import { TEXT_MAX } from './lists';
import { RECIPE_SOURCE, type RecipeSource } from './vocab';

export const RECIPE_TITLE_MAX = 120;
/** Every ingredient fits a Shopping item as it is (§7E.3): the lists' own limit, never restated. */
export const INGREDIENT_MAX = TEXT_MAX;
export const INGREDIENTS_MAX = 60;
export const STEP_MAX = 1000;
export const STEPS_MAX = 60;
export const SERVINGS_MAX = 60;
export const TIME_MAX = 60;
/** Captions are cut to this many characters before they go to Claude (§7E.2). */
export const TRANSCRIPT_MAX = 20_000;
/** Video reads per household per local day (§7E.2), apart from photo reads. ⚑ Q65 */
export const RECIPE_READS_PER_DAY = 20;
/** The title of a found:false recipe whose video has no title either. */
export const UNTITLED_VIDEO = 'Recipe from YouTube';

// ---- §7E.1 the video ----

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com']);
const PATH_FORMS = new Set(['shorts', 'embed', 'live']);

/** A pasted YouTube link → its 11-character video id, or null (another host, a malformed id). */
export function youtubeVideoId(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  const s = text.trim();
  if (!s || s.length > 2000) return null;
  let u: URL;
  try { u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split('/').filter(Boolean);
  let id: string | null = null;
  if (host === 'youtu.be') id = parts[0] ?? null;
  else if (YOUTUBE_HOSTS.has(host)) {
    if (parts.length === 1 && parts[0] === 'watch') id = u.searchParams.get('v');
    else if (parts.length >= 2 && PATH_FORMS.has(parts[0])) id = parts[1];
  }
  return id && VIDEO_ID.test(id) ? id : null;
}

export const watchUrl = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`;
/** Hotlinked, never stored: not an attachment (§7E.1, §12). */
export const thumbnailUrl = (videoId: string) => `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

// ---- §7E.2 reading a video ----

/** What a video offered to be read. */
export interface VideoText { description: string | null; transcript: string | null }

/** No description and no captions: there is nothing to ask Claude about (it would only have the title). */
export const hasRecipeText = (t: VideoText): boolean => !!t.description?.trim() || !!t.transcript?.trim();

/** What a reading was given: the description when it had text, the captions when a transcript was read. */
export function sourcesOf(t: VideoText): RecipeSource[] {
  return RECIPE_SOURCE.filter((s) => (s === 'description' && !!t.description?.trim()) || (s === 'captions' && !!t.transcript?.trim()));
}

/** A reading, cleaned — what is saved (§7E.2). */
export interface RecipeReading {
  title: string;
  ingredients: string[];
  steps: string[];
  servings: string | null;
  time: string | null;
  found: boolean;
}

/** One line: whitespace collapsed to single spaces, trimmed, cut to `max` (never inside an emoji's surrogate pair); empty → null. */
const line = (v: unknown, max: number): string | null =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max).replace(/[\uD800-\uDBFF]$/, '').trim() || null : null;

const lines = (v: unknown, max: number, count: number): string[] =>
  Array.isArray(v) ? v.map((x) => line(x, max)).filter((x): x is string => x !== null).slice(0, count) : [];

/**
 * Claude's answer → what is saved. `found` not true → no ingredients, no steps. Every string is trimmed and
 * cut to its limit, empty ones dropped; found is then "has ingredients or steps". The title is the dish when
 * found, else the video's title.
 */
export function cleanRecipeReading(raw: Record<string, unknown> | null | undefined, videoTitle: string | null): RecipeReading {
  const r = raw ?? {};
  const said = r.found === true;
  const ingredients = said ? lines(r.ingredients, INGREDIENT_MAX, INGREDIENTS_MAX) : [];
  const steps = said ? lines(r.steps, STEP_MAX, STEPS_MAX) : [];
  const found = ingredients.length > 0 || steps.length > 0;
  const fallback = line(videoTitle, RECIPE_TITLE_MAX) ?? UNTITLED_VIDEO;
  return {
    title: (found && line(r.title, RECIPE_TITLE_MAX)) || fallback,
    ingredients, steps,
    servings: found ? line(r.servings, SERVINGS_MAX) : null,
    time: found ? line(r.time, TIME_MAX) : null,
    found,
  };
}

// ---- §7E.3 typed and edited ----

export interface RecipeInput {
  title: string;
  ingredients: string[];
  steps: string[];
  servings: string | null;
  time: string | null;
}

/** A list of lines from the body: each normalized like a reading, empty lines dropped; else an error. */
function inputLines(v: unknown, field: string, each: number, count: number): string[] | { error: string } {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) return { error: `${field} must be a list of lines.` };
  const out = (v as string[]).map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (out.some((x) => x.length > each)) return { error: `Each line of ${field} can be at most ${each} characters.` };
  if (out.length > count) return { error: `${field} can have at most ${count} lines.` };
  return out;
}

function optLine(v: unknown, field: string, max: number): string | null | { error: string } {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string') return { error: `${field} must be text.` };
  const t = v.replace(/\s+/g, ' ').trim();
  return t.length > max ? { error: `${field} can be at most ${max} characters.` } : t || null;
}

/** POST/PATCH body → normalized recipe fields, or a message naming the offending field. */
export function parseRecipeInput(b: Record<string, unknown>): RecipeInput | string {
  const title = typeof b.title === 'string' ? b.title.replace(/\s+/g, ' ').trim() : '';
  if (!title || title.length > RECIPE_TITLE_MAX) return `title must be 1–${RECIPE_TITLE_MAX} characters.`;
  const ingredients = inputLines(b.ingredients, 'ingredients', INGREDIENT_MAX, INGREDIENTS_MAX);
  if (!Array.isArray(ingredients)) return ingredients.error;
  const steps = inputLines(b.steps, 'steps', STEP_MAX, STEPS_MAX);
  if (!Array.isArray(steps)) return steps.error;
  const servings = optLine(b.servings, 'servings', SERVINGS_MAX);
  if (servings && typeof servings === 'object') return servings.error;
  const time = optLine(b.time, 'time', TIME_MAX);
  if (time && typeof time === 'object') return time.error;
  return { title, ingredients, steps, servings, time };
}

/** found ⇔ the recipe holds ingredients or steps (§7E.1) — every save recomputes it. ⚑ Q67 */
export const isFound = (r: Pick<RecipeInput, 'ingredients' | 'steps'>) => r.ingredients.length > 0 || r.steps.length > 0;

/** Reading video `videoId`: the live recipe already holding it, if any (→ 409 duplicate, no read spent). */
export function recipeVideoClash<T extends { video_id: string | null }>(videoId: string, live: readonly T[]): T | null {
  return live.find((r) => r.video_id === videoId) ?? null;
}

// ---- rows and the wire ----

/** One `recipes` row as D1 returns it. */
export interface RecipeRow {
  id: string;
  title: string;
  video_id: string | null;
  video_title: string | null;
  channel: string | null;
  ingredients: string;
  steps: string;
  servings: string | null;
  time_text: string | null;
  found: number;
  source: string;
  captions_error: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** A recipe on the wire (§10). */
export interface Recipe {
  id: string;
  title: string;
  videoId: string | null;
  videoTitle: string | null;
  channel: string | null;
  watchUrl: string | null;
  thumbnailUrl: string | null;
  ingredients: string[];
  steps: string[];
  servings: string | null;
  time: string | null;
  found: boolean;
  source: RecipeSource[];
  captionsError: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** Each person's own emoji (§7E.5), by member id. */
  emojis: RecipeEmoji[];
}

/** One `recipe_emojis` row as the routes select it (§4.2q). */
export interface RecipeEmojiRow { recipe_id: string; member_id: string; emoji: string }
/** One person's emoji on a recipe, on the wire (§7E.5). */
export interface RecipeEmoji { memberId: string; emoji: string }

function jsonList(text: string): unknown[] {
  try { const v: unknown = JSON.parse(text); return Array.isArray(v) ? v : []; } catch { return []; }
}

/** `emojis` may hold other recipes' rows too; only this recipe's are kept. */
export function recipeFromRow(r: RecipeRow, emojis: readonly RecipeEmojiRow[] = []): Recipe {
  const strings = (text: string) => jsonList(text).filter((x): x is string => typeof x === 'string');
  const listed = jsonList(r.source);
  return {
    id: r.id, title: r.title, videoId: r.video_id, videoTitle: r.video_title, channel: r.channel,
    watchUrl: r.video_id ? watchUrl(r.video_id) : null, thumbnailUrl: r.video_id ? thumbnailUrl(r.video_id) : null,
    ingredients: strings(r.ingredients), steps: strings(r.steps), servings: r.servings, time: r.time_text,
    found: r.found === 1, source: RECIPE_SOURCE.filter((s) => listed.includes(s)),
    captionsError: r.captions_error, createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
    emojis: emojis.filter((e) => e.recipe_id === r.id).map((e) => ({ memberId: e.member_id, emoji: e.emoji })),
  };
}
