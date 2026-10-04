// M4o R12 + M4q R15 (SPEC §7E.2) — youtube.ts (video and comments), youtube-captions.ts and recipe-reader.ts over injected fetches with
// canned answers. Nothing here reaches the network: every fetch is a local function.
import { beforeAll, describe, expect, it } from 'vitest';
import { lookUpComments, lookUpVideo } from '../src/worker/youtube';
import { readCaptions } from '../src/worker/youtube-captions';
import { readRecipe } from '../src/worker/recipe-reader';
import { COMMENTS_LOOKED_AT, TRANSCRIPT_MAX } from '../src/shared/recipe-reading';
import { CAPTIONS_FAILURE } from '../src/shared/vocab';
import {
  CHANNEL_ID, TRACKS, VIDEO_ID, YT_KEY, claudeMessage, commentsAnswer, json3, videoAnswer, warmClaude, playerAnswer,
} from './recipe-fakes';

type Answer = { status?: number; body: string | object } | 'throw';
/** A fetch answering in order, recording each URL (and JSON body). */
function scripted(...answers: Answer[]) {
  const seen: { url: string; body: any }[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const text = req.method === 'POST' ? await req.text() : '';
    seen.push({ url: req.url, body: text ? JSON.parse(text) : null });
    const a = answers.shift();
    if (!a) throw new Error(`unexpected request to ${req.url}`);
    if (a === 'throw') throw new Error(`network down while fetching ${req.url}`);
    const json = typeof a.body !== 'string';
    return new Response(json ? JSON.stringify(a.body) : (a.body as string), {
      status: a.status ?? 200, headers: { 'content-type': json ? 'application/json' : 'text/plain' },
    });
  }) as typeof fetch;
  return { f, seen };
}

describe('youtube.ts — videos.list?part=snippet', () => {
  it('asks for one id with the key, and returns title / channel / channelId / description', async () => {
    const { f, seen } = scripted({ body: videoAnswer({ title: 'Best Pancakes', channelTitle: 'Chef', description: '2 eggs' }) });
    expect(await lookUpVideo(VIDEO_ID, YT_KEY, { fetch: f }))
      .toEqual({ ok: true, title: 'Best Pancakes', channel: 'Chef', channelId: CHANNEL_ID, description: '2 eggs' });
    const u = new URL(seen[0].url);
    expect(`${u.host}${u.pathname}`).toBe('www.googleapis.com/youtube/v3/videos');
    expect(Object.fromEntries(u.searchParams)).toEqual({ part: 'snippet', id: VIDEO_ID, key: YT_KEY });
  });

  it('an empty description is null, not ""; a missing channelId is null', async () => {
    const { f } = scripted({ body: videoAnswer({ title: 'T', channelTitle: 'C', description: '', channelId: undefined }) });
    expect(await lookUpVideo(VIDEO_ID, YT_KEY, { fetch: f })).toMatchObject({ ok: true, description: null, channelId: null });
  });

  it('no items → not_found; 403 quotaExceeded → quota; 400 / network → failed; the key is never in a reason', async () => {
    expect(await lookUpVideo(VIDEO_ID, YT_KEY, { fetch: scripted({ body: videoAnswer(null) }).f })).toMatchObject({ ok: false, kind: 'not_found' });
    const quota = { status: 403, body: { error: { code: 403, message: 'quota', errors: [{ reason: 'quotaExceeded' }] } } };
    expect(await lookUpVideo(VIDEO_ID, YT_KEY, { fetch: scripted(quota).f })).toMatchObject({ ok: false, kind: 'quota' });
    const bad = { status: 400, body: { error: { code: 400, message: `API key not valid: ${YT_KEY}`, errors: [{ reason: 'badRequest' }] } } };
    const r1 = await lookUpVideo(VIDEO_ID, YT_KEY, { fetch: scripted(bad).f });
    const r2 = await lookUpVideo(VIDEO_ID, YT_KEY, { fetch: scripted('throw').f });
    for (const r of [r1, r2]) {
      expect(r).toMatchObject({ ok: false, kind: 'failed' });
      expect(JSON.stringify(r)).not.toContain(YT_KEY);
    }
    expect((r1 as any).reason).toMatch(/400/);
  });
});

describe('R15 youtube.ts — commentThreads.list (the creator\'s comments)', () => {
  it('asks for the threads by relevance as plain text, and returns each top-level comment with its author', async () => {
    const { f, seen } = scripted({ body: commentsAnswer([[CHANNEL_ID, 'Recipe: 2 eggs'], ['UC_viewer', 'Yum'], [null, 'anon']]) });
    expect(await lookUpComments(VIDEO_ID, YT_KEY, COMMENTS_LOOKED_AT, { fetch: f })).toEqual({
      ok: true, comments: [
        { authorChannelId: CHANNEL_ID, text: 'Recipe: 2 eggs' }, { authorChannelId: 'UC_viewer', text: 'Yum' }, { authorChannelId: null, text: 'anon' },
      ],
    });
    const u = new URL(seen[0].url);
    expect(`${u.host}${u.pathname}`).toBe('www.googleapis.com/youtube/v3/commentThreads');
    expect(Object.fromEntries(u.searchParams)).toEqual({
      part: 'snippet', videoId: VIDEO_ID, order: 'relevance', maxResults: String(COMMENTS_LOOKED_AT), textFormat: 'plainText', key: YT_KEY,
    });
    expect(await lookUpComments(VIDEO_ID, YT_KEY, 20, { fetch: scripted({ body: commentsAnswer() }).f })).toEqual({ ok: true, comments: [] });
  });

  it('403 commentsDisabled → none; 403 quotaExceeded → quota; 500 / network → failed; the key is never in a reason', async () => {
    const answer = (status: number, reason: string, message = reason) =>
      ({ status, body: { error: { code: status, message, errors: [{ reason }] } } });
    const off = await lookUpComments(VIDEO_ID, YT_KEY, 20, { fetch: scripted(answer(403, 'commentsDisabled')).f });
    const quota = await lookUpComments(VIDEO_ID, YT_KEY, 20, { fetch: scripted(answer(403, 'quotaExceeded')).f });
    const broken = await lookUpComments(VIDEO_ID, YT_KEY, 20, { fetch: scripted(answer(500, 'backendError', `oops ${YT_KEY}`)).f });
    const down = await lookUpComments(VIDEO_ID, YT_KEY, 20, { fetch: scripted('throw').f });
    expect(off).toMatchObject({ ok: false, kind: 'none' });
    expect(quota).toMatchObject({ ok: false, kind: 'quota' });
    expect(broken).toMatchObject({ ok: false, kind: 'failed', reason: expect.stringMatching(/500/) });
    expect(down).toMatchObject({ ok: false, kind: 'failed' });
    for (const r of [off, quota, broken, down]) {
      expect((r as any).reason).toBeTruthy();
      expect(JSON.stringify(r)).not.toContain(YT_KEY);
    }
  });
});

describe('youtube-captions.ts — the unofficial attempt', () => {
  it('reads the English track written by a person, as json3, into one line of text', async () => {
    const { f, seen } = scripted({ body: playerAnswer(TRACKS) }, { body: json3('Add 2 cups of flour.', 'Then  whisk the eggs.') });
    expect(await readCaptions(VIDEO_ID, { fetch: f })).toEqual({ ok: true, text: 'Add 2 cups of flour. Then whisk the eggs.', language: 'en' });
    expect(new URL(seen[0].url).pathname).toBe('/youtubei/v1/player');
    expect(seen[0].body).toMatchObject({ videoId: VIDEO_ID, context: { client: { clientName: 'ANDROID' } } });
    const track = new URL(seen[1].url);
    expect(track.searchParams.get('lang')).toBe('en');
    expect(track.searchParams.get('kind')).toBeNull();
    expect(track.searchParams.get('fmt')).toBe('json3');
  });

  it('falls back to auto-captions, and reads timedtext XML with entities', async () => {
    const xml = '<?xml version="1.0"?><transcript><text start="0" dur="2">Mix &amp;amp; stir</text><text start="2">it&#39;s &lt;done&gt;</text></transcript>';
    const { f } = scripted({ body: playerAnswer([TRACKS[0], TRACKS[1]]) }, { body: xml });
    expect(await readCaptions(VIDEO_ID, { fetch: f })).toEqual({ ok: true, text: "Mix & stir it's <done>", language: 'en' });
  });

  it('honest failures, each a CAPTIONS_FAILURE with a reason — and it never throws', async () => {
    const cases: [Answer[], string][] = [
      [[{ status: 429, body: 'Too many' }], 'blocked'],
      [[{ body: playerAnswer(undefined, 'LOGIN_REQUIRED') }], 'blocked'], // a bot check
      [[{ body: playerAnswer(TRACKS, 'UNPLAYABLE') }], 'blocked'],
      [[{ body: playerAnswer(TRACKS) }, { body: '' }], 'blocked'],
      [[{ body: playerAnswer(TRACKS) }, { status: 403, body: '' }], 'blocked'],
      [[{ body: playerAnswer() }], 'none'],
      [[{ body: playerAnswer([]) }], 'none'],
      [[{ status: 500, body: 'oops' }], 'failed'],
      [['throw'], 'failed'],
      [[{ body: playerAnswer(TRACKS) }, { body: '{"events": []}' }], 'failed'],
      [[{ body: playerAnswer(TRACKS) }, { body: '{not json' }], 'failed'],
      [[{ body: playerAnswer([{ baseUrl: 'https://evil.example/x', languageCode: 'en' }]) }], 'failed'],
      [[{ body: '{not json' }], 'failed'], // a broken player answer
    ];
    for (const [answers, kind] of cases) {
      const r = await readCaptions(VIDEO_ID, { fetch: scripted(...answers).f });
      expect(r, JSON.stringify(answers).slice(0, 80)).toMatchObject({ ok: false, kind });
      expect(CAPTIONS_FAILURE).toContain((r as any).kind);
      expect((r as any).reason).toBeTruthy();
    }
  });
});

describe('recipe-reader.ts — the Claude request', () => {
  beforeAll(warmClaude, 60_000);
  const input = { apiKey: 'test-key', title: 'Best Pancakes', channel: 'Chef', description: '2 eggs, 1 cup milk', transcript: 'w'.repeat(TRANSCRIPT_MAX + 500), comments: 'Pinned: bake 20 min' };

  it('sends the video text (captions cut to TRANSCRIPT_MAX), forbids inventing, and asks for the schema', async () => {
    const answer = { found: true, title: 'Pancakes', ingredients: ['2 eggs'], steps: ['Mix'], servings: null, time: null };
    const { f, seen } = scripted({ body: claudeMessage(answer) });
    expect(await readRecipe(input, { fetch: f })).toEqual({ ok: true, raw: answer });
    const { body } = seen[0];
    expect(body.model).toBe('claude-opus-5-5');
    const [videoText, prompt] = body.messages[0].content;
    expect(videoText.text).toContain('Best Pancakes');
    expect(videoText.text).toContain('2 eggs, 1 cup milk');
    expect(videoText.text).toContain('w'.repeat(TRANSCRIPT_MAX));
    expect(videoText.text).not.toContain('w'.repeat(TRANSCRIPT_MAX + 1));
    expect(videoText.text).toContain("Creator's comments:\nPinned: bake 20 min");
    expect(prompt.text).toMatch(/Never invent a recipe from the video's title/);
    expect(prompt.text).toMatch(/creator's comments/);
    expect(prompt.text).toMatch(/found false/);
    const none = scripted({ body: claudeMessage(answer) });
    await readRecipe({ ...input, comments: null }, { fetch: none.f });
    expect(none.seen[0].body.messages[0].content[0].text).toContain("Creator's comments:\n(none)");
    const schema = body.output_config.format.schema;
    for (const k of ['found', 'title', 'ingredients', 'steps', 'servings', 'time']) expect(schema.required, k).toContain(k);
  });

  it('a refusal → refused; an API error → failed with the reason', async () => {
    const refusal = claudeMessage(null, { stop_reason: 'refusal', stop_details: { type: 'refusal', category: null, explanation: 'No.' } });
    expect(await readRecipe(input, { fetch: scripted({ body: refusal }).f })).toEqual({ ok: false, kind: 'refused', reason: 'No.' });
    const err = { status: 400, body: { type: 'error', error: { type: 'invalid_request_error', message: 'too long' } } };
    expect(await readRecipe(input, { fetch: scripted(err).f })).toMatchObject({ ok: false, kind: 'failed', reason: expect.stringMatching(/400.*too long/) });
  });
});
