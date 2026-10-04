// H-C9 (SPEC §7E.2c) — the wire between the home helper and the Worker: every CaptionsResult readCaptions can
// produce, found by CALLING it over fake fetches (never a hand-typed list), survives JSON and is accepted by
// parseCaptionsReport; and each goes through the helper's handle() and on, over a fake fetch serving handle's
// answer, into the Worker's readCaptionsFromHome, which must accept it. The kinds seen are checked against
// CAPTIONS_FAILURE itself.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readCaptions, type CaptionsResult } from '../src/worker/youtube-captions';
import { parseCaptionsReport } from '../src/shared/recipe-reading';
import { handle } from '../home/captions-helper';
import { identifyFromHome, readCaptionsFromHome } from '../src/worker/home-captions';
import { CAPTIONS_FAILURE, IDENTIFY_FAILURE } from '../src/shared/vocab';
import { identify } from '../home/identify';
import { parseIdentifyReport } from '../src/shared/item-reading';
import { TRACKS, VIDEO_ID, json3, playerAnswer } from './recipe-fakes';

type Answer = { status?: number; body: string | object } | 'throw';

/** A fetch answering the player, then the caption track. */
const fakeFetch = (player: Answer, track: Answer = { body: json3('whisk the eggs then fry') }): typeof fetch => async (input) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const a = url.pathname === '/youtubei/v1/player' ? player : url.pathname === '/api/timedtext' ? track : null;
  if (!a) throw new Error(`unexpected ${url}`);
  if (a === 'throw') throw new Error('connection refused');
  return new Response(typeof a.body === 'string' ? a.body : JSON.stringify(a.body), { status: a.status ?? 200 });
};

const WORLDS: [string, typeof fetch][] = [
  ['captions read', fakeFetch({ body: playerAnswer(TRACKS) })],
  ['the player refuses (403)', fakeFetch({ status: 403, body: '' })],
  ['LOGIN_REQUIRED', fakeFetch({ body: playerAnswer(undefined, 'LOGIN_REQUIRED') })],
  ['an empty caption file', fakeFetch({ body: playerAnswer(TRACKS) }, { body: '' })],
  ['no captions', fakeFetch({ body: playerAnswer() })],
  ['the player 500s', fakeFetch({ status: 500, body: '' })],
  ['the network fails', fakeFetch('throw')],
  ['a track with no text', fakeFetch({ body: playerAnswer(TRACKS) }, { body: json3('') })],
  ['the track 429s', fakeFetch({ body: playerAnswer(TRACKS) }, { status: 429, body: '' })],
];

afterEach(() => { vi.restoreAllMocks(); });

describe('H-C9 readCaptions → JSON → parseCaptionsReport', () => {
  it('every result readCaptions produces is accepted, unchanged in meaning', async () => {
    const results: CaptionsResult[] = [];
    for (const [, f] of WORLDS) results.push(await readCaptions(VIDEO_ID, { fetch: f }));
    const seen = new Set(results.map((r) => (r.ok ? 'ok' : r.kind)));
    expect([...seen].sort(), 'the fakes must reach every outcome').toEqual(['ok', ...CAPTIONS_FAILURE].sort());
    for (const r of results) {
      const parsed = parseCaptionsReport(JSON.parse(JSON.stringify(r)));
      expect(typeof parsed, JSON.stringify(r)).toBe('object');
      expect(parsed).toEqual(r.ok ? { ok: true, text: r.text } : { ok: false, kind: r.kind, reason: r.reason });
    }
  });
});

describe('H-C9 readCaptions → handle() → the wire → readCaptionsFromHome', () => {
  it("every result handle answers with is accepted by the Worker's side", async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const token = 'contract-token';
    const cfg = { url: 'https://sogoai.test', accessId: 'id', accessSecret: 'secret', token };
    const kinds = new Set<string>();
    for (const [what, youtube] of WORLDS) {
      const result = await readCaptions(VIDEO_ID, { fetch: youtube });
      kinds.add(result.ok ? 'ok' : result.kind);
      // The tunnel, faked: the Worker's request becomes handle()'s, and handle()'s answer goes back as JSON.
      const tunnel: typeof fetch = async (input, init) => {
        const req = new Request(input, init);
        const u = new URL(req.url);
        const answer = await handle(
          { method: req.method, url: `${u.pathname}${u.search}`, authorization: req.headers.get('authorization') ?? undefined },
          { token, fetch: youtube },
        );
        return new Response(JSON.stringify(answer.body), { status: answer.status });
      };
      const got = await readCaptionsFromHome(cfg, VIDEO_ID, { fetch: tunnel });
      expect(got, what).toEqual(result.ok ? { ok: true, text: result.text } : { ok: false, reason: result.reason });
    }
    expect([...kinds].sort(), 'the fakes must reach every outcome').toEqual(['ok', ...CAPTIONS_FAILURE].sort());
  });
});

// SN15 (SPEC §7A.3) — the same wire for POST /identify: every report identify() can produce, found by CALLING it over
// fake LM Studio answers (and without a model), goes through handle() and the faked tunnel into the Worker's
// identifyFromHome, which must accept it. The kinds seen are checked against IDENTIFY_FAILURE itself.
describe('SN15 identify → handle() → the wire → identifyFromHome', () => {
  const PHOTO = new Uint8Array([0xff, 0xd8, 0xff, 4, 2]);
  const lm = (answer: (() => Response) | 'throw'): typeof fetch => async () => {
    if (answer === 'throw') throw new Error('connect ECONNREFUSED 127.0.0.1:1234');
    return answer();
  };
  const chat = (content: unknown) => () => Response.json({ choices: [{ message: { content } }] });
  const LM_WORLDS: [string, typeof fetch, string | undefined][] = [
    ['a name', lm(chat('Heinz Tomato Ketchup 32 oz')), 'qwen-uncensored'],
    ['UNKNOWN', lm(chat('UNKNOWN')), 'qwen-uncensored'],
    ['a thinking block, then a name', lm(chat('<think>\n\n</think>\n\nDawn dish soap')), 'qwen-uncensored'],
    ['an empty answer', lm(chat('')), 'qwen-uncensored'],
    ['no model set', lm(chat('x')), undefined],
    ['LM Studio is down', lm('throw'), 'qwen-uncensored'],
    ['LM Studio 500s', lm(() => new Response('x'.repeat(400), { status: 500 })), 'qwen-uncensored'],
    ['an unexpected shape', lm(() => Response.json({ nope: 1 })), 'qwen-uncensored'],
  ];

  it("every report handle answers /identify with is accepted by the Worker's side", async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const token = 'contract-token';
    const cfg = { url: 'https://sogoai.test', accessId: 'id', accessSecret: 'secret', token };
    const kinds = new Set<string>();
    for (const [what, lmFetch, model] of LM_WORLDS) {
      const report = await identify(PHOTO, 'image/jpeg', { model, fetch: lmFetch });
      kinds.add(report.ok ? 'ok' : report.kind);
      const tunnel: typeof fetch = async (input, init) => {
        const req = new Request(input, init);
        const u = new URL(req.url);
        const answer = await handle({
          method: req.method, url: `${u.pathname}${u.search}`, authorization: req.headers.get('authorization') ?? undefined,
          contentType: req.headers.get('content-type') ?? undefined, body: new Uint8Array(await req.arrayBuffer()),
        }, { token, fetch: lmFetch, model });
        return new Response(JSON.stringify(answer.body), { status: answer.status });
      };
      const got = await identifyFromHome(cfg, PHOTO.slice().buffer as ArrayBuffer, 'image/jpeg', { fetch: tunnel });
      const parsed = parseIdentifyReport(JSON.parse(JSON.stringify(report)));
      expect(typeof parsed, what).toBe('object');
      expect(got, what).toEqual(report.ok ? { ok: true, text: report.text } : { ok: false, reason: (parsed as { reason: string }).reason });
    }
    expect([...kinds].sort(), 'the fakes must reach every outcome').toEqual(['ok', ...IDENTIFY_FAILURE].sort());
  });
});
