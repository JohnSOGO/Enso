// SPEC §7E.2 step 10 — reads a recipe out of a video's own text (description, captions and the creator's
// comments) with Claude, via claude.ts (the only
// importer of the Anthropic SDK). This file owns the recipe prompt and its schema. It returns the raw
// fields or an honest failure; it never decides what is saved — the route cleans the answer with
// cleanRecipeReading (src/shared/recipes.ts). Claude is told never to invent a recipe from the title.
import { askClaude } from './claude';
import { TRANSCRIPT_MAX } from '../shared/recipes';

export interface ReadRecipeInput {
  apiKey: string;
  title: string | null;
  channel: string | null;
  description: string | null;
  transcript: string | null;
  /** The creator's own comments (creatorComments), already cut. */
  comments: string | null;
}

export type ReadRecipeResult =
  | { ok: true; raw: Record<string, unknown> }
  | { ok: false; kind: 'refused' | 'failed'; reason: string };

const PROMPT =
  `Above is the text of one YouTube video: its title, channel, description and, when available, its captions and ` +
  `the comments its creator posted under it (creators often put the recipe in a pinned comment). ` +
  `Read the recipe that this text gives, if it gives one. Fill in: found (true only when the description, the ` +
  `captions or the creator's comments actually state a recipe's ingredients or steps), title (the dish's name), ` +
  `ingredients (one per item, with its amount, as written), steps (one per step, in order, short and clear), ` +
  `servings and time (only when stated; otherwise null). Use only what the description, captions and the ` +
  `creator's comments say. Never invent a recipe from the ` +
  `video's title or from general cooking knowledge, and never fill in missing amounts or steps. If the text does ` +
  `not hold a recipe, answer found false with empty ingredients and steps.`;

/** One structured-output request through askClaude. `fetch` is for tests only. */
export async function readRecipe(input: ReadRecipeInput, opts: { fetch?: typeof fetch } = {}): Promise<ReadRecipeResult> {
  const text = [
    `Video title: ${input.title ?? '(none)'}`,
    `Channel: ${input.channel ?? '(unknown)'}`,
    `Description:\n${input.description?.trim() || '(empty)'}`,
    `Captions:\n${input.transcript?.trim().slice(0, TRANSCRIPT_MAX) || '(none)'}`,
    `Creator's comments:\n${input.comments?.trim() || '(none)'}`,
  ].join('\n\n');
  const res = await askClaude({
    apiKey: input.apiKey,
    fetch: opts.fetch,
    content: [{ type: 'text', text }],
    prompt: PROMPT,
    schema: (z) => z.object({
      found: z.boolean(), title: z.string().nullable(), ingredients: z.array(z.string()), steps: z.array(z.string()),
      servings: z.string().nullable(), time: z.string().nullable(),
    }),
  });
  return res.ok ? { ok: true, raw: res.value } : res;
}
