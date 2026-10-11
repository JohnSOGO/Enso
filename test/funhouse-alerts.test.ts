// SPEC §9.4b FH1–FH4, FH7 — 🎪 FunHouse as a place alerts go: one `funhouse` row per alert, following the phone's
// rules (away stops it; quiet the house and phone first do not), from the tick, a timer start and Announce.
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import worker from '../src/worker/index';
import { BASE, Client, member, owner } from './helpers';
import { fakeHa, houseEnv } from './ha-helpers';

let A: Client;
beforeAll(async () => { A = await owner(); await member(A); });
beforeEach(async () => {
  fakeHa();
  await env.DB.prepare('DELETE FROM deliveries').run();
  await env.DB.prepare('UPDATE settings SET house_quiet_until = NULL, house_quiet_by = NULL WHERE id = 1').run();
});
afterEach(() => { vi.restoreAllMocks(); });

async function call(method: string, path: string, body?: unknown) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`${BASE}${path}`, {
    method, headers: { 'content-type': 'application/json', cookie: A.cookie }, body: body === undefined ? undefined : JSON.stringify(body),
  }), houseEnv(), ctx);
  await waitOnExecutionContext(ctx);
  return { status: res.status, json: await res.json<any>() };
}
const tick = async (iso: string) => expect((await call('POST', `/dev/tick?now=${encodeURIComponent(iso)}`)).status).toBe(200);
const rows = async (fireId: string, n: number) => (await env.DB.prepare(
  'SELECT channel, member_id, title, message FROM deliveries WHERE fire_id = ? AND alert_number = ? ORDER BY channel').bind(fireId, n).all<any>()).results;
const quiet = () => env.DB.prepare(`UPDATE settings SET house_quiet_until = '2099-01-01T08:00:00.000Z' WHERE id = 1`).run();

async function reminder(title: string, date: string, channels: string[], renotifyMin: number | null) {
  const ev = await A.post('/events', { title, startDate: date, endDate: date, startTime: '12:00', reminder: { offsetMin: 0, channels, renotifyMin } });
  expect(ev.status, JSON.stringify(ev.json)).toBe(201);
  await tick(`${date}T19:59:00.000Z`);
  await tick(`${date}T20:00:30.000Z`);
  return (await env.DB.prepare('SELECT id FROM fires WHERE event_id = ?').bind(ev.json.id).first<any>())!.id as string;
}

it('FH1: Phone + FunHouse, two members → two push rows and one funhouse row titled Ensō', async () => {
  const id = await reminder('Vet', '2026-12-01', ['push', 'funhouse'], null);
  const r = await rows(id, 1);
  expect(r.filter((d: any) => d.channel === 'push')).toHaveLength(2);
  const fh = r.filter((d: any) => d.channel === 'funhouse');
  expect(fh).toHaveLength(1);
  expect(fh[0]).toMatchObject({ member_id: null, title: 'Ensō' });
  expect(fh[0].message).toBe(r.find((d: any) => d.channel === 'push').message);
});

it('FH2: quiet → the funhouse row still written, no house row; away → no row at all', async () => {
  await quiet();
  const id = await reminder('Bins', '2026-12-02', ['house', 'funhouse'], 5);
  expect((await rows(id, 1)).map((d: any) => d.channel)).toEqual(['funhouse']);
  await env.DB.prepare('UPDATE settings SET house_quiet_until = NULL WHERE id = 1').run();
  expect((await call('POST', `/fires/${id}/away`)).status).toBe(200);
  await tick('2026-12-02T20:06:00.000Z');
  expect(await rows(id, 2)).toEqual([]);
});

it('FH3: a repeating Phone + House + FunHouse reminder, alert 1 → phones and the FunHouse, no house row', async () => {
  const id = await reminder('Meds', '2026-12-03', ['push', 'house', 'funhouse'], 5);
  const chans = (await rows(id, 1)).map((d: any) => d.channel);
  expect(chans).toContain('funhouse');
  expect(chans).toContain('push');
  expect(chans).not.toContain('house');
});

it('FH4: Announce FunHouse only; House + FunHouse while quiet → the funhouse row only', async () => {
  const only = await call('POST', '/announce', { text: 'Dinner', channels: ['funhouse'] });
  expect(only.status, JSON.stringify(only.json)).toBe(201);
  expect(only.json.deliveries.map((d: any) => d.channel)).toEqual(['funhouse']);
  const row = await env.DB.prepare(`SELECT title, member_id FROM deliveries WHERE channel = 'funhouse'`).first<any>();
  expect(row).toEqual({ title: '📢 Announcement', member_id: null });
  await quiet();
  const both = await call('POST', '/announce', { text: 'Dinner', channels: ['house', 'funhouse'] });
  expect(both.status).toBe(201);
  expect(both.json.deliveries.map((d: any) => d.channel)).toEqual(['funhouse']);
});

it("FH7: a timer's start announcement with FunHouse ticked → one funhouse row", async () => {
  const t = await A.post('/timers', { title: 'Lunges', intervalMin: 60, channels: ['push', 'funhouse'], activeFrom: '08:00', activeTo: '21:00', announceStart: true });
  expect(t.status).toBe(201);
  await A.post(`/timers/${t.json.id}/commands`, { cmd: 'start' });
  await tick('2026-11-13T16:01:00.000Z'); // 08:01 PST
  const said = (await env.DB.prepare(`SELECT channel FROM deliveries WHERE message = 'Lunges timer started — every 60 minutes'`).all<any>()).results;
  expect(said.filter((d: any) => d.channel === 'funhouse')).toHaveLength(1);
  await A.post(`/timers/${t.json.id}/commands`, { cmd: 'stop' });
});
