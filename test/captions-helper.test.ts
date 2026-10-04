// H-C8 (SPEC §7E.2c) — the SogoAI helper's `handle` over ONE fake fetch (YouTube's player and track; no real
// network, no server): 404 another path, 405 another method, 401 no or a wrong bearer, 400 a bad video id, else
// 200 with the CaptionsResult exactly as readCaptions returned it; YouTube is never asked before the checks pass;
// one log line per request, and the token in none of them.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HOST, PORT, handle } from '../home/captions-helper';
import { readCaptions } from '../src/worker/youtube-captions';
import { TRACKS, VIDEO_ID, json3, playerAnswer } from './recipe-fakes';

const TOKEN = 'helper-test-token-never-logged';

/** YouTube's player and its track, in one fetch, counting each call. */
function youtube() {
  const calls: string[] = [];
  const f: typeof fetch = async (input) => {
    const path = new URL(input instanceof Request ? input.url : String(input)).pathname;
    calls.push(path);
    if (path === '/youtubei/v1/player') return Response.json(playerAnswer(TRACKS));
    if (path === '/api/timedtext') return new Response(json3('whisk the eggs then fry'));
    throw new Error(`unexpected ${path}`);
  };
  return { f, calls };
}

afterEach(() => { vi.restoreAllMocks(); });

const logs = () => {
  const out = vi.spyOn(console, 'log').mockImplementation(() => {});
  const err = vi.spyOn(console, 'error').mockImplementation(() => {});
  return () => [...out.mock.calls, ...err.mock.calls].map((args) => args.map(String).join(' '));
};

const ask = (over: { method?: string; url?: string; authorization?: string | null } = {}, f = youtube().f) => handle({
  method: over.method ?? 'GET', url: over.url ?? `/captions?v=${VIDEO_ID}`,
  ...(over.authorization === null ? {} : { authorization: over.authorization ?? `Bearer ${TOKEN}` }),
}, { token: TOKEN, fetch: f });

describe('H-C8 handle', () => {
  it('listens on 127.0.0.1:8790 — loopback only, never 0.0.0.0', () => {
    expect([HOST, PORT]).toEqual(['127.0.0.1', 8790]);
  });

  it('a good request → 200 with the CaptionsResult exactly as readCaptions returned it', async () => {
    const lines = logs();
    const yt = youtube();
    const r = await ask({}, yt.f);
    expect(r.status).toBe(200);
    expect(r.body).toEqual(await readCaptions(VIDEO_ID, { fetch: youtube().f }));
    expect((r.body as { ok: boolean }).ok).toBe(true);
    expect(yt.calls).toEqual(['/youtubei/v1/player', '/api/timedtext']);
    const said = lines();
    expect(said).toHaveLength(1);
    expect(said[0]).toContain(VIDEO_ID);
  });

  it('a failure from YouTube is still 200, the result as it came', async () => {
    logs();
    const blocked: typeof fetch = async () => Response.json(playerAnswer(undefined, 'LOGIN_REQUIRED'));
    const r = await ask({}, blocked);
    expect(r).toEqual({ status: 200, body: await readCaptions(VIDEO_ID, { fetch: blocked }) });
    expect((r.body as { kind: string }).kind).toBe('blocked');
  });

  it('401 with no bearer, a wrong one, another scheme; 400 a bad or missing v; 404 another path; 405 another method — YouTube never asked', async () => {
    const lines = logs();
    const yt = youtube();
    const cases: [Parameters<typeof ask>[0], number][] = [
      [{ authorization: null }, 401],
      [{ authorization: 'Bearer wrong' }, 401],
      [{ authorization: `Bearer ${TOKEN}x` }, 401],
      [{ authorization: TOKEN }, 401],
      [{ url: '/captions' }, 400],
      [{ url: '/captions?v=' }, 400],
      [{ url: '/captions?v=not%20an%20id' }, 400],
      [{ url: `/captions?v=${'a'.repeat(65)}` }, 400],
      [{ url: `/other?v=${VIDEO_ID}` }, 404],
      [{ url: '/' }, 404],
      [{ method: 'POST' }, 405],
      [{ method: 'DELETE' }, 405],
    ];
    for (const [over, status] of cases) {
      const r = await ask(over, yt.f);
      expect(r.status, JSON.stringify(over)).toBe(status);
      expect(r.body).toHaveProperty('error');
    }
    expect(yt.calls).toEqual([]);
    const said = lines();
    expect(said).toHaveLength(cases.length); // one line per request
    expect(said.join('\n')).not.toContain(TOKEN);
  });

  it('the token is in no log line, whatever comes back', async () => {
    const lines = logs();
    await ask();
    await ask({ authorization: `Bearer ${TOKEN}-nope` });
    await ask({}, async () => { throw new Error(`network down ${'x'}`); });
    expect(lines().length).toBe(3);
    expect(lines().join('\n')).not.toContain(TOKEN);
  });
});

// SN13 (SPEC §7A.3) — POST /identify on the same helper: 405 another method, 401 no or a wrong bearer, 400 not an
// image or an empty body, 413 a body past the cap (as main() marks it), else 200 with identify's report as it came;
// LM Studio is never asked before the checks pass; one log line per request, never the token.
describe('SN13 handle /identify', () => {
  const PHOTO = new Uint8Array([0xff, 0xd8, 0xff, 9, 9]);
  /** A fake LM Studio, counting calls. */
  function lmStudio(content = 'Heinz Tomato Ketchup 32 oz') {
    const calls: string[] = [];
    const f: typeof fetch = async (input) => {
      calls.push(input instanceof Request ? input.url : String(input));
      return Response.json({ choices: [{ message: { content } }] });
    };
    return { f, calls };
  }
  type Over = { method?: string; authorization?: string | null; contentType?: string; body?: Uint8Array | 'too_large' };
  const identifyReq = (over: Over = {}, f = lmStudio().f, model: string | undefined = 'qwen-uncensored') => handle({
    method: over.method ?? 'POST', url: '/identify', contentType: over.contentType ?? 'image/jpeg', body: over.body ?? PHOTO,
    ...(over.authorization === null ? {} : { authorization: over.authorization ?? `Bearer ${TOKEN}` }),
  }, { token: TOKEN, fetch: f, model });

  it('a good request → 200 with the report as identify made it; one log line naming what came back', async () => {
    const lines = logs();
    const lm = lmStudio();
    const r = await identifyReq({}, lm.f);
    expect(r).toEqual({ status: 200, body: { ok: true, text: 'Heinz Tomato Ketchup 32 oz' } });
    expect(lm.calls).toEqual(['http://127.0.0.1:1234/v1/chat/completions']);
    const said = lines();
    expect(said).toHaveLength(1);
    expect(said[0]).toContain('Heinz Tomato Ketchup');
  });

  it('IDENTIFY_MODEL unset → 200 with an off report, LM Studio never asked', async () => {
    logs();
    const lm = lmStudio();
    const r = await identifyReq({}, lm.f, ''); // main() passes undefined for an unset or empty IDENTIFY_MODEL
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: false, kind: 'off' });
    expect(lm.calls).toEqual([]);
  });

  it('405 / 401 / 400 / 413 in that order — LM Studio never asked; the token in no log line', async () => {
    const lines = logs();
    const lm = lmStudio();
    const cases: [Over, number][] = [
      [{ method: 'GET' }, 405],
      [{ method: 'PUT', authorization: null }, 405],
      [{ authorization: null }, 401],
      [{ authorization: 'Bearer wrong', contentType: 'text/plain' }, 401],
      [{ authorization: TOKEN }, 401],
      [{ contentType: 'text/plain' }, 400],
      [{ contentType: '' }, 400],
      [{ contentType: 'application/json', body: 'too_large' }, 400],
      [{ body: 'too_large' }, 413],
      [{ contentType: 'image/png; charset=binary', body: 'too_large' }, 413],
      [{ body: new Uint8Array() }, 400],
    ];
    for (const [over, status] of cases) {
      const r = await identifyReq(over, lm.f);
      expect(r.status, JSON.stringify(over)).toBe(status);
      expect(r.body).toHaveProperty('error');
    }
    expect(lm.calls).toEqual([]);
    const said = lines();
    expect(said).toHaveLength(cases.length);
    expect(said.join('\n')).not.toContain(TOKEN);
  });
});
