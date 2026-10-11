// SPEC §9.2c AW1–AW4 — "I'm away" on one alert: its speakers stop, it stays open, it stays open, silent.
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import worker from '../src/worker/index';
import { BASE, Client, member, owner } from './helpers';
import { fakeHa, houseEnv } from './ha-helpers';

let A: Client, aId: string;
let ha: ReturnType<typeof fakeHa>;
beforeAll(async () => {
  A = await owner();
  aId = (await A.get('/me')).json.id;
  await member(A);
});
beforeEach(async () => {
  ha = fakeHa();
  await env.DB.prepare('DELETE FROM deliveries').run();
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
const tick = async (iso: string) => expect((await call(A, 'POST', `/dev/tick?now=${encodeURIComponent(iso)}`)).status).toBe(200);
const rowsOf = async (fireId: string, alertNumber: number) => (await env.DB.prepare(
  'SELECT channel FROM deliveries WHERE fire_id = ? AND alert_number = ?').bind(fireId, alertNumber).all<any>()).results.map((r: any) => r.channel);

it('AW1 + AW2: Away on a ringing reminder keeps it open; its next alert writes no delivery', async () => {
  const date = '2026-11-20';
  const ev = await A.post('/events', { title: 'Vet', startDate: date, endDate: date, startTime: '12:00',
    reminder: { offsetMin: 0, channels: ['push', 'house'], renotifyMin: 5 } });
  expect(ev.status, JSON.stringify(ev.json)).toBe(201);
  await tick(`${date}T19:59:00.000Z`);
  await tick(`${date}T20:00:30.000Z`);
  const fire = (await env.DB.prepare('SELECT * FROM fires WHERE event_id = ?').bind(ev.json.id).first<any>())!;
  expect(fire.state).toBe('ringing');

  const r = await call(A, 'POST', `/fires/${fire.id}/away`);
  expect(r.status).toBe(200);
  expect(r.json).toMatchObject({ id: fire.id, awayBy: aId, state: 'ringing', alertCount: fire.alert_count, dueAt: fire.due_at, title: 'Vet' });
  expect((await call(A, 'GET', '/fires')).json.find((f: any) => f.id === fire.id).awayBy).toBe(aId);
  expect((await call(A, 'POST', '/fires/fire_nope/away')).status).toBe(404);
  expect((await call(null, 'POST', `/fires/${fire.id}/away`)).status).toBe(401);

  ha.heard.length = 0;
  await tick(`${date}T20:06:00.000Z`);
  expect(await rowsOf(fire.id, 2)).toEqual([]);
  expect(ha.heard).toHaveLength(0);
  expect((await env.DB.prepare('SELECT alert_count FROM fires WHERE id = ?').bind(fire.id).first<any>())!.alert_count).toBe(2);

  expect((await call(A, 'POST', `/fires/${fire.id}/actions`, { action: 'done' })).status).toBe(200);
  const closed = await call(A, 'POST', `/fires/${fire.id}/away`);
  expect(closed.status).toBe(409);
  expect(closed.json.error).toBe('invalid_action');
});

it('AW3: a timer that is away, then Ack → the next countdown is not away', async () => {
  const t = await A.post('/timers', { title: 'Dog', intervalMin: 60, channels: ['push', 'house'] });
  expect(t.status).toBe(201);
  await A.post(`/timers/${t.json.id}/commands`, { cmd: 'start' });
  const f = (await env.DB.prepare(`SELECT id FROM fires WHERE timer_id = ? AND state != 'closed'`).bind(t.json.id).first<any>())!;
  expect((await call(A, 'POST', `/fires/${f.id}/away`)).status).toBe(200);
  expect((await call(A, 'POST', `/fires/${f.id}/actions`, { action: 'ack' })).status).toBe(200);
  const next = (await env.DB.prepare(`SELECT id, away_by FROM fires WHERE timer_id = ? AND state != 'closed'`).bind(t.json.id).first<any>())!;
  expect(next.id).not.toBe(f.id);
  expect(next.away_by).toBeNull();
  await A.post(`/timers/${t.json.id}/commands`, { cmd: 'stop' });
});

it('AW4: Away on a ringing machine fire → its next reminder writes no delivery', async () => {
  await A.patch('/machines/hours', { weekday: null, weekend: null }); // the real clock: ring at any hour (§7D.5)
  expect((await call(A, 'POST', '/machines/washer/done', { ownerId: aId })).status).toBe(200);
  const at = (min: number) => new Date(Date.now() + min * 60_000).toISOString();
  await tick(at(0.1));
  const fire = (await env.DB.prepare(`SELECT * FROM fires WHERE machine_id = 'washer' AND state = 'ringing'`).first<any>())!;
  expect((await call(A, 'POST', `/fires/${fire.id}/away`)).status).toBe(200);
  ha.heard.length = 0;
  await tick(at(16));
  expect(await rowsOf(fire.id, 2)).toEqual([]);
  expect(ha.heard).toHaveLength(0);
  expect((await call(A, 'POST', '/machines/washer/clear')).status).toBe(200);
});
