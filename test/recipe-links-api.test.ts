// SPEC §7E.6 RL3–RL9 — reading a recipe from any link through the real Worker. The pages are fake sites
// (cooking.example.com, www.facebook.com) and Claude a fake api.anthropic.com; a fetch spy refuses every other
// host, and the keys are fake (recipe-fakes).
import { createExecutionContext, env } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/worker/index';
import type { Env } from '../src/worker/env';
import { RECIPE_IN_ENGLISH, RECIPE_READS_PER_DAY } from '../src/shared/recipe-reading';
import { BASE, Client, owner } from './helpers';
import { claudeMessage, keyedEnv, warmClaude } from './recipe-fakes';

let o: Client, me: string;
beforeAll(async () => { o = await owner(); me = (await o.get('/me')).json.id; await warmClaude(); }, 60_000);
beforeEach(async () => {
  await env.DB.batch([env.DB.prepare('DELETE FROM recipe_emojis'), env.DB.prepare('DELETE FROM recipes'), env.DB.prepare('DELETE FROM recipe_reads')]);
});
afterEach(() => { vi.restoreAllMocks(); });

const SITE_LINK = 'https://cooking.example.com/garlic-noodles?utm_source=pin';
const REEL = 'https://www.facebook.com/reel/1437627654879504/?fs=e&s=TIeQ9V&fs=e&mibextid=wwXIfr&fs=e';
const RECIPE_PAGE = `<!doctype html><html><head><title>Garlic Noodles | Cooking</title>
<script type="application/ld+json">{"@type":"Recipe","name":"Garlic Noodles","recipeIngredient":["8 oz noodles","6 cloves garlic"]}</script>
</head><body><h1>Garlic Noodles</h1><p>Boil the noodles.</p></body></html>`;
const READING = { found: true, title: 'Garlic Noodles', ingredients: ['8 oz noodles', '6 cloves garlic'], steps: ['Boil', 'Toss'], servings: '2', time: null };

type Reply = { status?: number; body: object | string };
interface Heard { host: string; path: string; body: any }

/** The fake pages and a queue of Claude answers (the look-up first, then the fill). */
function fakes(w: { page?: Reply; claude?: Reply[] }) {
  const heard: Heard[] = [];
  const claude = [...(w.claude ?? [])];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    const text = req.method === 'POST' ? await req.text() : '';
    heard.push({ host: url.host, path: url.pathname, body: text ? JSON.parse(text) : null });
    const reply = ['cooking.example.com', 'www.facebook.com'].includes(url.host) ? w.page
      : url.host === 'api.anthropic.com' && url.pathname === '/v1/messages' ? claude.shift() : undefined;
    if (!reply) throw new Error(`a test tried to reach ${url.host}${url.pathname} — no fake for it`);
    const json = typeof reply.body !== 'string';
    return new Response(json ? JSON.stringify(reply.body) : (reply.body as string), {
      status: reply.status ?? 200, headers: { 'content-type': json ? 'application/json' : 'text/html; charset=utf-8' },
    });
  });
  return heard;
}

async function read(e: Env, url: unknown, w: { page?: Reply; claude?: Reply[] } = {}, path = 'from-link') {
  const heard = fakes(w);
  const res = await worker.fetch(new Request(`${BASE}/recipes/${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: o.cookie! }, body: JSON.stringify({ url }),
  }), e, createExecutionContext());
  return { status: res.status, json: await res.json<any>(), heard };
}

const reads = async () => (await env.DB.prepare('SELECT COUNT(*) AS n FROM recipe_reads').first<{ n: number }>())!.n;
const notes = (text: string): Reply => ({ body: { ...claudeMessage(null), content: [{ type: 'text', text }] } });
const fill = (value: object): Reply => ({ body: claudeMessage(value) });
const claudeAsks = (heard: Heard[]) => heard.filter((h) => h.host === 'api.anthropic.com').map((h) => h.body);
const promptOf = (body: any) => body.messages[0].content.at(-1).text as string;
const happy = { page: { body: RECIPE_PAGE }, claude: [notes('Garlic Noodles: 8 oz noodles, 6 cloves garlic. Boil, toss.'), fill(READING)] };

describe('§7E.6 from-link through the Worker', () => {
  it('RL3 a recipe page: 201, saved with the cleaned link and the site, no video, source page; one read; the look-up has its tools and the JSON-LD', async () => {
    const r = await read(keyedEnv(), SITE_LINK, happy);
    expect(r.status, JSON.stringify(r.json)).toBe(201);
    expect(r.json).toMatchObject({
      title: 'Garlic Noodles', ingredients: READING.ingredients, steps: READING.steps, servings: '2', found: true,
      link: 'https://cooking.example.com/garlic-noodles', channel: 'cooking.example.com', videoId: null, watchUrl: null,
      thumbnailUrl: null, source: ['page'], captionsError: null, commentsError: null,
    });
    expect(await reads()).toBe(1);
    const [look, filled] = claudeAsks(r.heard);
    expect(look.tools).toEqual([
      expect.objectContaining({ name: 'web_search', max_uses: 3 }), expect.objectContaining({ name: 'web_fetch', max_uses: 2 }),
    ]);
    expect(promptOf(look)).toContain('"recipeIngredient"');
    expect(promptOf(filled)).toContain('Garlic Noodles: 8 oz noodles');
    expect(promptOf(filled)).toContain(RECIPE_IN_ENGLISH); // RL10
    expect(r.heard.filter((h) => h.host === 'www.googleapis.com')).toEqual([]);
  });

  it("RL4 Facebook's login wall (403): still read, the look-up is told why; saved as Facebook", async () => {
    const r = await read(keyedEnv(), REEL, { page: { status: 403, body: 'login' }, claude: happy.claude });
    expect(r.status, JSON.stringify(r.json)).toBe(201);
    expect(r.json).toMatchObject({ link: 'https://www.facebook.com/reel/1437627654879504/', channel: 'Facebook', found: true });
    expect(promptOf(claudeAsks(r.heard)[0])).toContain("The page couldn't be fetched: the site answered 403");
  });

  it('RL5 the same link again, other junk: 409 duplicate with its recipeId; no read; nothing fetched', async () => {
    const first = await read(keyedEnv(), REEL, happy);
    const again = await read(keyedEnv(), 'https://m.facebook.com/reel/1437627654879504/?s=zzz', happy);
    expect(again.status).toBe(409);
    expect(again.json).toMatchObject({ error: 'duplicate', recipeId: first.json.id, message: expect.stringMatching(/That link is already/) });
    expect(again.heard).toEqual([]);
    expect(await reads()).toBe(1);
  });

  it('RL6 no Anthropic key → 503 (YouTube key or not); at the cap → 429; unreadable → 400; nothing fetched or counted', async () => {
    for (const e of [{ ...keyedEnv(), ANTHROPIC_API_KEY: '' }, env as unknown as Env]) {
      const r = await read(e, SITE_LINK, happy);
      expect(r.status).toBe(503);
      expect(r.json.message).toMatch(/links/);
      expect(r.heard).toEqual([]);
    }
    const bad = await read(keyedEnv(), 'http://localhost/soup', happy);
    expect(bad.status).toBe(400);
    expect(await reads()).toBe(0);
    for (let i = 0; i < RECIPE_READS_PER_DAY; i++) await env.DB.prepare('INSERT INTO recipe_reads (at, member_id) VALUES (?, ?)').bind(new Date().toISOString(), me).run();
    const capped = await read(keyedEnv(), SITE_LINK, happy);
    expect(capped.status).toBe(429);
    expect(capped.heard).toEqual([]);
  });

  it("RL7 no recipe found → saved found:false with the page's title; a refusal → 422; a failure → 502", async () => {
    const none = await read(keyedEnv(), SITE_LINK, { page: { body: RECIPE_PAGE }, claude: [notes("Couldn't find the recipe."), fill({ ...READING, found: false })] });
    expect(none.status).toBe(201);
    expect(none.json).toMatchObject({ title: 'Garlic Noodles | Cooking', found: false, ingredients: [], steps: [] });
    await env.DB.exec('DELETE FROM recipes');
    const refused = await read(keyedEnv(), SITE_LINK, { page: { body: RECIPE_PAGE }, claude: [{ body: claudeMessage(null, { stop_reason: 'refusal' }) }] });
    expect(refused.status).toBe(422);
    expect(refused.json.error).toBe('recipe_refused');
    const failed = await read(keyedEnv(), SITE_LINK, { page: { body: RECIPE_PAGE }, claude: [{ status: 400, body: { type: 'error', error: { type: 'invalid_request_error', message: 'bad' } } }] });
    expect(failed.status).toBe(502);
    expect(failed.json.error).toBe('recipe_reading_failed');
  });

  it('RL8 from-video with a page link reads it the same way', async () => {
    const r = await read(keyedEnv(), SITE_LINK, happy, 'from-video');
    expect(r.status, JSON.stringify(r.json)).toBe(201);
    expect(r.json).toMatchObject({ link: 'https://cooking.example.com/garlic-noodles', source: ['page'] });
  });

  it('RL9 a transcript on a link recipe: re-read with only Claude asked, YouTube key not needed; source transcript', async () => {
    const saved = await read(keyedEnv(), REEL, { page: { status: 403, body: 'login' }, claude: [notes('Not found.'), fill({ ...READING, found: false })] });
    expect(saved.json.found).toBe(false);
    vi.restoreAllMocks();
    const heard = fakes({ claude: [fill(READING)] });
    const res = await worker.fetch(new Request(`${BASE}/recipes/${saved.json.id}/transcript`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: o.cookie! },
      body: JSON.stringify({ screenshots: [{ type: 'image/jpeg', data: btoa('fake caption shot') }] }),
    }), { ...keyedEnv(), YOUTUBE_API_KEY: '' }, createExecutionContext());
    const json = await res.json<any>();
    expect(res.status, JSON.stringify(json)).toBe(200);
    expect(json).toMatchObject({ found: true, ingredients: READING.ingredients, source: ['transcript'], link: saved.json.link });
    expect(heard.map((h) => h.host)).toEqual(['api.anthropic.com']);
    const content = heard[0].body.messages[0].content;
    expect(content[0].type).toBe('image');
    expect(content.map((b: any) => b.text ?? '').join('\n')).toContain('Site: Facebook');
    expect(content.map((b: any) => b.text ?? '').join('\n')).toContain(RECIPE_IN_ENGLISH); // RL10
    expect(await reads()).toBe(2);
  });
  it('RL11 a typed recipe takes screenshots too (⚑ Q173): re-read with only Claude asked; the typed title kept for Claude', async () => {
    const typed = await o.post('/recipes', { title: "Grandma's flan" });
    expect(typed.status).toBe(201);
    const heard = fakes({ claude: [fill(READING)] });
    const res = await worker.fetch(new Request(`${BASE}/recipes/${typed.json.id}/transcript`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: o.cookie! },
      body: JSON.stringify({ screenshots: [{ type: 'image/jpeg', data: btoa('fake cookbook page') }] }),
    }), { ...keyedEnv(), YOUTUBE_API_KEY: '' }, createExecutionContext());
    const json = await res.json<any>();
    expect(res.status, JSON.stringify(json)).toBe(200);
    expect(json).toMatchObject({ found: true, ingredients: READING.ingredients, source: ['transcript'], link: null, videoId: null });
    expect(heard.map((h) => h.host)).toEqual(['api.anthropic.com']);
    const text = heard[0].body.messages[0].content.map((b: any) => b.text ?? '').join('\n');
    expect(text).toContain("Title: Grandma's flan");
    expect(text).toContain('Site: (none)');
  });
});
