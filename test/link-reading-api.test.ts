// SPEC §7C.5 D14–D21 — reading a pasted link to fill a thing (§7C.4b) through the real Worker. The page is a
// fake site (events.example.com) and Claude a fake api.anthropic.com; a fetch spy refuses every other host,
// and the key is fake (recipe-fakes). The pure rules (readableLink, pageExtract) are tested here too.
import { createExecutionContext, env } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/worker/index';
import type { Env } from '../src/worker/env';
import { READS_PER_DAY } from '../src/shared/things';
import { JSONLD_MAX, PAGE_TEXT_MAX, pageExtract, readableLink } from '../src/shared/link-reading';
import { BASE, Client, owner } from './helpers';
import { claudeMessage, keyedEnv, warmClaude } from './recipe-fakes';

let o: Client, A: string;
beforeAll(async () => { o = await owner(); A = (await o.get('/me')).json.id; await warmClaude(); }, 60_000);
beforeEach(async () => { await env.DB.exec('DELETE FROM photo_reads'); });
afterEach(() => { vi.restoreAllMocks(); });

const LINK = 'https://events.example.com/fall-fair';
const EVENT_PAGE = `<!doctype html><html><head><title>Fall Fair 2026 &amp; Rodeo</title>
<meta property="og:title" content="Fall Fair 2026"><meta name="description" content="Rides, food and a rodeo">
<script type="application/ld+json">{"@type":"Event","name":"Fall Fair","startDate":"2026-10-10","endDate":"2026-10-20",
"location":{"@type":"Place","name":"Del Mar Fairgrounds","address":"2260 Jimmy Durante Blvd"},"offers":{"price":"15"}}</script>
<style>.x{color:red}</style><script>var hidden = 1;</script></head><body><h1>Fall Fair</h1><p>Gates open 10am</p></body></html>`;
const FILLED = {
  title: 'Fall Fair', startDate: '2026-10-10', endDate: '2026-10-20', place: 'Del Mar Fairgrounds',
  address: '2260 Jimmy Durante Blvd', phone: null, cost: '$15', url: 'https://elsewhere.example.com/tickets', note: 'Gates open 10am',
};

type Reply = { status?: number; body: object | string; headers?: Record<string, string> };
interface Heard { host: string; path: string; body: any }

/** The fake page and a queue of Claude answers (research first, then the fill). */
function fakes(w: { page?: Reply; claude?: Reply[] }) {
  const heard: Heard[] = [];
  const claude = [...(w.claude ?? [])];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    const text = req.method === 'POST' ? await req.text() : '';
    heard.push({ host: url.host, path: url.pathname, body: text ? JSON.parse(text) : null });
    const reply = url.host === 'events.example.com' ? w.page
      : url.host === 'api.anthropic.com' && url.pathname === '/v1/messages' ? claude.shift() : undefined;
    if (!reply) throw new Error(`a test tried to reach ${url.host}${url.pathname} — no fake for it`);
    const json = typeof reply.body !== 'string';
    return new Response(json ? JSON.stringify(reply.body) : (reply.body as string), {
      status: reply.status ?? 200, headers: { 'content-type': json ? 'application/json' : 'text/html; charset=utf-8', ...reply.headers },
    });
  });
  return heard;
}

async function read(e: Env, url: unknown, w: { page?: Reply; claude?: Reply[] } = {}) {
  const heard = fakes(w);
  const res = await worker.fetch(new Request(`${BASE}/things/read-link`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: o.cookie }, body: JSON.stringify({ url }),
  }), e, createExecutionContext());
  return { status: res.status, json: await res.json<any>(), heard };
}

const reads = async () => (await env.DB.prepare('SELECT COUNT(*) AS n FROM photo_reads').first<{ n: number }>())!.n;
const things = async () => (await env.DB.prepare('SELECT COUNT(*) AS n FROM things').first<{ n: number }>())!.n;
const notes = (text: string, over: object = {}): Reply =>
  ({ body: { ...claudeMessage(null), content: [{ type: 'text', text }], ...over } });
const fill = (value: object): Reply => ({ body: claudeMessage(value) });
const claudeAsks = (heard: Heard[]) => heard.filter((h) => h.host === 'api.anthropic.com').map((h) => h.body);
const promptOf = (body: any) => body.messages[0].content.at(-1).text as string;

describe('§7C.4b read-link through the Worker', () => {
  it('D14 an event page: the fields come back; one read counted; the look-up has web search (3) and web fetch (2) and the page; nothing saved', async () => {
    const before = await things();
    const r = await read(keyedEnv(), LINK, { page: { body: EVENT_PAGE }, claude: [notes('Fall Fair, Oct 10–20, $15'), fill(FILLED)] });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.json).toMatchObject({ title: 'Fall Fair', startDate: '2026-10-10', endDate: '2026-10-20', place: 'Del Mar Fairgrounds', cost: '$15' });
    expect(await reads()).toBe(1);
    expect(await things()).toBe(before);
    const [research, filling] = claudeAsks(r.heard);
    expect(research.tools).toEqual([
      { type: 'web_search_20260209', name: 'web_search', max_uses: 3 },
      { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 2 },
    ]);
    expect(research.model).toBe('claude-opus-5-5');
    const asked = promptOf(research);
    expect(asked).toContain(LINK);
    expect(asked).toContain('"startDate":"2026-10-10"');
    expect(asked).toContain('Gates open 10am');
    expect(asked).not.toContain('hidden = 1');
    expect(filling.tools).toBeUndefined();
    expect(promptOf(filling)).toContain('Fall Fair, Oct 10–20, $15');
  });

  it('D15 the site answers 403 → still read: the look-up is told why and Claude is asked', async () => {
    const r = await read(keyedEnv(), LINK, { page: { status: 403, body: 'no bots' }, claude: [notes('nothing found'), fill({ ...FILLED, place: null })] });
    expect(r.status).toBe(200);
    expect(promptOf(claudeAsks(r.heard)[0])).toMatch(/couldn't be fetched: the site answered 403/);
  });

  it('D16 private or unreadable links → 400; no fetch, no read counted', async () => {
    for (const bad of ['http://192.168.0.123', 'localhost:8787', 'https://intranet/x', 'ftp://x.example.com', 'https://ha.local', 'http://[::1]/', 42]) {
      const r = await read(keyedEnv(), bad);
      expect(r.status, String(bad)).toBe(400);
      expect(r.json.error).toBe('invalid_input');
      expect(r.heard).toHaveLength(0);
    }
    expect(await reads()).toBe(0);
  });

  it('D16 a redirect to a private host is not followed', async () => {
    const r = await read(keyedEnv(), LINK, { page: { status: 302, body: '', headers: { location: 'http://127.0.0.1/admin' } }, claude: [notes('x'), fill(FILLED)] });
    expect(r.status).toBe(200);
    expect(r.heard.filter((h) => h.host === '127.0.0.1')).toHaveLength(0);
    expect(promptOf(claudeAsks(r.heard)[0])).toMatch(/redirected to a link that can't be read/);
  });

  it('D17 no API key → 503 link_reading_off, nothing fetched; at the cap → 429, nothing fetched or counted', async () => {
    const off = await read({ ...keyedEnv(), ANTHROPIC_API_KEY: '' }, LINK);
    expect(off.status).toBe(503);
    expect(off.json).toEqual({ error: 'link_reading_off', message: "Reading links isn't set up yet." });
    expect(off.heard).toHaveLength(0);
    expect(await reads()).toBe(0);
    const now = new Date().toISOString();
    await env.DB.batch(Array.from({ length: READS_PER_DAY }, () => env.DB.prepare('INSERT INTO photo_reads (at, member_id) VALUES (?, ?)').bind(now, A)));
    const capped = await read(keyedEnv(), LINK);
    expect(capped.status).toBe(429);
    expect(capped.json.error).toBe('rate_limited');
    expect(capped.heard).toHaveLength(0);
    expect(await reads()).toBe(READS_PER_DAY);
  });

  it('D18 a pause_turn is continued with the paused answer sent back unchanged; the next answer\'s notes are used', async () => {
    const paused = [{ type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: { query: 'fall fair dates' } }];
    const r = await read(keyedEnv(), LINK, {
      page: { body: EVENT_PAGE },
      claude: [notes('', { content: paused, stop_reason: 'pause_turn' }), notes('Runs Oct 10 to Oct 20'), fill(FILLED)],
    });
    expect(r.status).toBe(200);
    const asks = claudeAsks(r.heard);
    expect(asks).toHaveLength(3);
    expect(asks[1].messages[1]).toEqual({ role: 'assistant', content: paused });
    expect(promptOf(asks[2])).toContain('Runs Oct 10 to Oct 20');
  });

  it('D19 the answer keeps the pasted link, not one Claude found', async () => {
    const r = await read(keyedEnv(), 'events.example.com/fall-fair', { page: { body: EVENT_PAGE }, claude: [notes('x'), fill(FILLED)] });
    expect(r.json.url).toBe(LINK);
  });

  it('D21 a refusal → 422 link_refused; a failure → 502 link_reading_failed with the reason', async () => {
    const refused = await read(keyedEnv(), LINK, { page: { body: EVENT_PAGE }, claude: [notes('', { stop_reason: 'refusal', stop_details: { type: 'refusal', category: null, explanation: 'no' } })] });
    expect(refused.status).toBe(422);
    expect(refused.json.error).toBe('link_refused');
    const failed = await read(keyedEnv(), LINK, { page: { body: EVENT_PAGE }, claude: [{ status: 400, body: { type: 'error', error: { type: 'invalid_request_error', message: 'bad tools' } } }] });
    expect(failed.status).toBe(502);
    expect(failed.json.error).toBe('link_reading_failed');
    expect(failed.json.message).toMatch(/400/);
  });
});

describe('§7C.4b the rules (pure)', () => {
  it('readableLink keeps public links and refuses private hosts', () => {
    expect(readableLink('pumpkinjunctionsd.com')).toBe('https://pumpkinjunctionsd.com');
    expect(readableLink('https://www.example.org/tickets?x=1')).toBe('https://www.example.org/tickets?x=1');
    for (const bad of ['http://10.0.0.1', 'https://localhost', 'https://app.localhost', 'https://printer.lan', 'https://box.home.arpa', 'https://x.internal', 'javascript:alert(1)']) {
      expect(readableLink(bad), bad).toBeNull();
    }
  });

  it('D20 pageExtract keeps the title, meta and JSON-LD; drops script, style and comments; decodes entities; cuts the text', () => {
    const html = `<html><head><title>A &amp; B</title><meta property="og:title" content="Big &quot;Fair&quot;">
      <meta name="viewport" content="width=device-width"><script type="application/ld+json">{"a":1}</script>
      <script type='application/ld+json'>{"b":2}</script><script>secret()</script><style>p{}</style></head>
      <body><!-- hidden note --><p>Hello&nbsp;world &#169; &#x263A;</p>${'x'.repeat(50_000)}</body></html>`;
    const p = pageExtract(html);
    expect(p.title).toBe('A & B');
    expect(p.meta).toEqual(['og:title: Big "Fair"']);
    expect(p.jsonLd).toEqual(['{"a":1}', '{"b":2}']);
    expect(p.text.startsWith('Hello world © ☺')).toBe(true);
    expect(p.text).not.toMatch(/secret|hidden note|p\{\}/);
    expect(p.text.length).toBe(PAGE_TEXT_MAX);
    expect(pageExtract(`<script type="application/ld+json">${'y'.repeat(JSONLD_MAX + 50)}</script>`).jsonLd[0].length).toBe(JSONLD_MAX);
  });
});
