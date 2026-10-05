// SPEC §7E.2, §7E.2b, §7E.2c — reading a recipe from a video (pure): what a video offered to be read, the creator's own
// comments, a transcript pasted or screenshotted, when a video's text is worth reading, cleaning Claude's reading, and
// the captions-from-home rules (when to ask SogoAI, checking its answer, the texts).
// Imports recipes (the limits), things (the photo limits) and vocab only; recipes.ts never imports this file.
import { INGREDIENT_MAX, INGREDIENTS_MAX, RECIPE_TITLE_MAX, SERVINGS_MAX, STEP_MAX, STEPS_MAX, TIME_MAX } from './recipes';
import { PHOTO_MAX_BYTES, PHOTO_TYPES } from './things';
import { CAPTIONS_FAILURE, RECIPE_SOURCE, isOneOf, type CaptionsFailure, type RecipeSource } from './vocab';

/** Captions are cut to this many characters before they go to Claude (§7E.2). */
export const TRANSCRIPT_MAX = 20_000;
/** The longest pasted transcript taken, before cleaning (§7E.2b). ⚑ Q89 */
export const PASTED_MAX = 100_000;
/** The most transcript screenshots one read takes (§7E.2b). ⚑ Q92 */
export const SCREENSHOTS_MAX = 4;
/** Comment threads asked for per read (§7E.2 step 8, one quota unit). ⚑ Q77 */
export const COMMENTS_LOOKED_AT = 20;
/** The creator's kept comments are cut to this many characters before they go to Claude (§7E.2). ⚑ Q77 */
export const CREATOR_COMMENTS_MAX = 5000;
/** Video reads per household per local day (§7E.2), apart from photo reads. ⚑ Q65 */
export const RECIPE_READS_PER_DAY = 20;
/** Every reading is saved in English (§7E.2, §7E.6): a recipe in another language is translated, never left as is. ⚑ Q171 */
export const RECIPE_IN_ENGLISH =
  `Write the title, ingredients, steps, servings and time in English: if the recipe is in another language ` +
  `(Spanish, say), translate it faithfully, keeping every amount and unit as given and adding nothing.`;

/** The title of a found:false recipe whose video has no title either. */
export const UNTITLED_VIDEO = 'Recipe from YouTube';

// ---- §7E.2 reading a video ----

/** What a video offered to be read; `comments` is the creator's own (creatorComments); `pasted` and `screenshots`
 *  are a transcript given by hand (cleanTranscript, parseScreenshots, §7E.2b); `page` is a link's look-up notes (§7E.6). */
export interface VideoText {
  description: string | null; transcript: string | null; comments: string | null; pasted?: string | null; screenshots?: readonly Screenshot[];
  page?: string | null;
}

const has = (v: string | null | undefined) => !!v?.trim();
const OFFERED: Partial<Record<RecipeSource, (t: VideoText) => boolean>> = {
  description: (t) => has(t.description), captions: (t) => has(t.transcript),
  transcript: (t) => has(t.pasted) || !!t.screenshots?.length, comments: (t) => has(t.comments), page: (t) => has(t.page),
};

/** What a reading was given: the description when it had text, the captions when a transcript was read, a
 *  transcript pasted or screenshotted, the creator's comments when one was kept. */
export function sourcesOf(t: VideoText): RecipeSource[] {
  return RECIPE_SOURCE.filter((s) => !!OFFERED[s]?.(t));
}

/** The photo types Claude reads as an image block: the photo limits' own list, less HEIC (§7C.3–7C.4). */
export const SCREENSHOT_TYPES = PHOTO_TYPES.filter((t): t is Exclude<typeof t, 'image/heic'> => t !== 'image/heic');
/** One screenshot as the PWA sends it (§7E.2b): its media type and its bytes in base64. Never stored. */
export interface Screenshot { type: (typeof SCREENSHOT_TYPES)[number]; data: string }

/** The body's `screenshots` → 0–SCREENSHOTS_MAX checked screenshots, or a message naming what is wrong. */
export function parseScreenshots(v: unknown): Screenshot[] | string {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) return 'screenshots must be a list.';
  if (v.length > SCREENSHOTS_MAX) return `At most ${SCREENSHOTS_MAX} screenshots at a time.`;
  for (const x of v) {
    const { type, data } = (x ?? {}) as Record<string, unknown>;
    if (!SCREENSHOT_TYPES.includes(type as Screenshot['type'])) return `Each screenshot must be one of: ${SCREENSHOT_TYPES.join(', ')}.`;
    if (typeof data !== 'string' || !data || data.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) return 'A screenshot came through empty or damaged.';
    if ((data.length / 4) * 3 - data.match(/=*$/)![0].length > PHOTO_MAX_BYTES) return `A screenshot is too large: at most ${PHOTO_MAX_BYTES / (1024 * 1024)} MB.`;
  }
  return v as Screenshot[];
}

/** No description, no captions and no creator's comment: nothing to ask Claude about (it would only have the title). */
export const hasRecipeText = (t: VideoText): boolean => sourcesOf(t).length > 0;

/** A reading, cleaned — what is saved (§7E.2). */
export interface RecipeReading {
  title: string;
  ingredients: string[];
  steps: string[];
  servings: string | null;
  time: string | null;
  found: boolean;
}

/** Cut to `max` (never inside an emoji's surrogate pair), trimmed; empty → null. */
const cut = (s: string, max: number): string | null => s.slice(0, max).replace(/[\uD800-\uDBFF]$/, '').trim() || null;

/** One line: whitespace collapsed to single spaces, trimmed, cut to `max` (never inside an emoji's surrogate pair); empty → null. */
const line = (v: unknown, max: number): string | null => (typeof v === 'string' ? cut(v.replace(/\s+/g, ' ').trim(), max) : null);

const lines = (v: unknown, max: number, count: number): string[] =>
  Array.isArray(v) ? v.map((x) => line(x, max)).filter((x): x is string => x !== null).slice(0, count) : [];

/**
 * The video creator's own comments (§7E.2 step 8): only those whose author IS the video's channel, in order,
 * joined with a blank line, cut to CREATOR_COMMENTS_MAX (never inside a surrogate pair). An unknown channel →
 * null, never a fallback to anyone's comment ⚑ Q80; nothing kept → null.
 */
export function creatorComments(comments: readonly { authorChannelId: string | null; text: string }[], channelId: string | null): string | null {
  if (!channelId) return null;
  const kept = comments.filter((c) => c.authorChannelId === channelId).map((c) => c.text.trim()).filter(Boolean);
  return cut(kept.join('\n\n'), CREATOR_COMMENTS_MAX);
}

const TIMESTAMP = /^\s*\d{1,2}(:\d{2}){1,2}\s*$/;
const LEADING_TIMESTAMP = /^\s*\d{1,2}(:\d{2}){1,2}\s+/;
const DURATION = /^\s*\d+ (hours?|minutes?|seconds?)(,\s*\d+ (hours?|minutes?|seconds?))*\s*$/i;

/**
 * A transcript copied from YouTube's panel → the text Claude reads (§7E.2b ⚑ Q88): timestamp-only lines and
 * spoken durations ("1 minute, 5 seconds") dropped, a leading timestamp stripped, chapter titles kept, each
 * line's whitespace collapsed, empty lines dropped, cut to TRANSCRIPT_MAX (never inside a surrogate pair).
 * Nothing left → null.
 */
export function cleanTranscript(text: string): string | null {
  const kept = text.split(/\r?\n/)
    .filter((l) => !TIMESTAMP.test(l))
    .map((l) => l.replace(LEADING_TIMESTAMP, ''))
    .filter((l) => !DURATION.test(l))
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return cut(kept.join('\n'), TRANSCRIPT_MAX);
}

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

// ---- §7E.2c captions from home (SogoAI) ----

/** A failure reason from home is cut to this many characters. ⚑ Q104 */
export const CAPTIONS_REPORT_REASON_MAX = 300;

/** Only captions YouTube refused (from Cloudflare's addresses) are worth asking the home PC for. ⚑ Q95 */
export const wantsHomeCaptions = (failure: { kind: CaptionsFailure } | null): boolean => failure?.kind === 'blocked';

/** The helper's answer, checked. */
export type CaptionsReport = { ok: true; text: string } | { ok: false; kind: CaptionsFailure; reason: string };

/** The helper's answer (a CaptionsResult as readCaptions returned it, through JSON) → checked, or a message.
 *  The text is cut to TRANSCRIPT_MAX, never cleanTranscript'd (captions carry no timestamps). ⚑ Q104 */
export function parseCaptionsReport(result: unknown): CaptionsReport | string {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return 'result must be a captions result.';
  const r = result as Record<string, unknown>;
  if (r.ok === true) {
    const text = typeof r.text === 'string' ? cut(r.text, TRANSCRIPT_MAX) : null;
    return text ? { ok: true, text } : 'result.text must be non-empty text.';
  }
  if (r.ok !== false) return 'result.ok must be true or false.';
  if (!isOneOf(CAPTIONS_FAILURE, r.kind)) return `result.kind must be one of: ${CAPTIONS_FAILURE.join(', ')}.`;
  const reason = typeof r.reason === 'string' ? cut(r.reason, CAPTIONS_REPORT_REASON_MAX) : null;
  return reason ? { ok: false, kind: r.kind, reason } : 'result.reason must be non-empty text.';
}

/** captions_error when the home PC couldn't read them either, or couldn't be asked. ⚑ Q97 */
export const homeCaptionsError = (reason: string): string => `from home: ${reason}`;
/** The reason when captions were blocked and captions from home aren't configured. ⚑ Q106 */
export const HOME_CAPTIONS_OFF = "captions from home aren't set up.";
