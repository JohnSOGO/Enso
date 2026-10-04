// M4t acceptance (SPEC §9.4, ON1–ON9) — POST /ops/notify: a Claude Code session pings the founder's phone.
// No push ever leaves the isolate: outbound fetch to *.push.test is answered here and any other host fails
// the test. The bearer is the TEST-ONLY OPS_NOTIFY_TOKEN that vitest.config.ts pins. The migration (ON-M)
// is in migration-0022.test.ts.
import { createExecutionContext, env } from 'cloudflare:test';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import worker from '../src/worker/index';
import {
  OPS_NOTIFY_PER_HOUR, OPS_TEXT_MAX, OPS_TITLE_DEFAULT, OPS_TITLE_MAX, opsNotifyError, opsTitle, opsWindowStart,
} from '../src/shared/ops';
import { BASE, Client, member, owner } from './helpers';
import { decryptPush, fakeSubscriber, type FakeSubscriber } from './push-helpers';

declare global {
  namespace Cloudflare {
    interface Env { OPS_NOTIFY_TOKEN: string }
  }
}

const TOKEN = 'test-ops-token';
const AUTH = { authorization: `Bearer ${TOKEN}` };

interface Pushed { url: string; headers: Headers; body: Uint8Array }
const pushed: Pushed[] = [];
const realFetch = globalThis.fetch;
const isPushTest = (url: string) => { const h = new URL(url).hostname; return h === 'push.test' || h.endsWith('.push.test'); };

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    if (new URL(req.url).hostname === 'hrc.test') return realFetch(input, init); // the Worker under test (SELF)
    if (!isPushTest(req.url)) throw new Error(`a test tried to reach ${new URL(req.url).host} — only *.push.test is allowed`);
    pushed.push({ url: req.url, headers: req.headers, body: new Uint8Array(await req.arrayBuffer()) });
    return new Response('', { status: 201 });
  });
});
afterEach(() => { vi.restoreAllMocks(); pushed.length = 0; });

const to = (sub: FakeSubscriber) => pushed.filter((p) => p.url === sub.endpoint);
const count = async (where = '1 = 1') =>
  (await env.DB.prepare(`SELECT COUNT(*) AS n FROM deliveries WHERE ${where}`).first<{ n: number }>())!.n;
const meId = async (c: Client) => (await c.get('/me')).json.id as string;

/** A fake phone for `client`, subscribed through the API at a fresh endpoint. */
async function phone(client: Client, origin = 'https://ops.push.test') {
  const sub = await fakeSubscriber(`${origin}/sub/${crypto.randomUUID()}`);
  const r = await client.post('/push/subscriptions', { endpoint: sub.endpoint, keys: sub.keys, userAgent: 'test phone' });
  expect(r.status).toBe(201);
  return sub;
}

/** POST /ops/notify through the Worker with `bindings` overriding the pinned env. */
async function notifyWith(bindings: Record<string, unknown>, payload: unknown, headers: Record<string, string> = AUTH) {
  const res = await worker.fetch(new Request(`${BASE}/ops/notify`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(payload),
  }), { ...env, ...bindings } as any, createExecutionContext());
  const text = await res.text();
  return { status: res.status, text, json: JSON.parse(text) };
}
const notify = (payload: unknown, headers: Record<string, string> = AUTH) => new Client().post('/ops/notify', payload, headers);

it('ON1: opsNotifyError, opsTitle and opsWindowStart', () => {
  expect(opsNotifyError({ text: ' hi ' })).toBeNull();
  expect(opsNotifyError({ text: 'x'.repeat(OPS_TEXT_MAX), title: 't'.repeat(OPS_TITLE_MAX) })).toBeNull();
  expect(opsNotifyError({ text: 'hi', title: null })).toBeNull();
  for (const text of ['', '   ', 'x'.repeat(OPS_TEXT_MAX + 1), 42, null, undefined]) {
    expect(opsNotifyError({ text }), `text ${JSON.stringify(text)}`).toBeTruthy();
  }
  for (const title of ['t'.repeat(OPS_TITLE_MAX + 1), 42, ['a']]) {
    expect(opsNotifyError({ text: 'hi', title }), `title ${JSON.stringify(title)}`).toBeTruthy();
  }
  expect(opsTitle(' 🤖 Claude ⭕🔁🏠 ')).toBe('🤖 Claude ⭕🔁🏠');
  expect(opsTitle()).toBe(OPS_TITLE_DEFAULT);
  expect(opsTitle('  ')).toBe('🤖 Claude');
  expect(opsWindowStart('2026-10-04T12:00:00.000Z')).toBe('2026-10-04T11:00:00.000Z');
});

it('ON4b: before setup there is no founder → 409 no_recipients, nothing written', async () => {
  // The first test in this file's database to call the API: nobody has signed up yet.
  expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM members').first()).toEqual({ n: 0 });
  const r = await notify({ text: 'hi' });
  expect(r.status).toBe(409);
  expect(r.json.error).toBe('no_recipients');
  expect(await count()).toBe(0);
});

it('ON2: OPS_NOTIFY_TOKEN unset or empty → 503 ops_notify_off, even with a Bearer header; nothing written', async () => {
  await owner();
  const before = await count();
  for (const token of ['', undefined]) {
    for (const headers of [AUTH, { authorization: 'Bearer ' }, {}] as Record<string, string>[]) {
      const r = await notifyWith({ OPS_NOTIFY_TOKEN: token }, { text: 'hi' }, headers);
      expect(r.status, `${JSON.stringify(token)} ${JSON.stringify(headers)}`).toBe(503);
      expect(r.json.error).toBe('ops_notify_off');
      expect(r.json.message).toBeTruthy();
    }
  }
  expect(await count()).toBe(before);
});

it('ON3: a wrong token or no header → 401 unauthorized; nothing written; neither token is echoed or logged', async () => {
  await owner();
  const before = await count();
  const logged = [vi.spyOn(console, 'log'), vi.spyOn(console, 'error'), vi.spyOn(console, 'warn')];
  const wrong = 'wrong-ops-token-xyz';
  for (const headers of [{ authorization: `Bearer ${wrong}` }, { authorization: TOKEN }, {}] as Record<string, string>[]) {
    const r = await notifyWith({}, { text: 'hi' }, headers);
    expect(r.status, JSON.stringify(headers)).toBe(401);
    expect(r.json.error).toBe('unauthorized');
    expect(r.text).not.toContain(wrong);
    expect(r.text).not.toContain(TOKEN);
  }
  expect(await count()).toBe(before);
  const lines = logged.flatMap((s) => s.mock.calls.map((c) => c.map(String).join(' ')));
  expect(lines.filter((l) => l.includes(wrong) || l.includes(TOKEN))).toEqual([]);
});

it('ON4: blank text, text over 200, a title over 60 → 400 invalid_input with a message; nothing written', async () => {
  await owner();
  const before = await count();
  for (const b of [{ text: '   ' }, { text: 'x'.repeat(OPS_TEXT_MAX + 1) }, { text: 'hi', title: 't'.repeat(OPS_TITLE_MAX + 1) }]) {
    const r = await notify(b);
    expect(r.status, JSON.stringify(b).slice(0, 40)).toBe(400);
    expect(r.json.error).toBe('invalid_input');
    expect(r.json.message).toBeTruthy();
  }
  expect(await count()).toBe(before);
});

it('ON5 + ON8: the founder with a phone → sent, whatever `member` says; the push carries the title, tagged by its delivery id; no house row', async () => {
  const o = await owner();
  const other = await member(o);
  const otherPhone = await phone(other.client);
  const sub = await phone(o);
  const founder = await meId(o);
  const houseBefore = await count(`channel = 'house'`);

  const r = await notify({ text: ' It is live ', title: ' 🤖 Claude ⭕🔁🏠 ', member: other.id });
  expect(r.status).toBe(201);
  expect(r.json).toEqual({ deliveries: [{ id: expect.any(String), status: 'sent', detail: null }] });
  const id = r.json.deliveries[0].id;
  const row = await env.DB.prepare('SELECT * FROM deliveries WHERE id = ?').bind(id).first<any>();
  expect(row).toMatchObject({
    fire_id: null, alert_number: 1, channel: 'push', member_id: founder, message: 'It is live', title: '🤖 Claude ⭕🔁🏠', status: 'sent',
  });
  expect(to(otherPhone)).toEqual([]);
  expect(await count(`member_id = '${other.id}'`)).toBe(0);

  const [req, ...more] = to(sub);
  expect(more).toEqual([]);
  expect(req.headers.get('topic')).toBeNull();
  expect(JSON.parse(await decryptPush(sub, req.body))).toEqual({
    fireId: null, kind: null, tag: id, title: '🤖 Claude ⭕🔁🏠', body: 'It is live', actions: [], url: null,
  });

  // No title → the default.
  const d = await notify({ text: 'Question for you' });
  expect(d.status).toBe(201);
  const [, second] = to(sub);
  expect(JSON.parse(await decryptPush(sub, second.body))).toMatchObject({ title: OPS_TITLE_DEFAULT, tag: d.json.deliveries[0].id });

  // ON8: no house row, ever.
  expect(await count(`channel = 'house'`)).toBe(houseBefore);
});

it('ON9: an announcement after a ping is still titled "📢 Announcement" (its title column stays NULL)', async () => {
  const o = await owner();
  const a = await member(o);
  const sub = await phone(a.client, 'https://on9.push.test');
  expect((await notify({ text: 'ping', title: 'Not this' })).status).toBe(201);
  const r = await o.post('/announce', { text: 'Dinner', channels: ['push'] });
  expect(r.status).toBe(201);
  const mine = r.json.deliveries.find((d: any) => d.memberId === a.id);
  expect(await env.DB.prepare('SELECT title FROM deliveries WHERE id = ?').bind(mine.id).first()).toEqual({ title: null });
  const [req] = to(sub);
  expect(JSON.parse(await decryptPush(sub, req.body))).toMatchObject({ title: '📢 Announcement', tag: mine.id, fireId: null });
  // A fire's push keeping "Ensō" and its fireId tag is P3 in push.test.ts.
});

it('ON6: the founder without a phone → 201 with an honest failed / no_subscription row', async () => {
  const o = await owner();
  await env.DB.prepare('DELETE FROM push_subscriptions WHERE member_id = ?').bind(await meId(o)).run();
  const r = await notify({ text: 'Blocked on you' });
  expect(r.status).toBe(201);
  expect(r.json).toEqual({ deliveries: [{ id: expect.any(String), status: 'failed', detail: 'no_subscription' }] });
});

it('ON7: the 31st ping within the hour → 429 rate_limited and no row; announcements and older pings do not count', async () => {
  const o = await owner();
  const founder = await meId(o);
  await env.DB.prepare('DELETE FROM deliveries WHERE fire_id IS NULL').run();
  const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
  const row = (id: string, title: string | null, created: string) => env.DB.prepare(
    `INSERT INTO deliveries (id, fire_id, alert_number, channel, member_id, message, title, status, created_at, updated_at)
     VALUES (?, NULL, 1, 'push', ?, 'x', ?, 'sent', ?, ?)`).bind(id, founder, title, created, created);
  await env.DB.batch([
    ...Array.from({ length: OPS_NOTIFY_PER_HOUR - 1 }, (_, i) => row(`dlv_ops${i}`, '🤖 Claude', at(10))),
    row('dlv_old', '🤖 Claude', at(61)), // older than the hour
    ...Array.from({ length: 5 }, (_, i) => row(`dlv_ann${i}`, null, at(5))), // announcements
  ]);

  const thirtieth = await notify({ text: 'number 30' });
  expect(thirtieth.status).toBe(201);
  const before = await count();
  const r = await notify({ text: 'number 31' });
  expect(r.status).toBe(429);
  expect(r.json.error).toBe('rate_limited');
  expect(r.json.message).toBeTruthy();
  expect(await count()).toBe(before);
});
