// SPEC §8.18 SY1–SY8 — the Ensō button: POST /say reads what was said (Claude is a fake api.anthropic.com behind a
// fetch spy that refuses every other host; the key is fake), feature requests, and the build session's queue.
import { SELF, createExecutionContext, env } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/worker/index';
import type { Env } from '../src/worker/env';
import { READS_PER_DAY } from '../src/shared/things';
import { cleanSayReading, clarified, outsideSay, requestSay } from '../src/shared/say-reading';
import { closeMove, dismissMove, okMove, statusFor } from '../src/shared/feature-requests';
import { ADMIN_ROLE } from '../src/shared/roles';
import { addDays, utcToLocal } from '../src/shared/time';
import { BASE, Client, member, owner } from './helpers';
import { claudeMessage, keyedEnv, warmClaude } from './recipe-fakes';

declare global { namespace Cloudflare { interface Env { OPS_NOTIFY_TOKEN: string } } }
const AUTH = { authorization: 'Bearer test-ops-token', 'content-type': 'application/json' };

let o: Client, A: string;
beforeAll(async () => { o = await owner(); A = (await o.get('/me')).json.id; await warmClaude(); }, 60_000);
beforeEach(async () => { await env.DB.exec('DELETE FROM photo_reads'); });
afterEach(() => { vi.restoreAllMocks(); });

async function say(e: Env, answer: object | null, text: unknown = 'weekdays 8 to 11 remind me to book the car check', cookie = o.cookie) {
  const heard: any[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    if (url.host !== 'api.anthropic.com' || !answer) throw new Error(`a test tried to reach ${url.host}${url.pathname} — no fake for it`);
    heard.push(await req.json());
    return new Response(JSON.stringify(claudeMessage(answer)), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  const res = await worker.fetch(new Request(`${BASE}/say`, {
    method: 'POST', body: JSON.stringify({ text }), headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  }), e, createExecutionContext());
  return { status: res.status, json: await res.json<any>(), heard };
}
const none = { reminder: null, where: null, title: null, summary: null, size: null };
const reads = async () => (await env.DB.prepare('SELECT COUNT(*) AS n FROM photo_reads').first<{ n: number }>())!.n;
const requests = async () => (await env.DB.prepare('SELECT COUNT(*) AS n FROM feature_requests').first<{ n: number }>())!.n;

describe('§8.18 POST /say', () => {
  it('SY1 a window reminder for me → the reading; nothing saved; one read counted; the words sent', async () => {
    const before = await requests();
    const r = await say(keyedEnv(), { ...none, heard: 'Weekdays 8 to 11, remind me to book the car check.', kind: 'reminder',
      say: "I'll remind you on weekdays between 8 and 11am to book the car check.",
      reminder: { title: 'Book car check', date: null, time: null, days: ['MO', 'TU', 'WE', 'TH', 'FR'], from: '08:00', to: '11:00', who: ['me'] } });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.json).toEqual({ kind: 'reminder', heard: 'Weekdays 8 to 11, remind me to book the car check.',
      say: "I'll remind you on weekdays between 8 and 11am to book the car check.",
      reminder: { title: 'Book car check', assignedTo: [A], date: null, time: null, window: { days: ['MO', 'TU', 'WE', 'TH', 'FR'], from: '08:00', to: '11:00' } } });
    expect(await reads()).toBe(1);
    expect(await requests()).toBe(before);
    expect(JSON.stringify(r.heard[0])).toContain('book the car check');
  });

  it('SY2 exists → where; a big request → the fixed lines; no row saved', async () => {
    const before = await requests();
    const ex = await say(keyedEnv(), { ...none, heard: 'Check on the dog every hour.', kind: 'exists', say: 'Ensō already does this.', where: 'Alerts → ⏱ Rolling timers' });
    expect(ex.json).toMatchObject({ kind: 'exists', where: 'Alerts → ⏱ Rolling timers' });
    const rq = await say(keyedEnv(), { ...none, heard: 'Make the fridge order groceries.', kind: 'request', say: 'x', title: 'Fridge orders groceries', summary: 'Order food when the fridge is low.', size: 'big' });
    expect(rq.json).toEqual({ kind: 'request', heard: 'Make the fridge order groceries.', say: requestSay('big'),
      request: { title: 'Fridge orders groceries', summary: 'Order food when the fridge is low.', size: 'big' } });
    expect(await requests()).toBe(before);
  });

  it('SY7 outside the scope → the fixed line, where the part that fits lives, the ask for the log; no row saved', async () => {
    const before = await requests();
    const r = await say(keyedEnv(), { ...none, heard: 'Order our groceries from Amazon every Friday.', kind: 'outside', say: 'x',
      where: 'Lists → Shopping', title: 'Order groceries from Amazon', summary: 'Order the shopping list on Fridays.', size: 'big' });
    expect(r.json).toEqual({ kind: 'outside', heard: 'Order our groceries from Amazon every Friday.', say: outsideSay('Lists → Shopping'),
      where: 'Lists → Shopping', request: { title: 'Order groceries from Amazon', summary: 'Order the shopping list on Fridays.', size: 'big' } });
    const bare = await say(keyedEnv(), { ...none, heard: 'What is the news?', kind: 'outside', say: 'x', title: 'News', summary: '', size: null });
    expect(bare.json).toMatchObject({ kind: 'outside', where: null, say: outsideSay(null), request: { size: 'big' } });
    expect(JSON.stringify(r.heard[0])).toContain('banking');
    expect(await requests()).toBe(before);
  });

  it('SY6 blank → 400; reads used up → 429; no key → 503; signed out → 401', async () => {
    expect((await say(keyedEnv(), null, '  ')).status).toBe(400);
    expect((await say({ ...keyedEnv(), ANTHROPIC_API_KEY: '' }, null)).status).toBe(503);
    for (let i = 0; i < READS_PER_DAY; i++) await env.DB.prepare('INSERT INTO photo_reads (at, member_id) VALUES (?, ?)').bind(new Date().toISOString(), A).run();
    expect((await say(keyedEnv(), null)).status).toBe(429);
    vi.restoreAllMocks();
    expect((await SELF.fetch(`${BASE}/say`, { method: 'POST', body: '{"text":"hi"}', headers: { 'content-type': 'application/json' } })).status).toBe(401);
  });
});

describe('§8.18 feature requests', () => {
  it('SY3–SY5: saved by a member, listed for admins, OK / Dismiss, and the ops queue', async () => {
    const m = await member(o);
    const big = await m.client.post('/feature-requests', { text: 'make the fridge order groceries', title: 'Fridge orders', summary: 'Order food.', size: 'big' });
    expect(big.status).toBe(201);
    expect(big.json).toMatchObject({ status: 'needs_john', createdBy: m.id, size: 'big' });
    const small = await m.client.post('/feature-requests', { text: 'a dark blue theme', title: 'Blue theme', summary: '', size: 'small' });
    expect(small.json.status).toBe('new');
    expect((await m.client.post('/feature-requests', { text: 'x', title: 'y', size: 'huge' })).status).toBe(400);
    expect((await m.client.get('/feature-requests')).status).toBe(403);
    expect((await o.get('/feature-requests')).json.map((x: any) => x.id)).toEqual(expect.arrayContaining([big.json.id, small.json.id]));

    // A second admin may Dismiss but not OK.
    await env.DB.prepare('UPDATE members SET role = ? WHERE id = ?').bind(ADMIN_ROLE, m.id).run();
    expect((await m.client.post(`/feature-requests/${big.json.id}/ok`)).status).toBe(403);
    expect((await o.post(`/feature-requests/${small.json.id}/ok`)).status).toBe(409);
    expect((await o.post(`/feature-requests/${big.json.id}/ok`)).json.status).toBe('new');

    const q = await SELF.fetch(`${BASE}/ops/requests`, { headers: AUTH });
    const open = (await q.json<any>()).requests.map((x: any) => x.id);
    expect(open.indexOf(big.json.id)).toBeLessThan(open.indexOf(small.json.id));
    const done = await SELF.fetch(`${BASE}/ops/requests/${big.json.id}`, { method: 'PATCH', headers: AUTH, body: JSON.stringify({ status: 'done', note: 'v1.88.0' }) });
    expect(await done.json()).toMatchObject({ status: 'done', note: 'v1.88.0' });
    expect((await SELF.fetch(`${BASE}/ops/requests/${big.json.id}`, { method: 'PATCH', headers: AUTH, body: '{"status":"done"}' })).status).toBe(409);
    expect((await SELF.fetch(`${BASE}/ops/requests`)).status).toBe(401);
    expect((await m.client.post(`/feature-requests/${small.json.id}/dismiss`)).json.status).toBe('dismissed');
    expect((await o.get('/feature-requests')).json.find((x: any) => x.id === big.json.id).status).toBe('done');
  });
});

describe('§1.3 out of scope requests', () => {
  it('SY8 logged as outside, kept listed, not in the build queue; OK widens it, Dismiss closes it', async () => {
    const m = await member(o);
    const out = await m.client.post('/feature-requests', { text: 'order groceries from Amazon', title: 'Amazon groceries', summary: 'Order on Fridays.', size: 'big', outside: true });
    expect(out.json).toMatchObject({ status: 'outside', size: 'big' });
    const two = await m.client.post('/feature-requests', { text: 'what is the news', title: 'News', summary: '', size: 'small', outside: true });
    await env.DB.prepare(`UPDATE feature_requests SET updated_at = '2026-01-01T00:00:00.000Z' WHERE id = ?`).bind(out.json.id).run();
    expect((await o.get('/feature-requests')).json.map((x: any) => x.id)).toEqual(expect.arrayContaining([out.json.id, two.json.id]));
    const q = (await (await SELF.fetch(`${BASE}/ops/requests`, { headers: AUTH })).json<any>()).requests.map((x: any) => x.id);
    expect(q).not.toContain(out.json.id);
    expect((await SELF.fetch(`${BASE}/ops/requests/${two.json.id}`, { method: 'PATCH', headers: AUTH, body: '{"status":"done"}' })).status).toBe(409);
    expect((await o.post(`/feature-requests/${out.json.id}/ok`)).json.status).toBe('new');
    expect((await o.post(`/feature-requests/${two.json.id}/dismiss`)).json.status).toBe('dismissed');
  });
});

describe('§8.18 the rules', () => {
  const tz = 'America/Los_Angeles', now = '2026-10-19T17:00:00.000Z';
  const members = [{ id: 'mem_a', name: 'MojoSOGO' }, { id: 'mem_s', name: 'Shelly' }];
  const base = { heard: 'h', kind: 'reminder', say: 's', where: null, title: null, summary: null, size: null };
  it('cleanSayReading checks a reminder the way POST /reminders does', () => {
    const today = utcToLocal(now, tz).date;
    const one = cleanSayReading({ ...base, reminder: { title: 'Get bird food', date: today, time: '17:30', days: [], from: null, to: null, who: ['shelly', 'Nobody'] } }, { tz, now, meId: 'mem_a', members });
    expect(one).toMatchObject({ reminder: { date: today, time: '17:30', window: null, assignedTo: ['mem_s'] } });
    const past = cleanSayReading({ ...base, reminder: { title: 'x', date: addDays(today, -1), time: '08:00', days: [], from: null, to: null, who: [] } }, { tz, now, meId: 'mem_a', members });
    expect(past).toMatchObject({ reminder: { date: null, time: null, assignedTo: ['mem_a'] } });
    const badWindow = cleanSayReading({ ...base, reminder: { title: 'x', date: null, time: null, days: ['MO'], from: '11:00', to: '08:00', who: ['everyone'] } }, { tz, now, meId: 'mem_a', members });
    expect(badWindow).toMatchObject({ reminder: { window: null, assignedTo: [] } });
    expect(cleanSayReading({ ...base, reminder: { title: ' ', date: null, time: null, days: [], from: null, to: null, who: [] } }, { tz, now, meId: 'mem_a', members })).toBeNull();
    expect(cleanSayReading({ ...base, kind: 'request', title: 'T', size: null }, { tz, now, meId: 'mem_a', members })).toMatchObject({ request: { size: 'big' } });
  });
  it('the moves', () => {
    expect(statusFor('big', false)).toBe('needs_john');
    expect(statusFor('small', true)).toBe('outside');
    expect(okMove('outside', true)).toEqual({ status: 'new' });
    expect(okMove('new', true)).toMatchObject({ code: 409 });
    expect(dismissMove('outside', true)).toEqual({ status: 'dismissed' });
    expect(closeMove('outside', 'done')).toMatchObject({ code: 409 });
    expect(okMove('needs_john', true)).toEqual({ status: 'new' });
    expect(okMove('needs_john', false)).toMatchObject({ code: 403 });
    expect(dismissMove('done', true)).toMatchObject({ code: 409 });
    expect(closeMove('new', 'built')).toMatchObject({ code: 400 });
    expect(clarified('remind me', 'at 9')).toBe('remind me\nat 9');
  });
});
