// SPEC §7.9 EA6–EA7 — a pasted link read into an event through POST /events/read-text and the real Worker. The page
// is a fake site (events.example.com) and Claude a fake api.anthropic.com; a fetch spy refuses every other host.
import { createExecutionContext, env } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/worker/index';
import type { Env } from '../src/worker/env';
import { BASE, Client, owner } from './helpers';
import { claudeMessage, keyedEnv, warmClaude } from './recipe-fakes';

let o: Client;
beforeAll(async () => { o = await owner(); await warmClaude(); }, 60_000);
beforeEach(async () => { await env.DB.exec('DELETE FROM photo_reads'); });
afterEach(() => { vi.restoreAllMocks(); });

const LINK = 'https://events.example.com/focus-friday-fire-wands';
const PAGE = `<!doctype html><html><head><title>Focus Friday: Fire Wands</title></head>
<body><h1>Focus Friday: Fire Wands</h1><p>Fri Oct 16, 6–9pm at Incognito, 4280 Main St, San Diego</p></body></html>`;
type Reply = { status?: number; body: object | string };

async function read(e: Env, text: string, w: { page?: Reply; claude?: Reply[] }) {
  const heard: { host: string; body: any }[] = [];
  const claude = [...(w.claude ?? [])];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    const sent = req.method === 'POST' ? await req.text() : '';
    heard.push({ host: url.host, body: sent ? JSON.parse(sent) : null });
    const reply = url.host === 'events.example.com' ? w.page : url.host === 'api.anthropic.com' ? claude.shift() : undefined;
    if (!reply) throw new Error(`a test tried to reach ${url.host}${url.pathname} — no fake for it`);
    const json = typeof reply.body !== 'string';
    return new Response(json ? JSON.stringify(reply.body) : (reply.body as string), {
      status: reply.status ?? 200, headers: { 'content-type': json ? 'application/json' : 'text/html; charset=utf-8' },
    });
  });
  const res = await worker.fetch(new Request(`${BASE}/events/read-text`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: o.cookie }, body: JSON.stringify({ text }),
  }), e, createExecutionContext());
  return { status: res.status, json: await res.json<any>(), heard };
}
const notes = (text: string): Reply => ({ body: { ...claudeMessage(null), content: [{ type: 'text', text }] } });
const reads = async () => (await env.DB.prepare('SELECT COUNT(*) AS n FROM photo_reads').first<{ n: number }>())!.n;

describe('§7.9 a pasted link', () => {
  it('EA6 only a link → the page fetched once, looked up, filled; one read; the fill carries the page and the notes', async () => {
    const r = await read(keyedEnv(), `  ${LINK}  `, { page: { body: PAGE }, claude: [notes('Fire wands class, Oct 16 6-9pm'), { body: claudeMessage({
      title: 'Focus Friday: Fire Wands', startDate: '2026-10-16', endDate: '2026-10-16', startTime: '18:00', endTime: '21:00',
      location: 'Incognito, 4280 Main St, San Diego', notes: null,
    }) }] });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.json).toMatchObject({ title: 'Focus Friday: Fire Wands', startTime: '18:00', location: 'Incognito, 4280 Main St, San Diego' });
    expect(await reads()).toBe(1);
    expect(r.heard.filter((h) => h.host === 'events.example.com')).toHaveLength(1);
    const [research, filling] = r.heard.filter((h) => h.host === 'api.anthropic.com').map((h) => h.body);
    expect(research.tools.map((t: any) => t.name)).toEqual(['web_search', 'web_fetch']);
    const given: string = filling.messages[0].content[0].text;
    expect(given).toContain(LINK);
    expect(given).toContain('Focus Friday: Fire Wands');
    expect(given).toContain('Fire wands class, Oct 16 6-9pm');
    expect(filling.messages[0].content.at(-1).text).toMatch(/^Above is a web page someone pasted/);
  });

  it('EA7 a refusal → 422 link_refused; a failure → 502 link_reading_failed', async () => {
    const refused = await read(keyedEnv(), LINK, { page: { body: PAGE }, claude: [{ body: claudeMessage(null, { stop_reason: 'refusal', stop_details: { type: 'refusal', category: null, explanation: 'no' } }) }] });
    expect(refused.status).toBe(422);
    expect(refused.json.error).toBe('link_refused');
    const failed = await read(keyedEnv(), LINK, { page: { body: PAGE }, claude: [{ status: 400, body: { type: 'error', error: { type: 'invalid_request_error', message: 'bad' } } }] });
    expect(failed.status).toBe(502);
    expect(failed.json.error).toBe('link_reading_failed');
    expect(failed.json.message).toMatch(/^Couldn't read that link: /);
  });

  it('a link with words around it is read as text (no page fetched)', async () => {
    const r = await read(keyedEnv(), `Want to go? ${LINK}`, { claude: [{ body: claudeMessage({ title: 'x', startDate: null, endDate: null, startTime: null, endTime: null, location: null, notes: null }) }] });
    expect(r.status).toBe(200);
    expect(r.heard.some((h) => h.host === 'events.example.com')).toBe(false);
  });
});
