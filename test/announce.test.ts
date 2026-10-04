// M4k acceptance (SPEC §9.3, AN1–AN3, AN6) — house announcements. The push side (AN4, AN5, AN7)
// is in push.test.ts, beside the fake push service; the migration (AN8) in migration-0012.test.ts.
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, expect, it, vi } from 'vitest';
import worker from '../src/worker/index';
import { ANNOUNCE_MAX, announceError, announceMessage } from '../src/shared/announce';
import { BASE, Client, member, owner } from './helpers';
import { ECHO_PATH, SATELLITE_PATH, fakeHa, houseEnv } from './ha-helpers';

afterEach(() => { vi.restoreAllMocks(); });

it('AN1: announceError and announceMessage', () => {
  const ok = { text: '  hi ', channels: ['house'] };
  expect(announceError(ok)).toBeNull();
  expect(announceError({ text: 'x'.repeat(ANNOUNCE_MAX), channels: ['push', 'house'] })).toBeNull();
  for (const text of ['', '   ', 'x'.repeat(ANNOUNCE_MAX + 1), 42, null, undefined]) {
    expect(announceError({ ...ok, text }), `text ${JSON.stringify(text)}`).toBeTruthy();
  }
  for (const channels of [[], ['sms'], ['house', 'house'], 'house', null, undefined]) {
    expect(announceError({ ...ok, channels }), `channels ${JSON.stringify(channels)}`).toBeTruthy();
  }
  expect(announceMessage('Shelly', ' Dinner ')).toBe('Shelly says: Dinner');
});

it('AN6: Phone only with nobody else in the household → 409 no_recipients, nothing written', async () => {
  const o = await owner(); // the first test to sign anyone up in this file's database
  const r = await o.post('/announce', { text: 'Anyone?', channels: ['push'] });
  expect(r.status).toBe(409);
  expect(r.json).toMatchObject({ error: 'no_recipients' });
  expect(r.json.message).toBeTruthy();
  expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM deliveries').first<{ n: number }>())!.n).toBe(0);
});

it('AN2 + AN3: House → one fire-less house delivery "Name says: text", answered queued, then spoken by the Worker → sent', async () => {
  const o = await owner();
  const ha = fakeHa();
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`${BASE}/announce`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: o.cookie },
    body: JSON.stringify({ text: ' Dinner is ready ', channels: ['house'], name: 'Somebody else' }),
  }), houseEnv(), ctx);
  expect(res.status).toBe(201);
  const r: any = await res.json();
  // AN2: read before the house row is spoken.
  expect(r.deliveries).toEqual([{ id: expect.any(String), channel: 'house', memberId: null, status: 'queued' }]);
  const id = r.deliveries[0].id;
  expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM deliveries WHERE channel = 'push'`).first<{ n: number }>())!.n).toBe(0);

  // AN3: the Worker speaks it right away, inside waitUntil.
  await waitOnExecutionContext(ctx);
  const row = await env.DB.prepare('SELECT * FROM deliveries WHERE id = ?').bind(id).first<any>();
  expect(row).toMatchObject({ fire_id: null, member_id: null, alert_number: 1, channel: 'house', message: 'MojoSOGO says: Dinner is ready', status: 'sent', attempts: 1 });
  expect(ha.heard.map((h) => [h.path, h.json.message])).toEqual(expect.arrayContaining([
    [ECHO_PATH, 'MojoSOGO says: Dinner is ready'], [SATELLITE_PATH, 'MojoSOGO says: Dinner is ready']]));
  expect(ha.heard).toHaveLength(2);
});

it('AN6: refusals — blank, too long, no channels, an unknown channel → 400 with a message; no session → 401', async () => {
  const o = await owner();
  const a = await member(o);
  const before = (await env.DB.prepare('SELECT COUNT(*) AS n FROM deliveries').first<{ n: number }>())!.n;
  for (const b of [
    { text: '   ', channels: ['house'] },
    { text: 'x'.repeat(ANNOUNCE_MAX + 1), channels: ['house'] },
    { text: 'Hi', channels: [] },
    { text: 'Hi', channels: ['sms'] },
  ]) {
    const r = await a.client.post('/announce', b);
    expect(r.status, JSON.stringify(b)).toBe(400);
    expect(r.json.error).toBe('invalid_input');
    expect(r.json.message).toBeTruthy();
  }
  expect((await new Client().post('/announce', { text: 'Hi', channels: ['house'] })).status).toBe(401);
  expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM deliveries').first<{ n: number }>())!.n).toBe(before);

  // A member's announcement carries their own name.
  const r = await a.client.post('/announce', { text: 'Bath time', channels: ['house'] });
  expect(r.status).toBe(201);
  const me = (await a.client.get('/me')).json;
  const row = await env.DB.prepare('SELECT message FROM deliveries WHERE id = ?').bind(r.json.deliveries[0].id).first<{ message: string }>();
  expect(row!.message).toBe(`${me.displayName} says: Bath time`);
});
