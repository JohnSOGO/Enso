// SPEC §7C.4b — reads a thing from a pasted link via claude.ts: the page as the Worker fetched it (a
// failure kept as a note, never fatal), a look-up with web search and web fetch, then the structured
// reading with the photo reader's schema. Returns the raw reading or an honest failure; never HTTP, no
// Hono, never decides what is saved (the route cleans it with cleanPhotoReading).
import { askClaude, askClaudeResearch } from './claude';
import { fetchPage } from './page-fetch';
import { thingReadingSchema } from './photo-reader';
import {
  LINK_FETCHES_MAX, LINK_SEARCHES_MAX, RESEARCH_TURNS_MAX, fillPrompt, pageExtract, researchPrompt, type PageResult,
} from '../shared/link-reading';

export interface ReadLinkInput { apiKey: string; url: string; today: string; tz: string }

export type ReadLinkResult =
  | { ok: true; raw: Record<string, unknown> }
  | { ok: false; kind: 'refused' | 'failed'; reason: string };

/** The page (or why not), the look-up, then the fields. `fetch` is for tests only (the page and Claude alike). */
export async function readLink(input: ReadLinkInput, opts: { fetch?: typeof fetch } = {}): Promise<ReadLinkResult> {
  const fetched = await fetchPage(input.url, opts);
  const page: PageResult = fetched.ok ? { ok: true, page: pageExtract(fetched.html) } : fetched;
  const notes = await askClaudeResearch({
    apiKey: input.apiKey, fetch: opts.fetch, maxTurns: RESEARCH_TURNS_MAX,
    prompt: researchPrompt(input.url, page, input.today, input.tz),
    tools: [
      { type: 'web_search_20260209', name: 'web_search', max_uses: LINK_SEARCHES_MAX },
      { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: LINK_FETCHES_MAX },
    ],
  });
  if (!notes.ok) return notes;
  const res = await askClaude({
    apiKey: input.apiKey, fetch: opts.fetch, content: [],
    prompt: fillPrompt(input.url, page, notes.value, input.today, input.tz), schema: thingReadingSchema,
  });
  return res.ok ? { ok: true, raw: { ...res.value, url: input.url } } : res;
}
