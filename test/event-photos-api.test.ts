// SPEC §7.8 EP1–EP3 — reading an event from a screenshot through the real Worker. Claude is a fake
// api.anthropic.com behind a fetch spy that refuses every other host; the key is fake (recipe-fakes).
import { SELF, createExecutionContext, env } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/worker/index';
import type { Env } from '../src/worker/env';
import { READS_PER_DAY } from '../src/shared/things';
import { BASE, Client, owner } from './helpers';
import { claudeMessage, keyedEnv, warmClaude } from './recipe-fakes';

let o: Client, A: string;
beforeAll(async () => { o = await owner(); A = (await o.get('/me')).json.id; await warmClaude(); }, 60_000);
beforeEach(async () => { await env.DB.exec('DELETE FROM photo_reads'); });
afterEach(() => { vi.restoreAllMocks(); });

const jpeg = (size: number) => {
  const b = new Uint8Array(size);
  for (let i = 0; i < size; i++) b[i] = (i * 31) & 255;
  b.set([0xff, 0xd8, 0xff], 0);
  return b;
};
type Reply = { status?: number; body: object };

async function read(e: Env, claude: Reply[] = [], opts: { cookie?: string; type?: string } = {}) {
  const heard: any[] = [];
  const queue = [...claude];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    const reply = url.host === 'api.anthropic.com' && url.pathname === '/v1/messages' ? queue.shift() : undefined;
    if (!reply) throw new Error(`a test tried to reach ${url.host}${url.pathname} — no fake for it`);
    heard.push(await req.json());
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200, headers: { 'content-type': 'application/json' } });
  });
  const cookie = opts.cookie ?? o.cookie;
  const res = await worker.fetch(new Request(`${BASE}/events/read-photo`, {
    method: 'POST', body: jpeg(2048), headers: { 'content-type': opts.type ?? 'image/jpeg', ...(cookie ? { cookie } : {}) },
  }), e, createExecutionContext());
  return { status: res.status, json: await res.json<any>(), heard };
}
const reads = async () => (await env.DB.prepare('SELECT COUNT(*) AS n FROM photo_reads').first<{ n: number }>())!.n;

describe('§7.8 POST /events/read-photo', () => {
  it('EP1 a timed event → 200 cleaned; one read counted; image and dated, placed prompt sent; nothing saved', async () => {
    const events = async () => (await env.DB.prepare('SELECT COUNT(*) AS n FROM events').first<{ n: number }>())!.n;
    const before = await events();
    const r = await read(keyedEnv(), [{ body: claudeMessage({
      title: '  Mia\'s 8th birthday  ', startDate: '2026-10-17', endDate: '2026-10-17', startTime: '14:00', endTime: '16:00',
      location: 'Sky Zone, 3030 Plaza Bonita Rd', notes: 'RSVP to Jen 760-555-0101',
    }) }]);
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.json).toEqual({
      title: "Mia's 8th birthday", startDate: '2026-10-17', endDate: '2026-10-17', startTime: '14:00', endTime: '16:00',
      location: 'Sky Zone, 3030 Plaza Bonita Rd', notes: 'RSVP to Jen 760-555-0101',
    });
    expect(await reads()).toBe(1);
    expect(await events()).toBe(before);
    const [req] = r.heard;
    expect(req.model).toBe('claude-opus-5-5');
    const content = req.messages[0].content;
    expect(content[0].type).toBe('image');
    const prompt: string = content[content.length - 1].text;
    expect(prompt).toMatch(/Today is \d{4}-\d{2}-\d{2} in the household's time zone/);
    const home = await env.DB.prepare('SELECT latitude AS lat, longitude AS lon FROM settings WHERE id = 1').first<any>();
    expect(home.lat).not.toBeNull();
    expect(prompt).toContain(`latitude ${home.lat}, longitude ${home.lon}`);
    expect(prompt).toMatch(/take the one nearest the household/);
  });

  it('EP2 no key → 503; at the cap → 429 with no read counted; no session → 401; not an image → 400', async () => {
    const off = await read({ ...keyedEnv(), ANTHROPIC_API_KEY: '' });
    expect(off.status).toBe(503);
    expect(off.json.error).toBe('photo_reading_off');
    expect(off.heard).toHaveLength(0);
    const now = new Date().toISOString();
    await env.DB.batch(Array.from({ length: READS_PER_DAY }, () =>
      env.DB.prepare('INSERT INTO photo_reads (at, member_id) VALUES (?, ?)').bind(now, A)));
    const capped = await read(keyedEnv());
    expect(capped.status).toBe(429);
    expect(capped.json.error).toBe('rate_limited');
    expect(await reads()).toBe(READS_PER_DAY);
    vi.restoreAllMocks();
    expect((await SELF.fetch(`${BASE}/events/read-photo`, { method: 'POST', body: jpeg(10), headers: { 'content-type': 'image/jpeg' } })).status).toBe(401);
    expect((await read(keyedEnv(), [], { type: 'text/plain' })).status).toBe(400);
  });

  it('EP3 a refusal → 422 photo_refused; a failure → 502 photo_reading_failed with the reason', async () => {
    const refused = await read(keyedEnv(), [{ body: claudeMessage(null, { stop_reason: 'refusal', stop_details: { type: 'refusal', category: null, explanation: 'no' } }) }]);
    expect(refused.status).toBe(422);
    expect(refused.json.error).toBe('photo_refused');
    const failed = await read(keyedEnv(), [{ status: 400, body: { type: 'error', error: { type: 'invalid_request_error', message: 'bad image' } } }]);
    expect(failed.status).toBe(502);
    expect(failed.json.error).toBe('photo_reading_failed');
    expect(failed.json.message).toMatch(/400/);
  });
});
