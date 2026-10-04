// SPEC §7E — canned YouTube, Anthropic and SogoAI answers for the recipe tests. Nothing here ever leaves the
// isolate: `fakeWorld` replaces fetch, answers only the six fake endpoints, and fails the test on any
// other host. The keys the route sees are fake too (`keyedEnv`, `homeEnv`).
import { env } from 'cloudflare:test';
import { vi } from 'vitest';
import type { Env } from '../src/worker/env';

export const VIDEO_ID = 'dQw4w9WgXcQ';
export const YT_KEY = 'fake-youtube-key';

/** The pinned env with FAKE recipe keys — reading is "set up", and still reaches only the fakes. */
export const keyedEnv = (): Env => ({ ...(env as unknown as Env), YOUTUBE_API_KEY: YT_KEY, ANTHROPIC_API_KEY: 'fake-anthropic-key' });

/** keyedEnv with captions from home configured (§7E.2c): FAKE Access credentials; HOME_CAPTIONS_URL and
 *  CAPTIONS_TOKEN are the pinned test ones, so only the `home` fake ever answers. */
export const homeEnv = (): Env => ({ ...keyedEnv(), CF_ACCESS_CLIENT_ID: 'fake-access-id', CF_ACCESS_CLIENT_SECRET: 'fake-access-secret' });

/** The player endpoint's answer listing `tracks` (none → playable, but no captions). */
export const playerAnswer = (tracks?: object[], status = 'OK') =>
  ({ playabilityStatus: { status }, ...(tracks ? { captions: { playerCaptionsTracklistRenderer: { captionTracks: tracks } } } : {}) });

export const TRACKS = [
  { baseUrl: `https://www.youtube.com/api/timedtext?v=${VIDEO_ID}&lang=de`, languageCode: 'de' },
  { baseUrl: `https://www.youtube.com/api/timedtext?v=${VIDEO_ID}&lang=en&kind=asr`, languageCode: 'en', kind: 'asr' },
  { baseUrl: `https://www.youtube.com/api/timedtext?v=${VIDEO_ID}&lang=en`, languageCode: 'en' },
];

export const json3 = (...lines: string[]) =>
  JSON.stringify({ events: lines.map((l) => ({ tStartMs: 0, segs: l.split(' ').map((w, i) => ({ utf8: i ? ` ${w}` : w })) })) });

/** The video's own channel: the creator of every fake video, unless a snippet says otherwise. */
export const CHANNEL_ID = 'UC_fake_creator';

/** videos.list's answer; the snippet carries `channelId` (CHANNEL_ID) unless it gives its own. */
export const videoAnswer = (snippet: object | null) =>
  ({ kind: 'youtube#videoListResponse', items: snippet ? [{ id: VIDEO_ID, snippet: { channelId: CHANNEL_ID, ...snippet } }] : [] });

/** commentThreads.list's answer: one thread per [authorChannelId, text] (none → no comments at all). */
export const commentsAnswer = (items: [string | null, string][] = []) => ({
  kind: 'youtube#commentThreadListResponse',
  items: items.map(([author, text], i) => ({
    id: `thread_${i}`,
    snippet: { videoId: VIDEO_ID, topLevelComment: { id: `c_${i}`, snippet: {
      textDisplay: text, textOriginal: text, ...(author === null ? {} : { authorChannelId: { value: author } }),
    } } },
  })),
});

/** An Anthropic Messages answer carrying `value` as its structured output. */
export const claudeMessage = (value: object | null, over: object = {}) => ({
  id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_sequence: null, stop_details: null,
  usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn',
  content: value ? [{ type: 'text', text: JSON.stringify(value) }] : [], ...over,
});

type Reply = { status?: number; body: string | object } | 'throw';
export interface World {
  video?: Reply;
  comments?: Reply;
  player?: Reply;
  captions?: Reply;
  claude?: Reply;
  /** The SogoAI helper's GET /captions (§7E.2c), at the pinned https://sogoai.test. */
  home?: Reply;
}
export interface Heard { host: string; path: string; url: string; body: any; headers: Headers; redirect: Request['redirect'] }

const respond = (r: Reply | undefined, what: string) => {
  if (!r) throw new Error(`no fake answer for ${what}`);
  if (r === 'throw') throw new Error('connection refused');
  const json = typeof r.body !== 'string';
  return new Response(json ? JSON.stringify(r.body) : (r.body as string), {
    status: r.status ?? 200, headers: { 'content-type': json ? 'application/json' : 'text/html; charset=utf-8' },
  });
};

/** Replaces fetch with the fakes (call vi.restoreAllMocks() in afterEach). Every request is recorded in `heard`. */
export function fakeWorld(world: World) {
  const heard: Heard[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    const text = req.method === 'POST' ? await req.text() : '';
    heard.push({ host: url.host, path: url.pathname, url: req.url, body: text ? JSON.parse(text) : null, headers: req.headers, redirect: req.redirect });
    if (url.host === 'www.googleapis.com' && url.pathname === '/youtube/v3/videos') return respond(world.video, 'videos.list');
    if (url.host === 'www.googleapis.com' && url.pathname === '/youtube/v3/commentThreads') return respond(world.comments, 'commentThreads.list');
    if (url.host === 'www.youtube.com' && url.pathname === '/youtubei/v1/player') return respond(world.player, 'the player');
    if (url.host === 'www.youtube.com' && url.pathname === '/api/timedtext') return respond(world.captions, 'timedtext');
    if (url.host === 'api.anthropic.com' && url.pathname === '/v1/messages') return respond(world.claude, 'Claude');
    if (url.host === 'sogoai.test' && url.pathname === '/captions') return respond(world.home, 'SogoAI');
    throw new Error(`a test tried to reach ${url.host} — only the recipe fakes are allowed`);
  });
  return heard;
}

/**
 * Loads what claude.ts imports lazily (the SDK and zod), so the first Claude call in a test does not pay
 * for it under a busy parallel run. Call from beforeAll with a long hook timeout.
 */
export const warmClaude = () => Promise.all([
  import('@anthropic-ai/sdk'), import('@anthropic-ai/sdk/helpers/beta/zod'), import('zod'),
]);
