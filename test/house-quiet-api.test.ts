// SPEC §9.2b HQ2–HQ6 — quiet the house through the API and the tick: no house row while quiet, phones unchanged.
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import worker from '../src/worker/index';
import { BASE, Client, member, owner } from './helpers';
import { fakeHa, houseEnv } from './ha-helpers';

let A: Client, B: Client, aId: string;
let ha: ReturnType<typeof fakeHa>;
beforeAll(async () => {
  A = await owner();
  aId = (await A.get('/me')).json.id;
  B = (await member(A)).client;
});
beforeEach(async () => {
  ha = fakeHa();
  await env.DB.prepare('DELETE FROM deliveries').run();
  await env.DB.prepare('UPDATE settings SET house_quiet_until = NULL, house_quiet_by = NULL WHERE id = 1').run();
});
afterEach(() => { vi.restoreAllMocks(); });

async function call(c: Client | null, method: string, path: string, body?: unknown) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`${BASE}${path}`, {
    method, headers: { 'content-type': 'application/json', ...(c && { cookie: c.cookie }) }, body: body === undefined ? undefined : JSON.stringify(body),
  }), houseEnv(), ctx);
  await waitOnExecutionContext(ctx);
  return { status: res.status, json: await res.json<any>() };
}
const quietUntil = (until: string) =>
  env.DB.prepare('UPDATE settings SET house_quiet_until = ?, house_quiet_by = ? WHERE id = 1').bind(until, aId).run();
const rows = async (channel: string) => (await env.DB.prepare('SELECT * FROM deliveries WHERE channel = ?').bind(channel).all<any>()).results;

async function ring(title: string, date: string) {
  const ev = await A.post('/events', { title, startDate: date, endDate: date, startTime: '12:00', reminder: { offsetMin: 0, channels: ['push', 'house'] } });
  expect(ev.status, JSON.stringify(ev.json)).toBe(201);
  for (const at of ['19:59:00', '20:00:30']) expect((await call(A, 'POST', `/dev/tick?now=${encodeURIComponent(`${date}T${at}.000Z`)}`)).status).toBe(200);
  return (await env.DB.prepare('SELECT id, alert_count FROM fires WHERE event_id = ?').bind(ev.json.id).first<any>())!;
}

it('HQ2: PUT sets it for the household with the setter; GET reads it; DELETE turns it off; refusals', async () => {
  expect(await call(A, 'GET', '/house/quiet')).toEqual({ status: 200, json: { until: null, byName: null } });
  const before = Date.now();
  const r = await call(B, 'PUT', '/house/quiet', { for: '2h' });
  expect(r.status).toBe(200);
  const ahead = Date.parse(r.json.until) - before;
  expect(ahead).toBeGreaterThanOrEqual(2 * 3600_000 - 1000);
  expect(ahead).toBeLessThanOrEqual(2 * 3600_000 + 5000);
  const bName = (await B.get('/me')).json.displayName;
  expect(r.json.byName).toBe(bName);
  expect((await call(A, 'GET', '/house/quiet')).json).toEqual(r.json);
  expect(await call(A, 'DELETE', '/house/quiet')).toEqual({ status: 200, json: { until: null, byName: null } });
  expect((await call(A, 'GET', '/house/quiet')).json.until).toBeNull();
  const bad = await call(A, 'PUT', '/house/quiet', { for: '3h' });
  expect(bad.status).toBe(400);
  expect(bad.json.error).toBe('invalid_input');
  expect((await call(null, 'GET', '/house/quiet')).status).toBe(401);
  await quietUntil('2020-01-01T00:00:00.000Z'); // ended on its own
  expect((await call(A, 'GET', '/house/quiet')).json).toEqual({ until: null, byName: null });
});

it('HQ3: a fire while quiet → push rows written and sent, no house row, zero HA calls, the fire steps', async () => {
  await quietUntil('2026-11-10T21:00:00.000Z');
  const fire = await ring('Dentist', '2026-11-10');
  expect(fire.alert_count).toBe(1);
  expect(await rows('house')).toHaveLength(0);
  expect((await rows('push')).length).toBeGreaterThan(0);
  expect(ha.heard).toHaveLength(0);
});

it('HQ4: after quiet ended, the house row is written and spoken as before', async () => {
  await quietUntil('2026-11-11T19:00:00.000Z');
  await ring('Pick up', '2026-11-11');
  const [house] = await rows('house');
  expect(house.status).toBe('sent');
  expect(ha.heard.length).toBeGreaterThan(0);
});

it('HQ5: announce while quiet — House only → 409 house_quiet, nothing written; Phone + House → push only', async () => {
  await quietUntil('2099-01-01T08:00:00.000Z');
  const only = await call(A, 'POST', '/announce', { text: 'Dinner', channels: ['house'] });
  expect(only.status).toBe(409);
  expect(only.json).toEqual({ error: 'house_quiet', message: 'The house is quiet until 00:00.' });
  expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM deliveries').first<{ n: number }>())!.n).toBe(0);
  const both = await call(A, 'POST', '/announce', { text: 'Dinner', channels: ['house', 'push'] });
  expect(both.status).toBe(201);
  expect(both.json.deliveries.map((d: any) => d.channel)).toEqual(['push']);
  expect(ha.heard).toHaveLength(0);
});

it("HQ6: a timer's start announcement while quiet → push rows only", async () => {
  const t = await A.post('/timers', { title: 'Squats', intervalMin: 60, channels: ['push', 'house'], activeFrom: '08:00', activeTo: '21:00', announceStart: true });
  expect(t.status).toBe(201);
  await A.post(`/timers/${t.json.id}/commands`, { cmd: 'start' });
  await quietUntil('2026-11-12T20:00:00.000Z');
  await call(A, 'POST', `/dev/tick?now=${encodeURIComponent('2026-11-12T16:01:00.000Z')}`); // 08:01 PST
  const words = 'Squats timer started — every 60 minutes';
  const said = (await env.DB.prepare('SELECT channel FROM deliveries WHERE message = ?').bind(words).all<any>()).results;
  expect(said.length).toBeGreaterThan(0);
  expect(said.every((d: any) => d.channel === 'push')).toBe(true);
  await A.post(`/timers/${t.json.id}/commands`, { cmd: 'stop' });
});
