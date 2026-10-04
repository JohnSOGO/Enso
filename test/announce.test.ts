// M4k acceptance (SPEC §9.3, AN1–AN3, AN6) — house announcements. The push side (AN4, AN5, AN7)
// is in push.test.ts, beside the fake push service; the migration (AN8) in migration-0012.test.ts.
import { SELF, env } from 'cloudflare:test';
import { expect, it } from 'vitest';
import { ANNOUNCE_MAX, announceError, announceMessage } from '../src/shared/announce';
import { BASE, Client, member, owner } from './helpers';

const relayPost = (path: string, body: unknown = {}) =>
  SELF.fetch(`${BASE}${path}`, { method: 'POST', headers: { authorization: `Bearer ${env.RELAY_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });

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

it('AN2 + AN3: House → one fire-less house delivery "Name says: text", claimed by the relay and reported sent', async () => {
  const o = await owner();
  const r = await o.post('/announce', { text: ' Dinner is ready ', channels: ['house'], name: 'Somebody else' });
  expect(r.status).toBe(201);
  expect(r.json.deliveries).toEqual([{ id: expect.any(String), channel: 'house', memberId: null, status: 'queued' }]);
  const id = r.json.deliveries[0].id;
  const row = await env.DB.prepare('SELECT * FROM deliveries WHERE id = ?').bind(id).first<any>();
  expect(row).toMatchObject({ fire_id: null, member_id: null, alert_number: 1, channel: 'house', message: 'MojoSOGO says: Dinner is ready', status: 'queued' });
  expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM deliveries WHERE channel = 'push'`).first<{ n: number }>())!.n).toBe(0);

  const claimed: { id: string; message: string }[] = await (await relayPost('/relay/claim')).json();
  expect(claimed).toContainEqual({ id, message: 'MojoSOGO says: Dinner is ready' });
  expect((await relayPost('/relay/report', { id, status: 'sent', detail: { echo: 'ok', voice_pe: 'ok' } })).status).toBe(200);
  expect((await env.DB.prepare('SELECT status FROM deliveries WHERE id = ?').bind(id).first<{ status: string }>())!.status).toBe('sent');
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
