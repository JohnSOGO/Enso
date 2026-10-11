// SPEC §9.2d PF2–PF3 — phone first through the tick: a repeating Phone + House alert speaks from its second alert.
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import worker from '../src/worker/index';
import { BASE, Client, member, owner } from './helpers';
import { fakeHa, houseEnv } from './ha-helpers';

let A: Client;
let ha: ReturnType<typeof fakeHa>;
beforeAll(async () => { A = await owner(); await member(A); });
beforeEach(async () => { ha = fakeHa(); await env.DB.prepare('DELETE FROM deliveries').run(); });
afterEach(() => { vi.restoreAllMocks(); });

async function tick(iso: string) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`${BASE}/dev/tick?now=${encodeURIComponent(iso)}`, { method: 'POST', headers: { cookie: A.cookie } }), houseEnv(), ctx);
  await waitOnExecutionContext(ctx);
  expect(res.status).toBe(200);
}
const channelsOf = async (fireId: string, n: number) => (await env.DB.prepare(
  'SELECT channel FROM deliveries WHERE fire_id = ? AND alert_number = ?').bind(fireId, n).all<any>()).results.map((r: any) => r.channel);

async function reminder(title: string, date: string, renotifyMin: number | null) {
  const ev = await A.post('/events', { title, startDate: date, endDate: date, startTime: '12:00', reminder: { offsetMin: 0, channels: ['push', 'house'], renotifyMin } });
  expect(ev.status, JSON.stringify(ev.json)).toBe(201);
  await tick(`${date}T19:59:00.000Z`);
  await tick(`${date}T20:00:30.000Z`);
  return (await env.DB.prepare('SELECT id FROM fires WHERE event_id = ?').bind(ev.json.id).first<any>())!.id as string;
}

it('PF2: a repeating Phone + House reminder — alert 1 phones only, alert 2 phones and the house', async () => {
  const id = await reminder('Meds', '2026-11-24', 5);
  const first = await channelsOf(id, 1);
  expect(first).toContain('push');
  expect(first).not.toContain('house');
  expect(ha.heard).toHaveLength(0);
  await tick('2026-11-24T20:06:00.000Z');
  const second = await channelsOf(id, 2);
  expect(second).toContain('push');
  expect(second.filter((c: string) => c === 'house')).toHaveLength(1);
  expect(ha.heard.length).toBeGreaterThan(0);
});

it('PF3: a Phone + House reminder with no repeat is spoken on its one alert', async () => {
  const id = await reminder('Pickup', '2026-11-25', null);
  expect(await channelsOf(id, 1)).toContain('house');
  expect(ha.heard.length).toBeGreaterThan(0);
});
