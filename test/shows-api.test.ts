// SPEC §7F.3 W1–W12 — the movies & shows list and its look-ups through the real Worker. Claude is a fake
// api.anthropic.com and the clip page a fake site (clips.example.com); a fetch spy refuses every other host, and
// the key is fake (recipe-fakes).
import { createExecutionContext, env } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/worker/index';
import type { Env } from '../src/worker/env';
import { READS_PER_DAY } from '../src/shared/things';
import { BASE, Client, member, owner } from './helpers';
import { claudeMessage, keyedEnv, warmClaude } from './recipe-fakes';

let o: Client, A: string;
beforeAll(async () => { o = await owner(); A = (await o.get('/me')).json.id; await warmClaude(); }, 60_000);
beforeEach(async () => { await env.DB.batch([env.DB.prepare('DELETE FROM photo_reads'), env.DB.prepare('DELETE FROM shows')]); });
afterEach(() => { vi.restoreAllMocks(); });

const DUNE = {
  title: 'Dune', kind: 'movie', year: '2021', rtCritics: 83, rtAudience: 90,
  watch: [{ how: 'stream', where: 'Max', note: null }], checkedAt: '2026-10-05T03:00:00.000Z', summary: 'Desert planet.',
};

describe('§7F the list', () => {
  it('W1 a show is added and listed first under want with every field', async () => {
    await o.post('/shows', { title: 'Older' });
    const r = await o.post('/shows', DUNE);
    expect(r.status, JSON.stringify(r.json)).toBe(201);
    expect(r.json).toMatchObject({ ...DUNE, status: 'want', watchedAt: null, createdBy: A, note: null, url: null });
    const list = (await o.get('/shows')).json;
    expect(list.want.map((s: { title: string }) => s.title)).toEqual(['Dune', 'Older']);
    expect(list.watched).toEqual([]);
  });

  it('W2 bad fields → 400 naming the field', async () => {
    const cases: [object, RegExp][] = [
      [{ title: '  ' }, /title/],
      [{ ...DUNE, rtCritics: 101 }, /rtCritics/],
      [{ ...DUNE, watch: [{ how: 'cable', where: 'Comcast' }] }, /how/],
      [{ ...DUNE, url: 'ftp://x' }, /url/],
      [{ ...DUNE, watch: Array.from({ length: 13 }, (_, i) => ({ how: 'buy', where: `S${i}` })) }, /watch/],
      [{ ...DUNE, kind: 'film' }, /kind/],
    ];
    for (const [b, msg] of cases) {
      const r = await o.post('/shows', b);
      expect(r.status, JSON.stringify(b)).toBe(400);
      expect(r.json.error).toBe('invalid_input');
      expect(r.json.message).toMatch(msg);
    }
  });

  it('W3 the same title and year again → 409 duplicate; another year is another show', async () => {
    const first = await o.post('/shows', DUNE);
    const again = await o.post('/shows', { title: ' dune ', year: '2021' });
    expect(again.status).toBe(409);
    expect(again.json).toEqual({ error: 'duplicate', message: 'Dune is already on the list.', showId: first.json.id });
    expect((await o.post('/shows', { title: 'Dune', year: '1984' })).status).toBe(201);
  });

  it('W4 watched records who and when; back to want clears them', async () => {
    const m = await member(o);
    const id = (await o.post('/shows', DUNE)).json.id;
    const w = await m.client.patch(`/shows/${id}`, { status: 'watched' });
    expect(w.status).toBe(200);
    expect(w.json).toMatchObject({ status: 'watched', watchedBy: m.id, rtCritics: 83, watch: DUNE.watch });
    expect(w.json.watchedAt).toBeTruthy();
    expect((await o.get('/shows')).json.watched.map((s: { id: string }) => s.id)).toEqual([id]);
    const kept = await o.patch(`/shows/${id}`, { note: 'loved it' });
    expect(kept.json).toMatchObject({ watchedBy: m.id, watchedAt: w.json.watchedAt, note: 'loved it' });
    const back = await o.patch(`/shows/${id}`, { status: 'want' });
    expect(back.json).toMatchObject({ status: 'want', watchedAt: null, watchedBy: null });
  });

  it("W5 renaming onto another show's key → 409", async () => {
    await o.post('/shows', DUNE);
    const id = (await o.post('/shows', { title: 'Arrival' })).json.id;
    const r = await o.patch(`/shows/${id}`, { title: 'DUNE', year: '2021' });
    expect(r.status).toBe(409);
    expect(r.json.error).toBe('duplicate');
  });

  it('W6 delete → 204, gone from the list, GET 404; its key is free again', async () => {
    const id = (await o.post('/shows', DUNE)).json.id;
    expect((await o.del(`/shows/${id}`)).status).toBe(204);
    expect((await o.get('/shows')).json.want).toEqual([]);
    expect((await o.get(`/shows/${id}`)).status).toBe(404);
    expect((await o.post('/shows', DUNE)).status).toBe(201);
  });
});

type Reply = { status?: number; body: object | string };
interface Heard { host: string; path: string; body: any }
type World = { page?: Reply; claude?: Reply[] };

function fakes(w: World) {
  const heard: Heard[] = [];
  const claude = [...(w.claude ?? [])];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    const text = req.method === 'POST' ? await req.text() : '';
    heard.push({ host: url.host, path: url.pathname, body: text ? JSON.parse(text) : null });
    const reply = url.host === 'clips.example.com' ? w.page
      : url.host === 'api.anthropic.com' && url.pathname === '/v1/messages' ? claude.shift() : undefined;
    if (!reply) throw new Error(`a test tried to reach ${url.host}${url.pathname} — no fake for it`);
    const json = typeof reply.body !== 'string';
    return new Response(json ? JSON.stringify(reply.body) : (reply.body as string), {
      status: reply.status ?? 200, headers: { 'content-type': json ? 'application/json' : 'text/html; charset=utf-8' },
    });
  });
  return heard;
}

async function call(e: Env, path: string, body: BodyInit, type: string, w: World = {}) {
  const heard = fakes(w);
  const res = await worker.fetch(new Request(`${BASE}${path}`, {
    method: 'POST', headers: { 'content-type': type, cookie: o.cookie }, body,
  }), e, createExecutionContext());
  return { status: res.status, json: await res.json<any>(), heard };
}
const lookUp = (e: Env, b: object, w?: World) => call(e, '/shows/look-up', JSON.stringify(b), 'application/json', w);

const reads = async () => (await env.DB.prepare('SELECT COUNT(*) AS n FROM photo_reads').first<{ n: number }>())!.n;
const shows = async () => (await env.DB.prepare('SELECT COUNT(*) AS n FROM shows').first<{ n: number }>())!.n;
const notes = (text: string): Reply => ({ body: { ...claudeMessage(null), content: [{ type: 'text', text }] } });
const fill = (value: object): Reply => ({ body: claudeMessage(value) });
const claudeAsks = (heard: Heard[]) => heard.filter((h) => h.host === 'api.anthropic.com').map((h) => h.body);
const promptOf = (body: any) => body.messages[0].content.at(-1).text as string;
const WICKED = {
  title: 'Wicked', kind: 'movie', year: '2024', rtCritics: 88, rtAudience: 95, summary: 'Oz, before Dorothy.', note: null,
  watch: [{ how: 'theater', where: 'Regal Oceanside', note: '2 mi' }, { how: 'rent', where: 'Apple TV', note: '$19.99' }],
};

describe('§7F.2 look-ups', () => {
  it('W7 by title: the cleaned reading; one read; nothing saved; web search (5, US) and web fetch (3); the prompt asks the right things', async () => {
    const r = await lookUp(keyedEnv(), { title: 'Wicked' }, { claude: [notes('Wicked (2024), RT 88%'), fill(WICKED)] });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.json).toMatchObject({ ...WICKED, url: null });
    expect(Date.parse(r.json.checkedAt)).not.toBeNaN();
    expect(await reads()).toBe(1);
    expect(await shows()).toBe(0);
    const [research, filling] = claudeAsks(r.heard);
    expect(research.tools).toEqual([
      { type: 'web_search_20260209', name: 'web_search', max_uses: 5, user_location: { type: 'approximate', country: 'US', timezone: expect.any(String) } },
      { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 3 },
    ]);
    const asked = promptOf(research);
    expect(asked).toContain('"Wicked"');
    expect(asked).toContain('United States');
    expect(asked).toContain('Rotten Tomatoes');
    const home = await env.DB.prepare('SELECT latitude AS lat, longitude AS lon FROM settings WHERE id = 1').first<any>();
    expect(asked).toContain(`latitude ${home.lat}, longitude ${home.lon}`);
    expect(filling.tools).toBeUndefined();
    expect(promptOf(filling)).toContain('Wicked (2024), RT 88%');
  });

  it('W8 by link: the page goes into the look-up; the answer keeps the pasted link', async () => {
    const page = '<html><head><title>Funniest scene ever</title><meta property="og:title" content="The Bear S2 clip"></head><body>Yes chef</body></html>';
    const r = await lookUp(keyedEnv(), { url: 'https://clips.example.com/v/1' },
      { page: { body: page }, claude: [notes('The Bear'), fill({ ...WICKED, title: 'The Bear', kind: 'show' })] });
    expect(r.status).toBe(200);
    expect(r.json.url).toBe('https://clips.example.com/v/1');
    const asked = promptOf(claudeAsks(r.heard)[0]);
    expect(asked).toContain('The Bear S2 clip');
    expect(asked).toContain('Yes chef');
  });

  it('W9 by picture: the image block goes before the prompt; nothing stored', async () => {
    const jpeg = new Uint8Array(2048).map((_, i) => (i * 7) & 255);
    jpeg.set([0xff, 0xd8, 0xff], 0);
    const before = (await env.PHOTOS.list()).objects.length;
    const r = await call(keyedEnv(), '/shows/look-up-photo', jpeg, 'image/jpeg', { claude: [notes('Wicked'), fill(WICKED)] });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    const content = claudeAsks(r.heard)[0].messages[0].content;
    expect(content[0]).toMatchObject({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg' } });
    expect(content.at(-1).type).toBe('text');
    expect((await env.PHOTOS.list()).objects.length).toBe(before);
  });

  it('W10 no title and no link, both, or a private link → 400; nothing fetched or counted', async () => {
    for (const b of [{}, { title: 'Dune', url: 'https://clips.example.com/x' }, { url: 'http://192.168.0.1' }, { title: '   ' }]) {
      const r = await lookUp(keyedEnv(), b);
      expect(r.status, JSON.stringify(b)).toBe(400);
      expect(r.json.error).toBe('invalid_input');
      expect(r.heard).toHaveLength(0);
    }
    expect(await reads()).toBe(0);
  });

  it('W11 no key → 503 show_lookup_off; at the cap → 429; neither fetches nor counts', async () => {
    const off = await lookUp({ ...keyedEnv(), ANTHROPIC_API_KEY: '' }, { title: 'Dune' });
    expect(off.status).toBe(503);
    expect(off.json).toEqual({ error: 'show_lookup_off', message: "Looking up movies and shows isn't set up yet." });
    expect(off.heard).toHaveLength(0);
    expect(await reads()).toBe(0);
    const now = new Date().toISOString();
    await env.DB.batch(Array.from({ length: READS_PER_DAY }, () => env.DB.prepare('INSERT INTO photo_reads (at, member_id) VALUES (?, ?)').bind(now, A)));
    const capped = await lookUp(keyedEnv(), { title: 'Dune' });
    expect(capped.status).toBe(429);
    expect(capped.heard).toHaveLength(0);
    expect(await reads()).toBe(READS_PER_DAY);
  });

  it('W12 a refusal → 422 show_refused; a failure → 502 show_lookup_failed with the reason', async () => {
    const refused = await lookUp(keyedEnv(), { title: 'Dune' }, { claude: [{ body: { ...claudeMessage(null), stop_reason: 'refusal' } }] });
    expect(refused.status).toBe(422);
    expect(refused.json.error).toBe('show_refused');
    const failed = await lookUp(keyedEnv(), { title: 'Dune' }, { claude: [{ status: 400, body: { type: 'error', error: { type: 'invalid_request_error', message: 'boom' } } }] });
    expect(failed.status).toBe(502);
    expect(failed.json.error).toBe('show_lookup_failed');
    expect(failed.json.message).toMatch(/Couldn't look that up: .*boom/);
  });
});
