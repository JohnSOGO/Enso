// SPEC §7F.2 — looks up a movie or show via claude.ts: for a link, the page as the Worker fetched it (a failure kept
// for the prompt, never fatal); for a picture, photo-reader's image block; then a look-up with web search and web
// fetch, then the structured reading (showReadingSchema). Returns the raw reading or an honest failure; no Hono, no
// D1, never decides what is saved (the route cleans it with cleanShowReading).
import { askClaude, askClaudeResearch, webFetchTool, webSearchTool, type ClaudeBlock } from './claude';
import { fetchPage } from './page-fetch';
import { imageBlock } from './photo-reader';
import { RESEARCH_TURNS_MAX, pageExtract } from '../shared/link-reading';
import {
  SHOW_COMMENTS_LOOKED_AT, SHOW_FETCHES_MAX, SHOW_SEARCHES_MAX, WATCH_COUNTRY, showFillPrompt, showResearchPrompt, type ShowQuery, type VideoResult,
} from '../shared/show-reading';
import { youtubeVideoId } from '../shared/recipes';
import { lookUpComments, lookUpVideo } from './youtube';
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

export interface LookUpInput {
  apiKey: string; ask: ShowAsk; today: string; tz: string; home: Place | null;
  /** For a YouTube link's details and comments (§7F.2); none → the prompt says why. */
  youtubeKey?: string;
}

/** §7F.2 — a YouTube video's title, channel, description and top comments, or why not. Never throws, never fatal. */
async function videoFacts(videoId: string, key: string | undefined, opts: { fetch?: typeof fetch }): Promise<VideoResult> {
  if (!key) return { ok: false, reason: "reading YouTube isn't set up." };
  const [video, comments] = await Promise.all([lookUpVideo(videoId, key, opts), lookUpComments(videoId, key, SHOW_COMMENTS_LOOKED_AT, opts)]);
  if (!video.ok) return { ok: false, reason: video.reason };
  return {
    ok: true,
    video: {
      title: video.title, channel: video.channel, description: video.description,
      comments: comments.ok ? comments.comments.map((c) => c.text) : { reason: comments.reason },
    },
  };
}

export type LookUpResult = { ok: true; raw: Record<string, unknown> } | { ok: false; kind: 'refused' | 'failed'; reason: string };

/** The page or picture, the look-up, then the fields. `fetch` is for tests only (the page and Claude alike). */
export async function lookUpShow(input: LookUpInput, opts: { fetch?: typeof fetch } = {}): Promise<LookUpResult> {
  const { ask } = input;
  let query: ShowQuery;
  const content: ClaudeBlock[] = [];
  if (ask.by === 'link') {
    const videoId = youtubeVideoId(ask.url);
    const [fetched, video] = await Promise.all([fetchPage(ask.url, opts), videoId ? videoFacts(videoId, input.youtubeKey, opts) : null]);
    query = { by: 'link', url: ask.url, page: fetched.ok ? { ok: true, page: pageExtract(fetched.html) } : fetched, video };
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
    tools: [webSearchTool(SHOW_SEARCHES_MAX, { country: WATCH_COUNTRY, timezone: input.tz }), webFetchTool(SHOW_FETCHES_MAX)],
  });
  if (!notes.ok) return notes;
  const res = await askClaude({
    apiKey: input.apiKey, fetch: opts.fetch, content: [], prompt: showFillPrompt(notes.value, input.today), schema: showReadingSchema,
  });
  return res.ok ? { ok: true, raw: res.value } : res;
}
