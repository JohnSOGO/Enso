// SPEC §7E.6 — reads a recipe from any link that is not a YouTube video, via claude.ts: the page as the Worker
// fetched it (a failure — Facebook's login wall, a 403 — kept for the prompt, never fatal), a look-up with web
// fetch and web search, then the fill with recipe-reader.ts's schema. Returns the raw reading, the look-up's notes
// and the fallback title, or an honest failure; no Hono, no D1, never decides what is saved (the route cleans it
// with cleanRecipeReading).
import { askClaude, askClaudeResearch } from './claude';
import { fetchPage } from './page-fetch';
import { recipeReadingSchema } from './recipe-reader';
import { RESEARCH_TURNS_MAX, pageExtract, type PageResult } from '../shared/link-reading';
import {
  RECIPE_LINK_FETCHES_MAX, RECIPE_LINK_SEARCHES_MAX, pageTitle, recipeFillPrompt, recipeResearchPrompt,
} from '../shared/recipe-link';

export interface ReadRecipeLinkInput { apiKey: string; link: string; site: string }

export type ReadRecipeLinkResult =
  | { ok: true; raw: Record<string, unknown>; notes: string; title: string }
  | { ok: false; kind: 'refused' | 'failed'; reason: string };

/** The page (or why not), the look-up, then the fields. `fetch` is for tests only (the page and Claude alike). */
export async function readRecipeLink(input: ReadRecipeLinkInput, opts: { fetch?: typeof fetch } = {}): Promise<ReadRecipeLinkResult> {
  const fetched = await fetchPage(input.link, opts);
  const page: PageResult = fetched.ok ? { ok: true, page: pageExtract(fetched.html) } : fetched;
  const notes = await askClaudeResearch({
    apiKey: input.apiKey, fetch: opts.fetch, maxTurns: RESEARCH_TURNS_MAX,
    prompt: recipeResearchPrompt(input.link, input.site, page),
    tools: [
      { type: 'web_search_20260209', name: 'web_search', max_uses: RECIPE_LINK_SEARCHES_MAX },
      { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: RECIPE_LINK_FETCHES_MAX },
    ],
  });
  if (!notes.ok) return notes;
  const res = await askClaude({
    apiKey: input.apiKey, fetch: opts.fetch, content: [], prompt: recipeFillPrompt(input.link, page, notes.value), schema: recipeReadingSchema,
  });
  return res.ok ? { ok: true, raw: res.value, notes: notes.value, title: pageTitle(page, input.site) } : res;
}
