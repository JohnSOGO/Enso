// NA6 (SPEC §8.4a) — POST /notes/marks through the real Worker: signed out → 401; blank or too long → 400; no helper
// settings → patterns 'unset'; SogoAI's marks → only the ones that stand; SogoAI busy or failing → patterns with why
// and reason; 200 every time. A fake helper at the pinned https://sogoai.test; a fetch spy refuses every other host.
import { SELF, createExecutionContext } from 'cloudflare:test';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import worker from '../src/worker/index';
import type { Env } from '../src/worker/env';
import { NOTE_MARKS_TEXT_MAX } from '../src/shared/note-marks';
import { BASE, Client, owner } from './helpers';
import { homeEnv, keyedEnv } from './recipe-fakes';

let o: Client;
beforeAll(async () => { o = await owner(); }, 60_000);
afterEach(() => { vi.restoreAllMocks(); });

type Reply = { status?: number; body: object | string };
const NOTES = "Gate code 4471.\nSam's allergy is peanuts.";

/** POST /notes/marks with `e`, the fake helper answering `home`. */
async function ask(e: Env, home: Reply | null, body: unknown = { text: NOTES }) {
  const heard: { host: string; path: string; auth: string | null; body: string }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    heard.push({ host: url.host, path: url.pathname, auth: req.headers.get('authorization'), body: await req.text() });
    if (url.host !== 'sogoai.test' || url.pathname !== '/note-marks' || !home) throw new Error(`no fake for ${url.host}${url.pathname}`);
    return new Response(typeof home.body === 'string' ? home.body : JSON.stringify(home.body), { status: home.status ?? 200 });
  });
  const res = await worker.fetch(new Request(`${BASE}/notes/marks`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: o.cookie }, body: JSON.stringify(body),
  }), e, createExecutionContext());
  return { status: res.status, json: await res.json<any>(), heard };
}

describe('NA6 POST /notes/marks', () => {
  it('signed out → 401', async () => {
    const res = await SELF.fetch(`${BASE}/notes/marks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"text":"x"}' });
    expect(res.status).toBe(401);
  });

  it('blank or over the cap → 400, nothing asked', async () => {
    for (const text of ['', '   ', 'x'.repeat(NOTE_MARKS_TEXT_MAX + 1), 42]) {
      const r = await ask(homeEnv(), null, { text });
      expect(r.status, String(text).slice(0, 10)).toBe(400);
      expect(r.heard).toHaveLength(0);
    }
  });

  it("no helper settings → patterns, 'unset', nothing asked", async () => {
    const r = await ask(keyedEnv(), null);
    expect(r).toMatchObject({ status: 200, json: { via: 'patterns', why: 'unset' } });
    expect(r.heard).toHaveLength(0);
  });

  it('SogoAI answers → via sogoai with only the marks that stand; one POST with the bearer and the notes', async () => {
    const r = await ask(homeEnv(), { body: { ok: true, marks: [
      { text: 'Gate code 4471', kind: 'key' },
      { text: "Sam's allergy is peanuts", kind: 'key' },
      { text: 'Grandma drives', kind: 'key' }, // not in the notes
      { text: '4471.\nSam', kind: 'key' }, // across a line
    ] } });
    expect(r).toMatchObject({ status: 200, json: { via: 'sogoai', marks: [
      { text: 'Gate code 4471', kind: 'key' }, { text: "Sam's allergy is peanuts", kind: 'key' },
    ] } });
    expect(r.heard.map((h) => `${h.host}${h.path}`)).toEqual(['sogoai.test/note-marks']);
    expect(r.heard[0].auth).toMatch(/^Bearer .+/);
    expect(JSON.parse(r.heard[0].body)).toEqual({ text: NOTES });
  });

  it('SogoAI busy, failing or unreachable → patterns with why and reason, 200', async () => {
    const cases: [Reply, string][] = [
      [{ body: { ok: false, kind: 'busy', reason: "photo-polish isn't loaded in LM Studio." } }, 'busy'],
      [{ body: { ok: false, kind: 'off', reason: "IDENTIFY_MODEL isn't set on SogoAI." } }, 'off'],
      [{ status: 502, body: 'bad gateway' }, 'failed'],
      [{ body: 'not json' }, 'failed'],
      [{ body: { ok: 'maybe' } }, 'failed'],
    ];
    for (const [home, why] of cases) {
      const r = await ask(homeEnv(), home);
      expect(r.status).toBe(200);
      expect(r.json, JSON.stringify(home)).toMatchObject({ via: 'patterns', why });
      expect(r.json.reason.length).toBeGreaterThan(0);
    }
  });
});
