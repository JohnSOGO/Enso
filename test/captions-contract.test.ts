// H-C9 (SPEC §7E.2c) — the wire between the home helper and the Worker: every CaptionsResult readCaptions can
// produce, found by CALLING it over fake fetches (never a hand-typed list), survives JSON and is accepted by
// parseCaptionsReport; and each goes through the helper's handle() and on, over a fake fetch serving handle's
// answer, into the Worker's readCaptionsFromHome, which must accept it. The kinds seen are checked against
// CAPTIONS_FAILURE itself.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readCaptions, type CaptionsResult } from '../src/worker/youtube-captions';
import { parseCaptionsReport } from '../src/shared/recipe-reading';
import { handle } from '../home/captions-helper';
import { readCaptionsFromHome } from '../src/worker/home-captions';
import { CAPTIONS_FAILURE } from '../src/shared/vocab';
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
