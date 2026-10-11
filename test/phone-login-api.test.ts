// M4w acceptance (SPEC §6.6, PL4–PL15) — Sign in with my phone through the Worker. No push ever leaves the
// isolate: outbound fetch to *.push.test is answered here and any other host fails the test. The waiting browser
// calls the Worker with its own ExecutionContext and waits on it, so the push sent inside waitUntil has settled
// before a test looks. Time is moved by rewriting a row's instants. The pure rules are phone-login.test.ts; the
// migration (PL-M) is migration-0025.test.ts.
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import worker from '../src/worker/index';
import { NOTICE_TITLE, approveLoginUrl, loginRequestMessage } from '../src/shared/phone-login';
import { LOGIN_REQUEST_STATUS, NOTICE_KIND } from '../src/shared/vocab';
import { BASE, Client, member, owner } from './helpers';
import { decryptPush, fakeSubscriber, type FakeSubscriber } from './push-helpers';

const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const FIREFOX_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:131.0) Gecko/20100101 Firefox/131.0';
const PASSWORD = 'member-password-1'; // helpers.ts member()

interface Pushed { url: string; body: Uint8Array }
const pushed: Pushed[] = [];
const realFetch = globalThis.fetch;
const isPushTest = (url: string) => { const h = new URL(url).hostname; return h === 'push.test' || h.endsWith('.push.test'); };

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    if (new URL(req.url).hostname === 'hrc.test') return realFetch(input, init); // the Worker under test (SELF)
    if (!isPushTest(req.url)) throw new Error(`a test tried to reach ${new URL(req.url).host} — only *.push.test is allowed`);
    pushed.push({ url: req.url, body: new Uint8Array(await req.arrayBuffer()) });
    return new Response('', { status: 201 });
  });
});
afterEach(() => { vi.restoreAllMocks(); pushed.length = 0; });

/** One call to the Worker with its own ExecutionContext, waited on (the waitUntil push included). */
async function call(method: string, path: string, opts: { cookie?: string; body?: unknown; ua?: string } = {}) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', 'user-agent': opts.ua ?? CHROME_WIN, ...(opts.cookie ? { cookie: opts.cookie } : {}) },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  }), env as any, ctx);
  await waitOnExecutionContext(ctx);
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null, cookies: res.headers.getSetCookie() };
}
const cookieNamed = (cookies: string[], name: string) => cookies.find((c) => c.startsWith(`${name}=`));
const pair = (setCookie: string | undefined) => (setCookie ?? '').split(';')[0];

/** A browser waiting to be signed in: its waiting cookie, and the session cookie once it has one. */
class Browser {
  waiting = '';
  session = '';
  constructor(public ua = CHROME_WIN) {}
  async ask(email: string) {
    const r = await call('POST', '/auth/phone-login', { body: { email }, ua: this.ua });
    this.waiting = pair(cookieNamed(r.cookies, 'hrc_phone_login'));
    return r;
  }
  async poll() {
    const r = await call('GET', '/auth/phone-login', { cookie: this.waiting || undefined, ua: this.ua });
    const s = cookieNamed(r.cookies, 'hrc_session');
    if (s) this.session = pair(s);
    return r;
  }
}

const sha256hex = async (s: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');
/** The login_requests row a browser is waiting on. */
async function rowOf(b: Browser) {
  return (await env.DB.prepare('SELECT * FROM login_requests WHERE waiting_token_hash = ?')
    .bind(await sha256hex(b.waiting.split('=')[1])).first<any>())!;
}
const n = async (sql: string, ...params: unknown[]) => (await env.DB.prepare(sql).bind(...params).first<{ n: number }>())!.n;
const loginPushes = (memberId: string) => env.DB.prepare(
  `SELECT * FROM deliveries WHERE notice = 'login' AND member_id = ? ORDER BY created_at, rowid`).bind(memberId).all<any>().then((r) => r.results);
const emailOf = async (id: string) => (await env.DB.prepare('SELECT email FROM members WHERE id = ?').bind(id).first<{ email: string }>())!.email;

/** A member of the household with a session, their email, and (optionally) a fake phone subscribed. */
async function person(o: Client, withPhone: boolean) {
  const m = await member(o);
  let sub: FakeSubscriber | null = null;
  if (withPhone) {
    sub = await fakeSubscriber(`https://pl.push.test/sub/${crypto.randomUUID()}`);
    expect((await m.client.post('/push/subscriptions', { endpoint: sub.endpoint, keys: sub.keys, userAgent: 'test phone' })).status).toBe(201);
  }
  return { ...m, email: await emailOf(m.id), sub };
}

function expectIdenticalShape(r: Awaited<ReturnType<typeof call>>) {
  expect(r.status).toBe(202);
  expect(Object.keys(r.json).sort()).toEqual(['expiresAt', 'match']);
  expect(r.json.match).toBeGreaterThanOrEqual(10);
  expect(r.json.match).toBeLessThanOrEqual(99);
  const c = cookieNamed(r.cookies, 'hrc_phone_login')!;
  expect(c).toMatch(/^hrc_phone_login=[0-9a-f]{64};/);
  expect(c).toContain('HttpOnly');
  expect(c).toContain('Secure');
  expect(c).toContain('SameSite=Lax');
  expect(c).toContain('Path=/api/v1/auth/phone-login');
  expect(cookieNamed(r.cookies, 'hrc_session')).toBeUndefined();
}

it('PL4: a real member with a phone, an unknown email, a disabled member, a member without a phone → the identical 202', async () => {
  const o = await owner();
  const real = await person(o, true);
  const phoneless = await person(o, false);
  const disabled = await person(o, true);
  expect((await o.patch(`/members/${disabled.id}`, { disabled: true })).status).toBe(200);

  const browsers: Record<string, Browser> = {};
  for (const [name, email] of [['real', real.email], ['unknown', 'nobody-here@example.com'], ['disabled', disabled.email], ['phoneless', phoneless.email]]) {
    browsers[name] = new Browser();
    expectIdenticalShape(await browsers[name].ask(email));
  }
  expect((await rowOf(browsers.real)).member_id).toBe(real.id);
  expect((await rowOf(browsers.phoneless)).member_id).toBe(phoneless.id);
  expect((await rowOf(browsers.unknown)).member_id).toBeNull(); // a decoy
  expect((await rowOf(browsers.disabled)).member_id).toBeNull();
  for (const b of Object.values(browsers)) expect((await b.poll()).json).toEqual({ status: 'pending' });

  expect((await loginPushes(real.id)).map((d) => [d.status, d.detail])).toEqual([['sent', null]]);
  expect((await loginPushes(phoneless.id)).map((d) => [d.status, d.detail])).toEqual([['failed', 'no_subscription']]);
  expect(await loginPushes(disabled.id)).toEqual([]);
  expect(pushed.filter((p) => p.url === disabled.sub!.endpoint)).toEqual([]);
  expect(await n(`SELECT COUNT(*) AS n FROM deliveries WHERE notice = 'login' AND member_id IS NULL`)).toBe(0);
  expect(await n(`SELECT COUNT(*) AS n FROM deliveries WHERE notice IS NOT NULL AND channel = 'house'`)).toBe(0);

  // A malformed email is the one refusal — its format only.
  const bad = await call('POST', '/auth/phone-login', { body: { email: 'not an email' } });
  expect(bad.status).toBe(400);
  expect(bad.json.error).toBe('invalid_input');
});

it('PL5: the 4th request within 15 minutes gets the same 202 but no push; an older request does not count', async () => {
  const o = await owner();
  const p = await person(o, true);
  for (let i = 0; i < 3; i++) expectIdenticalShape(await new Browser().ask(p.email));
  expect(await loginPushes(p.id)).toHaveLength(3);
  const fourth = new Browser();
  expectIdenticalShape(await fourth.ask(p.email));
  expect(await loginPushes(p.id)).toHaveLength(3);
  expect((await rowOf(fourth)).member_id).toBeNull(); // a decoy: nobody can approve it
  // Over the limit never touches the member's pending request (the 3rd stays pending).
  expect(await n(`SELECT COUNT(*) AS n FROM login_requests WHERE member_id = ? AND status = 'pending'`, p.id)).toBe(1);

  // Move every earlier request 16 minutes back: none counts any more.
  await env.DB.prepare(`UPDATE login_requests SET created_at = ? WHERE email = ?`)
    .bind(new Date(Date.now() - 16 * 60_000).toISOString(), p.email).run();
  await new Browser().ask(p.email);
  expect(await loginPushes(p.id)).toHaveLength(4);
});

it('PL6: a second request moves the first, still pending, to denied (the row is kept)', async () => {
  const o = await owner();
  const p = await person(o, false);
  const first = new Browser();
  const second = new Browser();
  await first.ask(p.email);
  await second.ask(p.email);
  const old = await rowOf(first);
  expect(old.status).toBe('denied');
  expect(old.decided_at).toBeTruthy();
  expect((await first.poll()).json).toEqual({ status: 'denied' });
  expect((await second.poll()).json).toEqual({ status: 'pending' });
  expect(await n('SELECT COUNT(*) AS n FROM login_requests WHERE email = ?', p.email)).toBe(2);
});

it('PL7: a wrong number denies; "This wasn\'t me" denies; a second answer → 409 not_pending', async () => {
  const o = await owner();
  const p = await person(o, false);
  const b = new Browser();
  await b.ask(p.email);
  const r = await rowOf(b);
  const wrong = (JSON.parse(r.choices) as number[]).find((x) => x !== r.match_number)!;
  expect((await p.client.post(`/auth/phone-login/${r.id}/approve`, { number: wrong })).json).toEqual({ status: 'denied' });
  expect((await b.poll()).json).toEqual({ status: 'denied' });
  const again = await p.client.post(`/auth/phone-login/${r.id}/approve`, { number: r.match_number });
  expect(again.status).toBe(409);
  expect(again.json.error).toBe('not_pending');
  expect(again.json.message).toBeTruthy();
  expect((await p.client.get(`/auth/phone-login/${r.id}`)).json.status).toBe('denied');

  const b2 = new Browser();
  await b2.ask(p.email);
  const r2 = await rowOf(b2);
  expect((await p.client.post(`/auth/phone-login/${r2.id}/deny`)).json).toEqual({ status: 'denied' });
  expect((await b2.poll()).json).toEqual({ status: 'denied' });
  expect((await p.client.post(`/auth/phone-login/${r2.id}/deny`)).status).toBe(409);

  // Not a number → 400; nothing changes.
  const b3 = new Browser();
  await b3.ask(p.email);
  const r3 = await rowOf(b3);
  for (const number of ['42', 4.2, null, undefined]) {
    const bad = await p.client.post(`/auth/phone-login/${r3.id}/approve`, { number });
    expect(bad.status, JSON.stringify(number)).toBe(400);
    expect(bad.json.error).toBe('invalid_input');
  }
  expect((await rowOf(b3)).status).toBe('pending');
});

it('PL8: another member, an admin, and anyone on a decoy get 404 — and the request stays pending', async () => {
  const o = await owner();
  const p = await person(o, false);
  const other = await person(o, false);
  const b = new Browser();
  await b.ask(p.email);
  const r = await rowOf(b);
  for (const c of [other.client, o]) {
    for (const res of [
      await c.get(`/auth/phone-login/${r.id}`),
      await c.post(`/auth/phone-login/${r.id}/approve`, { number: r.match_number }),
      await c.post(`/auth/phone-login/${r.id}/deny`),
    ]) {
      expect(res.status).toBe(404);
      expect(res.json.error).toBe('not_found');
    }
  }
  expect((await rowOf(b)).status).toBe('pending');
  expect((await new Client().get(`/auth/phone-login/${r.id}`)).status).toBe(401); // no session at all

  // The requested member sees it — browser, place, times, three choices — and never the match as such.
  const seen = await p.client.get(`/auth/phone-login/${r.id}`);
  expect(seen.status).toBe(200);
  expect(seen.json).toEqual({
    id: r.id, browser: 'Chrome on Windows', place: 'Place unknown', createdAt: r.created_at, expiresAt: r.expires_at,
    status: 'pending', choices: JSON.parse(r.choices),
  });

  // A decoy (an unknown email) is nobody's; an unknown id likewise.
  const decoy = new Browser();
  await decoy.ask('nobody-at-all@example.com');
  const d = await rowOf(decoy);
  expect((await p.client.get(`/auth/phone-login/${d.id}`)).status).toBe(404);
  expect((await p.client.post(`/auth/phone-login/${d.id}/approve`, { number: d.match_number })).status).toBe(404);
  expect((await p.client.get('/auth/phone-login/lgn_nope')).status).toBe(404);
});

it('PL9: a poll with no waiting cookie, a made-up one, or another browser\'s cannot collect this request', async () => {
  const o = await owner();
  const p = await person(o, false);
  const q = await person(o, false);
  const b = new Browser();
  await b.ask(p.email);
  const r = await rowOf(b);
  expect((await p.client.post(`/auth/phone-login/${r.id}/approve`, { number: r.match_number })).json).toEqual({ status: 'approved' });

  const none = await call('GET', '/auth/phone-login');
  expect(none.status).toBe(404);
  expect(none.json.error).toBe('not_found');
  expect(cookieNamed(none.cookies, 'hrc_session')).toBeUndefined();
  const madeUp = await call('GET', '/auth/phone-login', { cookie: `hrc_phone_login=${'ab'.repeat(32)}` });
  expect(madeUp.status).toBe(404);
  // The session cookie of a member is not a waiting cookie.
  expect((await call('GET', '/auth/phone-login', { cookie: p.client.cookie })).status).toBe(404);

  const elsewhere = new Browser();
  await elsewhere.ask(q.email);
  const theirs = await elsewhere.poll();
  expect(theirs.json).toEqual({ status: 'pending' }); // its own request, not p's
  expect(cookieNamed(theirs.cookies, 'hrc_session')).toBeUndefined();
  expect((await rowOf(b)).status).toBe('approved'); // still waiting for its own browser
});

it('PL10 + PL13: the right number → one session for the waiting browser, once; no new-sign-in push for it', async () => {
  const o = await owner();
  const p = await person(o, true);
  const sessions = () => n('SELECT COUNT(*) AS n FROM sessions WHERE member_id = ?', p.id);
  const before = await sessions();
  const b = new Browser();
  await b.ask(p.email);
  const r = await rowOf(b);
  expect((await b.poll()).json).toEqual({ status: 'pending' });
  expect((await p.client.post(`/auth/phone-login/${r.id}/approve`, { number: r.match_number })).json).toEqual({ status: 'approved' });
  expect(await sessions()).toBe(before);

  const got = await b.poll();
  expect(got.json).toEqual({ status: 'approved' });
  expect(b.session).toMatch(/^hrc_session=/);
  expect(cookieNamed(got.cookies, 'hrc_phone_login')).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/); // cleared
  expect(await sessions()).toBe(before + 1);
  const me = await call('GET', '/me', { cookie: b.session });
  expect(me.status).toBe(200);
  expect(me.json.id).toBe(p.id);
  const used = await rowOf(b);
  expect(used.status).toBe('used');
  expect(used.used_at).toBeTruthy();

  // The same waiting cookie again (replayed): spent, and no second session.
  const replay = await b.poll();
  expect(replay.json).toEqual({ status: 'expired' });
  expect(cookieNamed(replay.cookies, 'hrc_session')).toBeUndefined();
  expect(await sessions()).toBe(before + 1);
  // The phone sees its approval did sign the browser in.
  expect((await p.client.get(`/auth/phone-login/${r.id}`)).json.status).toBe('approved');
  // PL13: a phone approval sends no "New sign-in" notice.
  expect(await n(`SELECT COUNT(*) AS n FROM deliveries WHERE notice = 'new_sign_in' AND member_id = ?`, p.id)).toBe(0);
});

it('PL11: past expires_at → the poll says expired, approve is 409 expired, nothing is minted', async () => {
  const o = await owner();
  const p = await person(o, false);
  const past = new Date(Date.now() - 1000).toISOString();

  const b = new Browser();
  await b.ask(p.email);
  const r = await rowOf(b);
  await env.DB.prepare('UPDATE login_requests SET expires_at = ? WHERE id = ?').bind(past, r.id).run();
  expect((await b.poll()).json).toEqual({ status: 'expired' });
  const late = await p.client.post(`/auth/phone-login/${r.id}/approve`, { number: r.match_number });
  expect(late.status).toBe(409);
  expect(late.json.error).toBe('expired');
  expect((await p.client.get(`/auth/phone-login/${r.id}`)).json.status).toBe('expired');
  expect((await rowOf(b)).status).toBe('pending'); // expired is derived, never stored

  // Approved in time, but not collected in time: the poll mints nothing (⚑ Q137).
  const sessionsBefore = await n('SELECT COUNT(*) AS n FROM sessions WHERE member_id = ?', p.id);
  const b2 = new Browser();
  await b2.ask(p.email);
  const r2 = await rowOf(b2);
  expect((await p.client.post(`/auth/phone-login/${r2.id}/approve`, { number: r2.match_number })).json).toEqual({ status: 'approved' });
  await env.DB.prepare('UPDATE login_requests SET expires_at = ? WHERE id = ?').bind(past, r2.id).run();
  const poll = await b2.poll();
  expect(poll.json).toEqual({ status: 'expired' });
  expect(cookieNamed(poll.cookies, 'hrc_session')).toBeUndefined();
  expect(await n('SELECT COUNT(*) AS n FROM sessions WHERE member_id = ?', p.id)).toBe(sessionsBefore);
});

it('PL12: the login push — notice login, url to the approve page, its own title, and never the match number', async () => {
  const o = await owner();
  const p = await person(o, true);
  const b = new Browser();
  const asked = await b.ask(p.email);
  const r = await rowOf(b);
  const [d, ...more] = await loginPushes(p.id);
  expect(more).toEqual([]);
  const message = loginRequestMessage('Chrome on Windows');
  expect(d).toMatchObject({
    fire_id: null, alert_number: 1, channel: 'push', member_id: p.id, message, title: NOTICE_TITLE, notice: 'login',
    url: approveLoginUrl(r.id), status: 'sent',
  });
  expect(d.url).toBe(`/approve-login#${r.id}`);
  const match = String(asked.json.match);
  expect(d.message).not.toContain(match);
  expect(d.title).not.toContain(match);

  const [req, ...others] = pushed.filter((x) => x.url === p.sub!.endpoint);
  expect(others).toEqual([]);
  const payload = JSON.parse(await decryptPush(p.sub!, req.body));
  expect(payload).toEqual({ fireId: null, kind: null, tag: d.id, title: NOTICE_TITLE, body: message, actions: [], url: approveLoginUrl(r.id), alertId: d.id });
  expect(payload.body).not.toContain(match);
  expect(payload.title).not.toContain(match);
});

it('PL13: a password sign-in by a member with a phone → one "New sign-in on …" push; without a phone → no row', async () => {
  const o = await owner();
  const p = await person(o, true);
  const bare = await person(o, false);
  const pc = new Client();
  const r = await pc.post('/auth/login', { email: p.email, password: PASSWORD }, { 'user-agent': FIREFOX_MAC });
  expect(r.status).toBe(200);
  const rows = (await env.DB.prepare(`SELECT * FROM deliveries WHERE notice = 'new_sign_in' AND member_id = ?`).bind(p.id).all<any>()).results;
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ fire_id: null, channel: 'push', message: 'New sign-in on Firefox on Mac', title: NOTICE_TITLE, url: null, status: 'sent' });
  const [req] = pushed.filter((x) => x.url === p.sub!.endpoint);
  expect(JSON.parse(await decryptPush(p.sub!, req.body))).toEqual({
    fireId: null, kind: null, tag: rows[0].id, title: NOTICE_TITLE, body: 'New sign-in on Firefox on Mac', actions: [], url: null, alertId: rows[0].id,
  });

  expect((await new Client().post('/auth/login', { email: bare.email, password: PASSWORD })).status).toBe(200);
  expect(await n(`SELECT COUNT(*) AS n FROM deliveries WHERE member_id = ?`, bare.id)).toBe(0);
  // A failed password sign-in sends nothing.
  expect((await new Client().post('/auth/login', { email: p.email, password: 'wrong-password-x' })).status).toBe(401);
  expect(await n(`SELECT COUNT(*) AS n FROM deliveries WHERE notice = 'new_sign_in' AND member_id = ?`, p.id)).toBe(1);
});

it('PL14: sign-in notices never count toward the /ops/notify hourly limit', async () => {
  const o = await owner();
  const founder = (await o.get('/me')).json.id as string;
  const now = new Date().toISOString();
  await env.DB.batch(Array.from({ length: 40 }, (_, i) => env.DB.prepare(
    `INSERT INTO deliveries (id, fire_id, alert_number, channel, member_id, message, title, notice, status, created_at, updated_at)
     VALUES (?, NULL, 1, 'push', ?, 'x', ?, ?, 'sent', ?, ?)`).bind(`dlv_pl14_${i}`, founder, NOTICE_TITLE, i % 2 ? 'login' : 'new_sign_in', now, now)));
  const r = await new Client().post('/ops/notify', { text: 'still allowed' }, { authorization: 'Bearer test-ops-token' });
  expect(r.status).toBe(201);
});

it('PL15: every notice and status the routes produce is accepted by the migrated CHECKs (producer against consumer)', async () => {
  const o = await owner();
  const p = await person(o, true);
  const statuses = new Set<string>();
  const b = new Browser();
  await b.ask(p.email);
  const r = await rowOf(b);
  statuses.add(r.status); // pending
  await p.client.post(`/auth/phone-login/${r.id}/approve`, { number: r.match_number });
  statuses.add((await rowOf(b)).status); // approved
  await b.poll();
  statuses.add((await rowOf(b)).status); // used
  const b2 = new Browser();
  await b2.ask(p.email);
  await p.client.post(`/auth/phone-login/${(await rowOf(b2)).id}/deny`);
  statuses.add((await rowOf(b2)).status); // denied
  await new Client().post('/auth/login', { email: p.email, password: PASSWORD }); // a new_sign_in notice
  expect([...statuses].sort()).toEqual([...LOGIN_REQUEST_STATUS].sort());
  const notices = (await env.DB.prepare('SELECT DISTINCT notice FROM deliveries WHERE member_id = ? AND notice IS NOT NULL')
    .bind(p.id).all<{ notice: string }>()).results.map((x) => x.notice);
  expect(notices.sort()).toEqual([...NOTICE_KIND].sort());
  // And the consumer refuses anything else.
  await expect(env.DB.prepare(`UPDATE deliveries SET notice = 'alert' WHERE member_id = ?`).bind(p.id).run()).rejects.toThrow();
  await expect(env.DB.prepare(`UPDATE login_requests SET status = 'expired' WHERE id = ?`).bind(r.id).run()).rejects.toThrow();
});
