// M5 acceptance (SPEC §9.1, P1–P9) — Web Push sending, end to end through /dev/tick and /push/test.
// No push ever leaves the isolate: outbound fetch to *.push.test is answered here; the test VAPID
// keys come from vitest.config.ts. The VAPID header cache lives per isolate, so a test that needs a
// freshly signed JWT uses an origin no other test has used.
import { env, createExecutionContext } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/worker/index';
import { sendWebPush } from '../src/worker/web-push';
import { BASE, member, owner, tickAt, type Client } from './helpers';
import { decryptPush, fakeSubscriber, readVapidJwt, type FakeSubscriber } from './push-helpers';

declare global {
  namespace Cloudflare {
    interface Env { VAPID_PUBLIC_KEY: string; VAPID_PRIVATE_KEY: string; VAPID_SUBJECT: string }
  }
}

interface Pushed { url: string; headers: Headers; body: Uint8Array }
const pushed: Pushed[] = [];
/** What the fake push service answers, per endpoint (default 201). */
const answers = new Map<string, { status: number; body?: string }>();
const realFetch = globalThis.fetch;
const isPushTest = (url: string) => { const h = new URL(url).hostname; return h === 'push.test' || h.endsWith('.push.test'); };

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    if (!isPushTest(req.url)) return realFetch(input, init);
    pushed.push({ url: req.url, headers: req.headers, body: new Uint8Array(await req.arrayBuffer()) });
    const a = answers.get(req.url) ?? { status: 201 };
    return new Response(a.body ?? '', { status: a.status });
  });
});
afterEach(() => { vi.restoreAllMocks(); pushed.length = 0; answers.clear(); });

const to = (sub: FakeSubscriber) => pushed.filter((p) => p.url === sub.endpoint);
const jwtOf = (p: Pushed) => /^vapid t=([^,]+), k=(.+)$/.exec(p.headers.get('authorization') ?? '');

/** A fake phone for `client`, subscribed through the API at a fresh endpoint under `origin`. */
async function phone(client: Client, origin = 'https://push.test') {
  const sub = await fakeSubscriber(`${origin}/sub/${crypto.randomUUID()}`);
  const r = await client.post('/push/subscriptions', { endpoint: sub.endpoint, keys: sub.keys, userAgent: 'test phone' });
  expect(r.status).toBe(201);
  return { sub, id: r.json.id as string };
}

/** A push reminder for `memberId` on `date` 12:00 local, rung by ticking at its due time → the fire id. */
async function ringReminder(o: Client, memberId: string, date: string, title = 'Take the bins out') {
  const ev = await o.post('/events', { title, startDate: date, startTime: '12:00', assignedTo: [memberId], reminder: { offsetMin: 0, channels: ['push'] } });
  expect(ev.status).toBe(201);
  await tickAt(o, `${date}T00:00:00Z`); // materializes the next 36 h
  const fire = await env.DB.prepare('SELECT id, due_at FROM fires WHERE event_id = ?').bind(ev.json.id).first<{ id: string; due_at: string }>();
  await tickAt(o, fire!.due_at);
  return fire!.id;
}

const deliveriesOf = (fireId: string) =>
  env.DB.prepare(`SELECT status, detail FROM deliveries WHERE fire_id = ? AND channel = 'push'`).bind(fireId).all<{ status: string; detail: string | null }>()
    .then((r) => r.results);

/** The Worker called directly with some bindings removed (no such config exists in the test pool). */
const withoutBinding = (name: keyof Cloudflare.Env, path: string, init?: RequestInit) =>
  worker.fetch(new Request(BASE + path, init), { ...env, [name]: undefined } as any, createExecutionContext());

describe('M5 Web Push (§9.1)', () => {
  it('P1: /push/vapid-key is the configured public key, null when unset', async () => {
    const o = await owner();
    expect((await o.get('/push/vapid-key')).json).toEqual({ key: env.VAPID_PUBLIC_KEY });
    const r = await withoutBinding('VAPID_PUBLIC_KEY', '/push/vapid-key');
    expect(await r.json()).toEqual({ key: null });
  });

  it('P2: subscribe → { id } (upserted by endpoint), listed in /status with endpoint, delete own only', async () => {
    const o = await owner();
    const a = await member(o), b = await member(o);
    const { sub, id } = await phone(a.client);
    const again = await a.client.post('/push/subscriptions', { endpoint: sub.endpoint, keys: sub.keys });
    expect(again.json.id).toBe(id);
    const mine = (await a.client.get('/status')).json.mySubscriptions;
    expect(mine).toEqual([expect.objectContaining({ id, endpoint: sub.endpoint, lastOkAt: null, lastError: null })]);
    expect((await b.client.get('/status')).json.mySubscriptions).toEqual([]);
    expect((await b.client.del(`/push/subscriptions/${id}`)).status).toBe(404);
    expect((await a.client.del(`/push/subscriptions/${id}`)).status).toBe(200);
    expect((await a.client.get('/status')).json.mySubscriptions).toEqual([]);
  });

  it('P3 + P9 + AN7: a ringing reminder → one aes128gcm POST with a VAPID header; it decrypts to the payload; sent', async () => {
    const o = await owner();
    const a = await member(o);
    const { sub } = await phone(a.client, 'https://p3.push.test');
    const fireId = await ringReminder(o, a.id, '2026-11-02');
    const [req, ...more] = to(sub);
    expect(more).toEqual([]);
    expect(req.headers.get('content-encoding')).toBe('aes128gcm');
    expect(req.headers.get('ttl')).toBe('3600');
    expect(req.headers.get('urgency')).toBe('high');
    expect(req.headers.get('topic')).toBe(fireId);
    const [, jwt, k] = jwtOf(req)!;
    expect(k).toBe(env.VAPID_PUBLIC_KEY);
    const v = await readVapidJwt(jwt, env.VAPID_PUBLIC_KEY);
    expect(v.valid).toBe(true);
    expect(v.claims).toMatchObject({ aud: 'https://p3.push.test', sub: env.VAPID_SUBJECT });
    // P9 — the test-side RFC 8291 decryptor reads back exactly the payload.
    expect(JSON.parse(await decryptPush(sub, req.body))).toEqual({
      fireId, kind: 'reminder', tag: fireId, title: 'Ensō', body: 'Reminder: Take the bins out', actions: ['done', 'snooze'],
    });
    expect(await deliveriesOf(fireId)).toEqual([{ status: 'sent', detail: null }]);
    const [s] = (await a.client.get('/status')).json.mySubscriptions;
    expect(s.lastOkAt).not.toBeNull();
  });

  it('P4: 410 → the subscription is deleted; the delivery failed, naming 410', async () => {
    const o = await owner();
    const a = await member(o);
    const { sub } = await phone(a.client);
    answers.set(sub.endpoint, { status: 410 });
    const fireId = await ringReminder(o, a.id, '2026-11-03');
    expect(to(sub)).toHaveLength(1);
    const [d] = await deliveriesOf(fireId);
    expect(d.status).toBe('failed');
    expect(d.detail).toMatch(/410/);
    expect((await a.client.get('/status')).json.mySubscriptions).toEqual([]);
  });

  it('P5: 500 → failed with status + body, last_error set; with a second phone that works → sent', async () => {
    const o = await owner();
    const a = await member(o);
    const { sub } = await phone(a.client);
    answers.set(sub.endpoint, { status: 500, body: 'push service broke' });
    const fireId = await ringReminder(o, a.id, '2026-11-04');
    const [d] = await deliveriesOf(fireId);
    expect(d.status).toBe('failed');
    expect(d.detail).toMatch(/500.*push service broke/);
    const [s] = (await a.client.get('/status')).json.mySubscriptions;
    expect(s.lastError).toMatch(/500.*push service broke/);

    await phone(a.client); // a second phone answers 201
    const fire2 = await ringReminder(o, a.id, '2026-11-05');
    const [d2] = await deliveriesOf(fire2);
    expect(d2.status).toBe('sent');
    expect(d2.detail).toMatch(/500/); // the failing phone is still named
  });

  it('P6: a member with no subscription → failed, no_subscription', async () => {
    const o = await owner();
    const a = await member(o);
    const fireId = await ringReminder(o, a.id, '2026-11-06');
    expect(await deliveriesOf(fireId)).toEqual([{ status: 'failed', detail: 'no_subscription' }]);
  });

  it('keys missing → every push delivery failed, push_not_configured; /push/test 503', async () => {
    const o = await owner();
    const a = await member(o);
    const { sub } = await phone(a.client);
    const ev = await o.post('/events', { title: 'No keys', startDate: '2026-11-07', startTime: '12:00', assignedTo: [a.id], reminder: { offsetMin: 0, channels: ['push'] } });
    await tickAt(o, '2026-11-07T00:00:00Z');
    const fire = await env.DB.prepare('SELECT id, due_at FROM fires WHERE event_id = ?').bind(ev.json.id).first<{ id: string; due_at: string }>();
    const r = await withoutBinding('VAPID_PRIVATE_KEY', `/dev/tick?now=${encodeURIComponent(fire!.due_at)}`, { method: 'POST' });
    expect(r.status).toBe(200);
    expect(await deliveriesOf(fire!.id)).toEqual([{ status: 'failed', detail: 'push_not_configured' }]);
    expect(to(sub)).toEqual([]);
    const t = await withoutBinding('VAPID_SUBJECT', '/push/test', { method: 'POST', headers: { cookie: a.client.cookie } });
    expect(t.status).toBe(503);
    expect((await t.json() as any).message).toBeTruthy();
  });

  it('P7: two sends to the same origin within the hour reuse one VAPID JWT; another origin or an hour later signs afresh', async () => {
    const o = await owner();
    const a = await member(o);
    const { sub: s1 } = await phone(a.client, 'https://p7.push.test');
    const { sub: s2 } = await phone(a.client, 'https://p7.push.test');
    const { sub: s3 } = await phone(a.client, 'https://p7-other.push.test');
    expect((await a.client.post('/push/test')).json).toEqual({ sent: 3 });
    expect((await a.client.post('/push/test')).json).toEqual({ sent: 3 });
    const jwts = [...to(s1), ...to(s2)].map((p) => jwtOf(p)![1]);
    expect(jwts).toHaveLength(4);
    expect(new Set(jwts).size).toBe(1);
    expect(jwtOf(to(s3)[0])![1]).not.toBe(jwts[0]);

    // The cache's clock is the passed-in `now`.
    const vapid = { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
    const t = { endpoint: 'https://p7-clock.push.test/x', p256dh: s1.keys.p256dh, auth: s1.keys.auth };
    await sendWebPush(vapid, t, '{}', { now: '2026-11-08T10:00:00Z' });
    await sendWebPush(vapid, t, '{}', { now: '2026-11-08T10:59:00Z' });
    await sendWebPush(vapid, t, '{}', { now: '2026-11-08T11:00:01Z' });
    const clock = pushed.filter((p) => p.url === t.endpoint).map((p) => jwtOf(p)![1]);
    expect(clock[0]).toBe(clock[1]);
    expect(clock[2]).not.toBe(clock[1]);
  });

  it('P8 + AN7: /push/test pushes to each of my phones (test body, no fire, no actions); 409 with a message when none', async () => {
    const o = await owner();
    const a = await member(o), b = await member(o);
    const { sub: s1 } = await phone(a.client), { sub: s2 } = await phone(a.client), { sub: other } = await phone(b.client);
    expect((await a.client.post('/push/test')).json).toEqual({ sent: 2 });
    expect(to(other)).toEqual([]);
    for (const s of [s1, s2]) {
      const [p] = to(s);
      expect(p.headers.get('topic')).toBe('enso-test'); // AN7
      expect(JSON.parse(await decryptPush(s, p.body))).toEqual({ fireId: null, kind: null, tag: 'enso-test', title: 'Ensō', body: 'Ensō test — phone alerts work', actions: [] });
    }
    const c = await member(o);
    const none = await c.client.post('/push/test');
    expect(none.status).toBe(409);
    expect(none.json.message).toBeTruthy();
  });

  it('/push/test when every phone fails → 502 with the failure, never { sent: 0 }', async () => {
    const o = await owner();
    const a = await member(o);
    const { sub } = await phone(a.client);
    answers.set(sub.endpoint, { status: 403, body: 'bad jwt' });
    const r = await a.client.post('/push/test');
    expect(r.status).toBe(502);
    expect(r.json.message).toMatch(/403.*bad jwt/);
  });

  it('AN4 + AN5: an announcement by phone → a push row per other active member; the push names the sender, tagged by its delivery id', async () => {
    const o = await owner();
    const withPhone = await member(o), without = await member(o), gone = await member(o);
    expect((await o.patch(`/members/${gone.id}`, { disabled: true })).status).toBe(200);
    const { sub } = await phone(withPhone.client, 'https://an5.push.test');
    const { sub: ownPhone } = await phone(o, 'https://an5.push.test');
    const r = await o.post('/announce', { text: ' Dinner is ready ', channels: ['push'] });
    expect(r.status).toBe(201);
    const byMember = Object.fromEntries(r.json.deliveries.map((d: any) => [d.memberId, d]));
    // Every other active member (earlier tests in this file made some too) — not the sender, not the disabled one.
    const others = (await env.DB.prepare('SELECT id FROM members WHERE disabled_at IS NULL AND id != ?').bind((await o.get('/me')).json.id)
      .all<{ id: string }>()).results.map((m) => m.id);
    expect(Object.keys(byMember).sort()).toEqual(others.sort());
    expect(others).toEqual(expect.arrayContaining([withPhone.id, without.id]));
    expect(others).not.toContain(gone.id);
    expect(r.json.deliveries.every((d: any) => d.channel === 'push')).toBe(true);
    expect(byMember[withPhone.id].status).toBe('sent');
    const row = await env.DB.prepare('SELECT status, detail, fire_id FROM deliveries WHERE id = ?').bind(byMember[without.id].id).first();
    expect(row).toEqual({ status: 'failed', detail: 'no_subscription', fire_id: null });
    expect(to(ownPhone)).toEqual([]);

    const [req, ...more] = to(sub);
    expect(more).toEqual([]);
    const id = byMember[withPhone.id].id;
    expect(req.headers.get('topic')).toBe(id);
    expect(JSON.parse(await decryptPush(sub, req.body))).toEqual({
      fireId: null, kind: null, tag: id, title: '📢 Announcement', body: 'MojoSOGO says: Dinner is ready', actions: [],
    });
  });
});
