// H-C15 (SPEC §7E.2c) — the SogoAI helper's runOnce over ONE fake fetch: claim → YouTube's player → the track →
// report, whose body carries the CaptionsResult exactly as readCaptions returned it; a 204 claim is idle; the bearer
// goes to the Worker only (never to YouTube) and into no log line. No real network.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runOnce } from '../home/captions-helper';
import { readCaptions } from '../src/worker/youtube-captions';
import { TRACKS, VIDEO_ID, json3, playerAnswer } from './recipe-fakes';

const URL_ = 'https://enso.test';
const TOKEN = 'helper-test-token-never-logged';

interface Heard { url: string; auth: string | null; body: any }

/** The Worker (claims from `claims`, then 204) and YouTube, in one fetch. */
function world(claims: object[], reportStatus = 200) {
  const heard: Heard[] = [];
  const queue = [...claims];
  const f: typeof fetch = async (input, init) => {
    const req = new Request(input, init);
    const text = req.method === 'POST' ? await req.text() : '';
    heard.push({ url: req.url, auth: req.headers.get('authorization'), body: text ? JSON.parse(text) : null });
    const path = new URL(req.url).pathname;
    if (path === '/api/v1/captions/claim') {
      const job = queue.shift();
      return job ? Response.json(job) : new Response(null, { status: 204 });
    }
    if (path === '/api/v1/captions/report') return Response.json(reportStatus === 200 ? { outcome: 'reread' } : { error: 'not_claimed' }, { status: reportStatus });
    if (path === '/youtubei/v1/player') return Response.json(playerAnswer(TRACKS));
    if (path === '/api/timedtext') return new Response(json3('whisk the eggs then fry'));
    throw new Error(`unexpected ${req.url}`);
  };
  return { f, heard };
}

afterEach(() => { vi.restoreAllMocks(); });

const logs = () => {
  const out = vi.spyOn(console, 'log').mockImplementation(() => {});
  const err = vi.spyOn(console, 'error').mockImplementation(() => {});
  return () => [...out.mock.calls, ...err.mock.calls].map((args) => args.map(String).join(' '));
};

describe('H-C15 runOnce', () => {
  it('claim → player → track → report with the CaptionsResult unchanged; then the 204 ends the pass', async () => {
    const lines = logs();
    const { f, heard } = world([{ recipeId: 'rcp_1', videoId: VIDEO_ID }]);
    expect(await runOnce({ fetch: f, url: `${URL_}/`, token: TOKEN })).toBe(1);
    expect(heard.map((h) => new URL(h.url).pathname)).toEqual([
      '/api/v1/captions/claim', '/youtubei/v1/player', '/api/timedtext', '/api/v1/captions/report', '/api/v1/captions/claim',
    ]);
    const expected = await readCaptions(VIDEO_ID, { fetch: world([]).f });
    expect(expected.ok).toBe(true);
    expect(heard[3].body).toEqual({ recipeId: 'rcp_1', result: expected });
    for (const h of heard) {
      expect(h.auth, h.url).toBe(new URL(h.url).host === 'enso.test' ? `Bearer ${TOKEN}` : null);
    }
    const said = lines();
    expect(said).toHaveLength(1); // one line per job
    expect(said[0]).toContain(VIDEO_ID);
    expect(said.join('\n')).not.toContain(TOKEN);
  });

  it('a 204 claim → idle: nothing read, nothing logged', async () => {
    const lines = logs();
    const { f, heard } = world([]);
    expect(await runOnce({ fetch: f, url: URL_, token: TOKEN })).toBe(0);
    expect(heard).toHaveLength(1);
    expect(lines()).toEqual([]);
  });

  it('a refused report is logged and the pass goes on; a failing claim throws (the loop backs off) without the token', async () => {
    const lines = logs();
    const { f } = world([{ recipeId: 'rcp_1', videoId: VIDEO_ID }, { recipeId: 'rcp_2', videoId: VIDEO_ID }], 409);
    expect(await runOnce({ fetch: f, url: URL_, token: TOKEN })).toBe(2);
    expect(lines().filter((l) => l.includes('409'))).toHaveLength(2);
    const down: typeof fetch = async () => new Response('', { status: 503 });
    const err = await runOnce({ fetch: down, url: URL_, token: TOKEN }).catch((e: Error) => e);
    expect(String(err)).toMatch(/503/);
    expect(String(err)).not.toContain(TOKEN);
    expect(lines().join('\n')).not.toContain(TOKEN);
  });
});
