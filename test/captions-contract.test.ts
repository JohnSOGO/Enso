// H-C14 (SPEC §7E.2c) — the wire between the home helper and the Worker: every CaptionsResult readCaptions can
// produce, found by CALLING it over fake fetches (never a hand-typed list), survives JSON and is accepted by
// parseCaptionsReport. The kinds seen are checked against CAPTIONS_FAILURE itself.
import { describe, expect, it } from 'vitest';
import { readCaptions, type CaptionsResult } from '../src/worker/youtube-captions';
import { parseCaptionsReport } from '../src/shared/recipe-reading';
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

describe('H-C14 readCaptions → JSON → parseCaptionsReport', () => {
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
