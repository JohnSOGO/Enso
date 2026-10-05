// SPEC §7F.2 — looks up a movie or show via claude.ts: for a link, the page as the Worker fetched it (a failure kept
// for the prompt, never fatal); for a picture, photo-reader's image block; then a look-up with web search and web
// fetch, then the structured reading (showReadingSchema). Returns the raw reading or an honest failure; no Hono, no
// D1, never decides what is saved (the route cleans it with cleanShowReading).
import { askClaude, askClaudeResearch, type ClaudeBlock } from './claude';
import { fetchPage } from './page-fetch';
import { imageBlock } from './photo-reader';
import { RESEARCH_TURNS_MAX, pageExtract } from '../shared/link-reading';
import { SHOW_FETCHES_MAX, SHOW_SEARCHES_MAX, WATCH_COUNTRY, showFillPrompt, showResearchPrompt, type ShowQuery } from '../shared/show-reading';
import { SHOW_KIND, WATCH_HOW, type ShowKind } from '../shared/vocab';
import type { Place } from '../shared/sun';
import type { z as Zod } from 'zod';

/** A show's reading (§7F.2): every field nullable but watch; cleaned by cleanShowReading. */
export const showReadingSchema = (z: typeof Zod) => z.object({
  title: z.string().nullable(), kind: z.enum(SHOW_KIND).nullable(), year: z.string().nullable(),
  rtCritics: z.number().int().nullable(), rtAudience: z.number().int().nullable(),
  watch: z.array(z.object({ how: z.enum(WATCH_HOW), where: z.string(), note: z.string().nullable() })),
  summary: z.string().nullable(), note: z.string().nullable(),
});

/** What to look up, as the route has it: a title, a link, or a picture's bytes. */
export type ShowAsk =
  | { by: 'title'; title: string; year: string | null; kind: ShowKind | null }
  | { by: 'link'; url: string }
  | { by: 'picture'; bytes: ArrayBuffer; mediaType: string };

export interface LookUpInput { apiKey: string; ask: ShowAsk; today: string; tz: string; home: Place | null }

export type LookUpResult = { ok: true; raw: Record<string, unknown> } | { ok: false; kind: 'refused' | 'failed'; reason: string };

/** The page or picture, the look-up, then the fields. `fetch` is for tests only (the page and Claude alike). */
export async function lookUpShow(input: LookUpInput, opts: { fetch?: typeof fetch } = {}): Promise<LookUpResult> {
  const { ask } = input;
  let query: ShowQuery;
  const content: ClaudeBlock[] = [];
  if (ask.by === 'link') {
    const fetched = await fetchPage(ask.url, opts);
    query = { by: 'link', url: ask.url, page: fetched.ok ? { ok: true, page: pageExtract(fetched.html) } : fetched };
  } else if (ask.by === 'picture') {
    const image = imageBlock(ask.bytes, ask.mediaType);
    if ('ok' in image) return image;
    content.push(image);
    query = { by: 'picture' };
  } else {
    query = ask;
  }
  const notes = await askClaudeResearch({
    apiKey: input.apiKey, fetch: opts.fetch, maxTurns: RESEARCH_TURNS_MAX, content,
    prompt: showResearchPrompt(query, input.today, input.tz, input.home),
    tools: [
      { type: 'web_search_20260209', name: 'web_search', max_uses: SHOW_SEARCHES_MAX,
        user_location: { type: 'approximate', country: WATCH_COUNTRY, timezone: input.tz } },
      { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: SHOW_FETCHES_MAX },
    ],
  });
  if (!notes.ok) return notes;
  const res = await askClaude({
    apiKey: input.apiKey, fetch: opts.fetch, content: [], prompt: showFillPrompt(notes.value, input.today), schema: showReadingSchema,
  });
  return res.ok ? { ok: true, raw: res.value } : res;
}
