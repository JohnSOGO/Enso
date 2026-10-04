// H-C1..H-C3 (SPEC §7E.2c) — the Worker's side of captions from home, home-captions.ts: the configuration, and
// readCaptionsFromHome over a fake fetch (never a real network): one GET with both Access headers, the bearer and
// redirect 'manual'; anything but a read CaptionsResult is an honest failure, never a throw, never a secret.
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { Env } from '../src/worker/env';
import { HOME_CAPTIONS_TIMEOUT_MS, homeCaptionsConfigOf, readCaptionsFromHome, type HomeCaptionsConfig } from '../src/worker/home-captions';
import { CAPTIONS_REPORT_REASON_MAX, TRANSCRIPT_MAX } from '../src/shared/recipe-reading';
import { VIDEO_ID } from './recipe-fakes';

const CFG: HomeCaptionsConfig = { url: 'https://sogoai.test', accessId: 'access-id-x', accessSecret: 'access-secret-y', token: 'bearer-z' };
const SECRETS = [CFG.accessSecret, CFG.token];

interface Seen { req: Request; signal: AbortSignal | null | undefined }

/** A fetch answering every call with `answer` (or throwing it), recording each request. */
function fake(answer: (() => Response) | Error) {
  const seen: Seen[] = [];
  const f: typeof fetch = async (input, init) => {
    seen.push({ req: new Request(input, init), signal: init?.signal });
    if (answer instanceof Error) throw answer;
    return answer();
  };
  return { f, seen };
}

const json = (body: unknown, status = 200) => () => new Response(JSON.stringify(body), { status });

describe('H-C1 homeCaptionsConfigOf', () => {
  const full = { ...(env as unknown as Env), HOME_CAPTIONS_URL: 'https://sogoai.test//', CF_ACCESS_CLIENT_ID: 'id', CF_ACCESS_CLIENT_SECRET: 'secret', CAPTIONS_TOKEN: 'token' };

  it('the pinned test env (Access secrets empty) → null', () => {
    expect(homeCaptionsConfigOf(env as unknown as Env)).toBeNull();
  });

  it('each of the four missing or empty → null; all four → the config, trailing slashes trimmed', () => {
    for (const k of ['HOME_CAPTIONS_URL', 'CF_ACCESS_CLIENT_ID', 'CF_ACCESS_CLIENT_SECRET', 'CAPTIONS_TOKEN'] as const) {
      expect(homeCaptionsConfigOf({ ...full, [k]: '' }), k).toBeNull();
      expect(homeCaptionsConfigOf({ ...full, [k]: undefined }), k).toBeNull();
    }
    expect(homeCaptionsConfigOf(full)).toEqual({ url: 'https://sogoai.test', accessId: 'id', accessSecret: 'secret', token: 'token' });
  });
});

describe('H-C2 readCaptionsFromHome — the request', () => {
  it('one GET to {url}/captions?v= with both Access headers, the bearer, redirect manual and a signal → the text', async () => {
    const { f, seen } = fake(json({ ok: true, text: 'whisk the eggs', language: 'en' }));
    expect(await readCaptionsFromHome(CFG, VIDEO_ID, { fetch: f })).toEqual({ ok: true, text: 'whisk the eggs' });
    expect(seen).toHaveLength(1);
    const { req, signal } = seen[0];
    expect(req.method).toBe('GET');
    expect(req.url).toBe(`https://sogoai.test/captions?v=${VIDEO_ID}`);
    expect(req.headers.get('CF-Access-Client-Id')).toBe(CFG.accessId);
    expect(req.headers.get('CF-Access-Client-Secret')).toBe(CFG.accessSecret);
    expect(req.headers.get('Authorization')).toBe(`Bearer ${CFG.token}`);
    expect(req.redirect).toBe('manual');
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(HOME_CAPTIONS_TIMEOUT_MS).toBe(20_000);
  });

  it('the text is cut to TRANSCRIPT_MAX', async () => {
    const { f } = fake(json({ ok: true, text: 'a'.repeat(TRANSCRIPT_MAX + 50), language: 'en' }));
    const r = await readCaptionsFromHome(CFG, VIDEO_ID, { fetch: f });
    expect(r.ok && r.text.length).toBe(TRANSCRIPT_MAX);
  });
});

describe('H-C3 readCaptionsFromHome — every failure is honest', () => {
  const cases: [string, (() => Response) | Error, RegExp | string][] = [
    ['a 302 (Access refused the service token)', () => new Response(null, { status: 302, headers: { location: 'https://x.cloudflareaccess.com/login' } }), /^HTTP 302: $/],
    ['a 403', () => new Response('Forbidden by Access', { status: 403 }), 'HTTP 403: Forbidden by Access'],
    ['a 502 (nothing listening)', () => new Response('x'.repeat(500), { status: 502 }), `HTTP 502: ${'x'.repeat(200)}`],
    ['a 401 from the helper', json({ error: 'unauthorized' }, 401), 'HTTP 401: {"error":"unauthorized"}'],
    ['a network failure', new Error('connection refused'), 'error: connection refused'],
    ['the timeout', new DOMException('The operation was aborted due to timeout', 'TimeoutError'), /^error: .*timeout/],
    ['a body that is not JSON', () => new Response('<html>tunnel error</html>'), /not JSON/],
    ['JSON that is not a captions result', json({ hello: 1 }), 'result.ok must be true or false.'],
    ['ok with no text', json({ ok: true, text: '  ' }), 'result.text must be non-empty text.'],
    ['the home PC could not read them either', json({ ok: false, kind: 'blocked', reason: 'YouTube said LOGIN_REQUIRED.' }), 'YouTube said LOGIN_REQUIRED.'],
  ];
  for (const [what, answer, reason] of cases) {
    it(what, async () => {
      const { f } = fake(answer);
      const r = await readCaptionsFromHome(CFG, VIDEO_ID, { fetch: f });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      if (typeof reason === 'string') expect(r.reason).toBe(reason);
      else expect(r.reason).toMatch(reason);
      for (const s of SECRETS) expect(r.reason).not.toContain(s);
    });
  }

  it("the home's reason is cut to CAPTIONS_REPORT_REASON_MAX", async () => {
    const { f } = fake(json({ ok: false, kind: 'failed', reason: 'r'.repeat(CAPTIONS_REPORT_REASON_MAX + 9) }));
    const r = await readCaptionsFromHome(CFG, VIDEO_ID, { fetch: f });
    expect(!r.ok && r.reason.length).toBe(CAPTIONS_REPORT_REASON_MAX);
  });
});
