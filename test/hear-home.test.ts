// SY14–SY15 (SPEC §8.18 part 2 ⚑ Q408) — writing a clip down on SogoAI first: POST /say/hear through the real Worker
// with a fake helper (a fetch spy that answers only https://sogoai.test/hear) and a fake Workers AI; and the helper's
// POST /hear over a fake model manager. Fakes only, never a real network.
import { createExecutionContext, env } from 'cloudflare:test';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import worker from '../src/worker/index';
import type { Env } from '../src/worker/env';
import type { SpeechAi } from '../src/worker/speech-to-text';
import { HOME_HEAR_TIMEOUT_MS } from '../src/worker/home-captions';
import { SAY_AUDIO_MAX_BYTES, hotwordsOf, parseHearReport } from '../src/shared/hearing';
import { handle } from '../home/captions-helper';
import { HEAR_TIMEOUT_MS, TRANSCRIBE_URL, hear } from '../home/hear';
import { BASE, Client, owner } from './helpers';
import { homeEnv } from './recipe-fakes';

let o: Client;
beforeAll(async () => { o = await owner(); }, 60_000);
afterEach(() => { vi.restoreAllMocks(); });

const CLIP = new Uint8Array([1, 2, 3, 250]);

/** The helper at sogoai.test answering `answer` (or throwing it); every request recorded. */
function helper(answer: (() => Response) | Error) {
  const seen: { url: URL; req: Request; bytes: number[] }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    if (url.host !== 'sogoai.test' || url.pathname !== '/hear') throw new Error(`a test tried to reach ${url.href}`);
    seen.push({ url, req, bytes: [...new Uint8Array(await req.clone().arrayBuffer())] });
    if (answer instanceof Error) throw answer;
    return answer();
  });
  return seen;
}

function ai(text: string | Error) {
  const calls: string[] = [];
  const a: SpeechAi = { run: async (_m, input) => { calls.push(input.audio); if (text instanceof Error) throw text; return { text }; } };
  return { a, calls };
}

async function hearIt(e: Env) {
  const res = await worker.fetch(new Request(`${BASE}/say/hear`, {
    method: 'POST', body: CLIP, headers: { 'content-type': 'audio/mp4', cookie: o.cookie },
  }), e, createExecutionContext());
  return { status: res.status, json: await res.json<any>() };
}

describe('SY14 POST /say/hear asks SogoAI first', () => {
  it('home answers → its words; one POST with Access, the bearer, the clip and every active name as w; the AI never asked', async () => {
    const seen = helper(() => Response.json({ ok: true, text: ' Roxy needs   a mat. ' }));
    const f = ai('cloud words');
    expect(await hearIt({ ...homeEnv(), AI: f.a })).toEqual({ status: 200, json: { text: 'Roxy needs a mat.' } });
    expect(seen).toHaveLength(1);
    const { url, req, bytes } = seen[0];
    expect(req.method).toBe('POST');
    expect(req.headers.get('CF-Access-Client-Id')).toBe('fake-access-id');
    expect(req.headers.get('Authorization')).toMatch(/^Bearer .+/);
    expect(req.headers.get('Content-Type')).toBe('audio/mp4');
    expect(bytes).toEqual([...CLIP]);
    const names = (await env.DB.prepare('SELECT display_name FROM members WHERE disabled_at IS NULL ORDER BY created_at').all<{ display_name: string }>())
      .results.map((m) => m.display_name);
    expect(url.searchParams.getAll('w')).toEqual(hotwordsOf(names));
    expect(url.searchParams.getAll('w').length).toBeGreaterThan(0);
    expect(f.calls).toHaveLength(0);
    expect(HOME_HEAR_TIMEOUT_MS).toBe(15_000);
  });
  it('home fails (HTTP 500, ok false, no words, a throw) → Workers AI writes it down', async () => {
    for (const answer of [() => new Response('down', { status: 500 }), () => Response.json({ ok: false, reason: 'cpu busy' }),
      () => Response.json({ ok: true, text: '  ' }), new Error('timed out')]) {
      helper(answer);
      const f = ai('Cloud words.');
      expect(await hearIt({ ...homeEnv(), AI: f.a })).toEqual({ status: 200, json: { text: 'Cloud words.' } });
      expect(f.calls).toHaveLength(1);
      vi.restoreAllMocks();
    }
  });
  it('home fails and no AI binding → 502 hear_failed', async () => {
    helper(() => new Response('down', { status: 500 }));
    expect(await hearIt({ ...homeEnv(), AI: undefined })).toMatchObject({ status: 502, json: { error: 'hear_failed' } });
  });
});

describe('SY15 the helper\'s POST /hear', () => {
  const TOKEN = 'helper-token';
  function manager(answer: (() => Response) | Error) {
    const seen: { url: string; headers: Headers; body: any }[] = [];
    const f: typeof fetch = async (input, init) => {
      const req = new Request(input, init);
      seen.push({ url: req.url, headers: req.headers, body: await req.json() });
      if (answer instanceof Error) throw answer;
      return answer();
    };
    return { f, seen };
  }
  const post = (f: typeof fetch, over: { type?: string; body?: Uint8Array | 'too_large'; auth?: string; url?: string } = {}) => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    return handle({ method: 'POST', url: over.url ?? '/hear?w=Roxy&w=Michelle&w=roxy', authorization: over.auth ?? `Bearer ${TOKEN}`,
      contentType: over.type ?? 'audio/webm;codecs=opus', body: over.body ?? CLIP }, { token: TOKEN, fetch: f });
  };

  it('asks the manager once with X-Sogo-App enso, base64, en and the hotwords → the words and usage; the log has no words', async () => {
    const m = manager(() => Response.json({ text: ' Roxy needs a mat ', duration: 2.5, where: 'gamerpc' }));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const r = await handle({ method: 'POST', url: '/hear?w=Roxy&w=Michelle&w=roxy', authorization: `Bearer ${TOKEN}`,
      contentType: 'audio/webm', body: CLIP }, { token: TOKEN, fetch: m.f });
    expect(r).toEqual({ status: 200, body: { ok: true, text: 'Roxy needs a mat',
      usage: { model: 'whisper-large-v3-turbo@gamerpc', ms: expect.any(Number), inputTokens: 0, outputTokens: 0, audioSeconds: 2.5 } } });
    expect(m.seen).toEqual([{ url: TRANSCRIBE_URL, headers: expect.any(Headers),
      body: { audio: btoa(String.fromCharCode(...CLIP)), language: 'en', hotwords: ['Roxy', 'Michelle'] } }]);
    expect(TRANSCRIBE_URL).toBe('http://127.0.0.1:8793/v1/audio/transcriptions');
    expect(m.seen[0].headers.get('x-sogo-app')).toBe('enso');
    expect(HEAR_TIMEOUT_MS).toBeLessThan(HOME_HEAR_TIMEOUT_MS);
    const lines = log.mock.calls.map((a) => a.join(' '));
    expect(lines.some((l) => l.includes('hear 4 bytes → 4 words'))).toBe(true);
    expect(lines.join('\n')).not.toMatch(/Roxy needs/);
  });
  it('401 without the bearer; 400 not audio; 413 too big; 400 empty; nothing asked', async () => {
    const m = manager(() => Response.json({ text: 'x' }));
    expect((await post(m.f, { auth: 'Bearer nope' })).status).toBe(401);
    expect((await post(m.f, { type: 'image/png' })).status).toBe(400);
    expect((await post(m.f, { body: new Uint8Array(SAY_AUDIO_MAX_BYTES + 1) })).status).toBe(413);
    expect((await post(m.f, { body: 'too_large' })).status).toBe(413);
    expect((await post(m.f, { body: new Uint8Array(0) })).status).toBe(400);
    expect(m.seen).toHaveLength(0);
  });
  it('the manager answering 500, no text, or throwing → ok false with the reason (usage once it answered)', async () => {
    expect(await hear(CLIP, [], { fetch: manager(() => new Response('oops', { status: 500 })).f }))
      .toMatchObject({ ok: false, reason: 'manager HTTP 500: oops', usage: { model: 'whisper-large-v3-turbo', audioSeconds: null } });
    expect(await hear(CLIP, [], { fetch: manager(() => Response.json({ text: '', where: 'cpu' })).f }))
      .toMatchObject({ ok: false, reason: 'The manager heard no words.', usage: { model: 'whisper-large-v3-turbo@cpu' } });
    expect(await hear(CLIP, [], { fetch: manager(new Error('refused')).f })).toEqual({ ok: false, reason: 'manager error: refused' });
  });
});

describe('hearing.ts', () => {
  it('hotwordsOf trims, drops empty and repeated (any case), caps', () => {
    expect(hotwordsOf([' Roxy ', 'roxy', '', 'Michelle'])).toEqual(['Roxy', 'Michelle']);
    expect(hotwordsOf(Array.from({ length: 30 }, (_, i) => `n${i}`))).toHaveLength(20);
    expect(hotwordsOf(['x'.repeat(50)])).toEqual(['x'.repeat(40)]);
  });
  it('parseHearReport', () => {
    expect(parseHearReport({ ok: true, text: ' a  b ' })).toEqual({ ok: true, text: 'a b' });
    expect(parseHearReport({ ok: false, reason: ' r ' })).toEqual({ ok: false, reason: 'r' });
    expect(typeof parseHearReport({ ok: true, text: ' ' })).toBe('string');
    expect(typeof parseHearReport(null)).toBe('string');
    expect(typeof parseHearReport({ ok: false })).toBe('string');
  });
});
