// SPEC §7E.2 step 10, §7E.2b — reads a recipe out of a video's own text (description, captions or a transcript
// pasted or screenshotted, and the creator's comments) with Claude, via claude.ts (the only
// importer of the Anthropic SDK). This file owns the recipe prompt and its schema. It returns the raw
// fields or an honest failure; it never decides what is saved — the route cleans the answer with
// cleanRecipeReading (src/shared/recipe-reading.ts). Claude is told never to invent a recipe from the title.
import { askClaude } from './claude';
import { RECIPE_IN_ENGLISH, TRANSCRIPT_MAX, type Screenshot } from '../shared/recipe-reading';
import type { z as Zod } from 'zod';

/** A recipe's reading (§7E.2), also the fill of a link's (§7E.6, recipe-link-reader.ts); cleaned by cleanRecipeReading. */
export const recipeReadingSchema = (z: typeof Zod) => z.object({
  found: z.boolean(), title: z.string().nullable(), ingredients: z.array(z.string()), steps: z.array(z.string()),
  servings: z.string().nullable(), time: z.string().nullable(),
});

export interface ReadRecipeInput {
  apiKey: string;
  title: string | null;
  channel: string | null;
  description: string | null;
  transcript: string | null;
  /** The creator's own comments (creatorComments), already cut. */
  comments: string | null;
  /** Screenshots of the video's transcript (§7E.2b), already checked by parseScreenshots; sent as image blocks. */
  screenshots?: readonly Screenshot[];
  /** Given for a recipe that is not a video's (§7E.2b ⚑ Q169 ⚑ Q173): a link's site, or null for a typed one. The
   *  prompts then speak of a post or page given by hand, not a YouTube video. */
  site?: string | null;
}

export type ReadRecipeResult =
  | { ok: true; raw: Record<string, unknown> }
  | { ok: false; kind: 'refused' | 'failed'; reason: string };

const VIDEO_INTRO =
  `Above is the text of one YouTube video: its title, channel, description and, when available, its captions and ` +
  `the comments its creator posted under it (creators often put the recipe in a pinned comment). `;
const postIntro = (site: string | null) =>
  `Above is what someone gave for a recipe they saved${site ? ` from ${site}` : ''}: its title, and screenshots or ` +
  `text of the recipe (a post's caption, a transcript, a cookbook or web page). `;
const PROMPT =
  `Read the recipe that this text gives, if it gives one. Fill in: found (true only when the description, the ` +
  `captions or the creator's comments actually state a recipe's ingredients or steps), title (the dish's name), ` +
  `ingredients (one per item, with its amount, as written), steps (one per step, in order, short and clear), ` +
  `servings and time (only when stated; otherwise null). Use only what the description, captions and the ` +
  `creator's comments say. Never invent a recipe from the ` +
  `video's title or from general cooking knowledge, and never fill in missing amounts or steps. If the text does ` +
  `not hold a recipe, answer found false with empty ingredients and steps. ${RECIPE_IN_ENGLISH}`;

const SCREENSHOTS_LINE =
  `The images above are screenshots of this video's transcript or captions: read their text as what is spoken ` +
  `in the video, like the captions, and ignore timestamps and the app around them.`;
const POST_SCREENSHOTS_LINE =
  `The images above are screenshots of the recipe: read their text (a post's caption, a transcript or the recipe shown) ` +
  `and ignore the app around it.`;

/** One structured-output request through askClaude. `fetch` is for tests only. */
export async function readRecipe(input: ReadRecipeInput, opts: { fetch?: typeof fetch } = {}): Promise<ReadRecipeResult> {
  const byHand = input.site !== undefined;
  const text = [
    `${byHand ? 'Title' : 'Video title'}: ${input.title ?? '(none)'}`,
    byHand ? `Site: ${input.site ?? '(none)'}` : `Channel: ${input.channel ?? '(unknown)'}`,
    `Description:\n${input.description?.trim() || '(empty)'}`,
    `Captions:\n${input.transcript?.trim().slice(0, TRANSCRIPT_MAX) || '(none)'}`,
    `Creator's comments:\n${input.comments?.trim() || '(none)'}`,
  ].join('\n\n');
  const res = await askClaude({
    apiKey: input.apiKey,
    fetch: opts.fetch,
    content: [
      ...(input.screenshots ?? []).map((s) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: s.type, data: s.data } })),
      { type: 'text', text },
    ],
    prompt: [input.screenshots?.length ? (byHand ? POST_SCREENSHOTS_LINE : SCREENSHOTS_LINE) : '',
      byHand ? postIntro(input.site ?? null) : VIDEO_INTRO, PROMPT].filter(Boolean).join(' ').replace(/ {2,}/g, ' '),
    schema: recipeReadingSchema,
  });
  return res.ok ? { ok: true, raw: res.value } : res;
}
