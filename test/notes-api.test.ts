// NA6, NA8 (SPEC §8.4a) — POST /notes/marks through the real Worker: signed out → 401; blank or too long → 400; no
// helper settings → patterns 'unset'; SogoAI's marks → only the ones that stand; SogoAI busy or failing → patterns with
// why and reason; 200 every time. NA8: an answer with marks is remembered by the text's hash and answers again with no
// home call; empty answers, failures and changed texts ask again; old rows are pruned; a bad row is a miss. A fake helper at the pinned https://sogoai.test; a fetch spy refuses every other host.
import { SELF, createExecutionContext, env } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/worker/index';
import type { Env } from '../src/worker/env';
import { NOTE_MARKS_KEEP_DAYS, NOTE_MARKS_TEXT_MAX } from '../src/shared/note-marks';
import { sha256hex } from '../src/worker/session';
import { noteMarksKey } from '../src/worker/note-marks-rows';
import { BASE, Client, owner } from './helpers';
import { homeEnv, keyedEnv } from './recipe-fakes';

let o: Client;
beforeAll(async () => { o = await owner(); }, 60_000);
beforeEach(async () => { await env.DB.exec('DELETE FROM note_marks'); });
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

describe('NA8 remembered highlights', () => {
  const MARKED = { body: { ok: true, marks: [{ text: 'Gate code 4471', kind: 'key' }] } };
  const rows = async () => (await env.DB.prepare('SELECT COUNT(*) AS n FROM note_marks').first<{ n: number }>())!.n;

  it('an answer with marks is remembered; the same text answers again with no call to the home, even with no helper settings', async () => {
    const first = await ask(homeEnv(), MARKED, { text: 'NA8 one. Gate code 4471.' });
    expect(first.json).toEqual({ via: 'sogoai', marks: [{ text: 'Gate code 4471', kind: 'key' }] });
    expect(await rows()).toBe(1);
    for (const e of [homeEnv(), keyedEnv()]) {
      const again = await ask(e, null, { text: 'NA8 one. Gate code 4471.' });
      expect(again.json).toEqual(first.json);
      expect(again.heard).toHaveLength(0);
    }
  });

  it('an empty answer and a failure are not remembered; a changed text asks again', async () => {
    await ask(homeEnv(), { body: { ok: true, marks: [] } }, { text: 'NA8 two, nothing here.' });
    await ask(homeEnv(), { body: { ok: false, kind: 'busy', reason: 'busy' } }, { text: 'NA8 three. Gate code 4471.' });
    expect(await rows()).toBe(0);
    await ask(homeEnv(), MARKED, { text: 'NA8 four. Gate code 4471.' });
    const changed = await ask(homeEnv(), MARKED, { text: 'NA8 four. Gate code 4471!' });
    expect(changed.heard).toHaveLength(1);
    expect(await rows()).toBe(2);
  });

  it(`a row stored over ${NOTE_MARKS_KEEP_DAYS} days ago is gone after the next store`, async () => {
    await env.DB.prepare('INSERT INTO note_marks (text_hash, marks, created_at) VALUES (?, ?, ?)')
      .bind('old', '[{"text":"x","kind":"key"}]', '2020-01-01T00:00:00.000Z').run();
    await ask(homeEnv(), MARKED, { text: 'NA8 five. Gate code 4471.' });
    expect(await env.DB.prepare("SELECT text_hash FROM note_marks WHERE text_hash = 'old'").first()).toBeNull();
    expect(await rows()).toBe(1);
  });

  it('a stored row whose marks no longer stand (or bad JSON) is a miss and asks the home', async () => {
    for (const [i, marks] of ['[{"text":"Grandma drives","kind":"key"}]', 'not json'].entries()) {
      const text = `NA8 six ${i}. Gate code 4471.`;
      await env.DB.prepare('INSERT INTO note_marks (text_hash, marks, created_at) VALUES (?, ?, ?)')
        .bind(await noteMarksKey(text), marks, new Date().toISOString()).run();
      const r = await ask(homeEnv(), MARKED, { text });
      expect(r.heard, marks).toHaveLength(1);
      expect(r.json.marks).toEqual([{ text: 'Gate code 4471', kind: 'key' }]);
    }
  });

  it('a good row keyed by the text alone (a different asking, Q375) is a miss and asks the home', async () => {
    const text = 'NA8 seven. Gate code 4471.';
    await env.DB.prepare('INSERT INTO note_marks (text_hash, marks, created_at) VALUES (?, ?, ?)')
      .bind(await sha256hex(text), '[{"text":"NA8 seven","kind":"key"}]', new Date().toISOString()).run();
    const r = await ask(homeEnv(), MARKED, { text });
    expect(r.heard).toHaveLength(1);
    expect(r.json.marks).toEqual([{ text: 'Gate code 4471', kind: 'key' }]);
    expect(await noteMarksKey(text)).not.toBe(await sha256hex(text));
  });
});
