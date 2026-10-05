// SPEC §9.2a, HS4–HS10 — each person's house speakers: the list from Home Assistant (a fake at
// https://ha.test), the member's own choice on /me, and the speakers a house delivery is written and spoken on.
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import worker from '../src/worker/index';
import type { Env } from '../src/worker/env';
import { SPEAKER_TEMPLATE, houseConfigOf } from '../src/worker/house';
import { BASE, Client, member, owner } from './helpers';
import { ECHO_PATH, SATELLITE_PATH, fakeHa, houseEnv } from './ha-helpers';

const TEMPLATE_PATH = '/api/template';
const GAME = 'media_player.game_room', SOGO = 'media_player.sogo', TOASTY = 'media_player.toasty', PE = 'assist_satellite.voice_pe';

let A: Client, B: Client, aId: string, bId: string;
let ha: ReturnType<typeof fakeHa>;
beforeAll(async () => {
  A = await owner();
  aId = (await A.get('/me')).json.id;
  const b = await member(A); B = b.client; bId = b.id;
  const c = await member(A);
  await c.client.patch('/me', { houseSpeakers: [TOASTY] });
  expect((await A.patch(`/members/${c.id}`, { disabled: true })).status).toBe(200);
});
beforeEach(async () => {
  ha = fakeHa();
  await env.DB.prepare('DELETE FROM deliveries').run();
});
afterEach(() => { vi.restoreAllMocks(); });

/** One request through the Worker with House configured (fake secrets), waiting for its waitUntil work. */
async function call(c: Client, method: string, path: string, body?: unknown, e: Env = houseEnv()) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`${BASE}${path}`, {
    method, headers: { 'content-type': 'application/json', cookie: c.cookie }, body: body === undefined ? undefined : JSON.stringify(body),
  }), e, ctx);
  await waitOnExecutionContext(ctx);
  return { status: res.status, json: await res.json<any>() };
}
const houseRows = async () => (await env.DB.prepare(`SELECT * FROM deliveries WHERE channel = 'house'`).all<any>()).results;

it('HS4: GET /house/speakers asks HA once with the template; 503 unconfigured; 502 when HA fails', async () => {
  ha.answers.set(TEMPLATE_PATH, { status: 200, body: JSON.stringify([{ id: SOGO, name: 'Sogo' }, { id: PE, name: 'Office' }, { id: 'light.x', name: 'X' }]) });
  const r = await call(A, 'GET', '/house/speakers');
  expect(r.status).toBe(200);
  const cfg = houseConfigOf(houseEnv())!;
  expect(r.json).toEqual({
    speakers: [{ id: SOGO, name: 'Sogo', kind: 'echo' }, { id: PE, name: 'Office', kind: 'satellite' }],
    mine: null, defaults: [...cfg.echoTargets, cfg.satelliteEntity],
  });
  expect(ha.heard).toHaveLength(1);
  const h = ha.heard[0];
  expect(h.path).toBe(TEMPLATE_PATH);
  expect(h.json).toEqual({ template: SPEAKER_TEMPLATE });
  expect(h.headers.get('Authorization')).toBe('Bearer fake-ha-token');
  expect(h.headers.get('CF-Access-Client-Id')).toBe('fake-access-id');
  expect(h.headers.get('CF-Access-Client-Secret')).toBe('fake-access-secret');

  const off = await call(A, 'GET', '/house/speakers', undefined, env as unknown as Env);
  expect(off.status).toBe(503);
  expect(off.json.error).toBe('house_not_configured');
  expect(ha.heard).toHaveLength(1); // zero fetches when not configured

  const failures = [[{ status: 500, body: 'boom' }, 'HTTP 500'], [{ status: 302, body: '' }, 'HTTP 302'], [{ status: 200, body: 'not json' }, "couldn't be read"]] as const;
  for (const [answer, says] of failures) {
    ha.answers.set(TEMPLATE_PATH, answer);
    const bad = await call(A, 'GET', '/house/speakers');
    expect(bad.status).toBe(502);
    expect(bad.json.error).toBe('house_unreachable');
    expect(bad.json.message).toContain(says);
    expect(bad.json.message).not.toContain('fake-ha-token');
  }
});

it('HS5: PATCH /me houseSpeakers — saved, cleared with null, a bad list refused', async () => {
  expect((await A.patch('/me', { houseSpeakers: [GAME, PE] })).json.houseSpeakers).toEqual([GAME, PE]);
  expect((await A.get('/me')).json.houseSpeakers).toEqual([GAME, PE]);
  for (const bad of [['light.x'], [GAME, GAME], 'media_player.a', 7]) {
    const r = await A.patch('/me', { houseSpeakers: bad });
    expect(r.status, JSON.stringify(bad)).toBe(400);
    expect(r.json.error).toBe('invalid_input');
  }
  expect((await A.get('/me')).json.houseSpeakers).toEqual([GAME, PE]);
  ha.answers.set(TEMPLATE_PATH, { status: 200, body: '[]' });
  expect((await call(A, 'GET', '/house/speakers')).json.mine).toEqual([GAME, PE]);
  expect((await A.patch('/me', { houseSpeakers: null })).json.houseSpeakers).toBeNull();
});

/** A one-off reminder for these members at 12:00 local on `date`, rung by a tick through the Worker. */
async function ringFor(title: string, assignedTo: string[], date: string, channels = ['house']) {
  const ev = await A.post('/events', { title, startDate: date, endDate: date, startTime: '12:00', assignedTo, reminder: { offsetMin: 0, channels } });
  expect(ev.status, JSON.stringify(ev.json)).toBe(201);
  for (const at of ['19:59:00', '20:00:30']) { // plan it, then ring it at 12:00 PST
    const r = await call(A, 'POST', `/dev/tick?now=${encodeURIComponent(`${date}T${at}.000Z`)}`);
    expect(r.status).toBe(200);
  }
  return ev.json.id as string;
}

it('HS6: a fire for A and B is written on the union and spoken on it', async () => {
  await A.patch('/me', { houseSpeakers: [GAME, PE] });
  await B.patch('/me', { houseSpeakers: [SOGO] });
  await ringFor('Dentist', [aId, bId], '2026-11-02');
  const [row] = await houseRows();
  expect(JSON.parse(row.speakers)).toEqual([GAME, PE, SOGO]);
  expect(row.status).toBe('sent');
  expect(ha.heard.find((h) => h.path === ECHO_PATH)!.json.target).toEqual([GAME, SOGO]);
  expect(ha.heard.find((h) => h.path === SATELLITE_PATH)!.json.entity_id).toEqual([PE]);
});

it('HS7: only Echos chosen → the Voice PE is not called, detail names the Echos alone', async () => {
  await A.patch('/me', { houseSpeakers: [GAME] });
  await ringFor('Pick up', [aId], '2026-11-03');
  const [row] = await houseRows();
  expect(ha.heard.map((h) => h.path)).toEqual([ECHO_PATH]);
  expect(row.status).toBe('sent');
  expect(JSON.parse(row.detail)).toEqual({ echo: 'ok' });
});

it('HS8: someone it is for has not chosen → NULL, spoken on the default speakers', async () => {
  await A.patch('/me', { houseSpeakers: [GAME] });
  await B.patch('/me', { houseSpeakers: null });
  await ringFor('Swim', [aId, bId], '2026-11-04');
  const [row] = await houseRows();
  expect(row.speakers).toBeNull();
  const cfg = houseConfigOf(houseEnv())!;
  expect(ha.heard.find((h) => h.path === ECHO_PATH)!.json.target).toEqual(cfg.echoTargets);
  expect(ha.heard.find((h) => h.path === SATELLITE_PATH)!.json.entity_id).toBe(cfg.satelliteEntity);
});

it('HS9: nobody it is for has a speaker → no house row; the push row is still written; the fire steps', async () => {
  await A.patch('/me', { houseSpeakers: [] });
  const id = await ringFor('Quiet one', [aId], '2026-11-05', ['push', 'house']);
  const fire = await env.DB.prepare('SELECT id, alert_count FROM fires WHERE event_id = ?').bind(id).first<any>();
  expect(fire.alert_count).toBe(1);
  const rows = (await env.DB.prepare('SELECT channel, member_id FROM deliveries WHERE fire_id = ?').bind(fire.id).all<any>()).results;
  expect(rows).toEqual([{ channel: 'push', member_id: aId }]);
  expect(ha.heard).toHaveLength(0);
});

it("HS10: an announcement is spoken on every active member's speakers; none at all → 409 no_speakers", async () => {
  await A.patch('/me', { houseSpeakers: [GAME] });
  await B.patch('/me', { houseSpeakers: [SOGO] });
  const r = await call(A, 'POST', '/announce', { text: 'Dinner', channels: ['house'] });
  expect(r.status).toBe(201);
  const [row] = await houseRows();
  expect(JSON.parse(row.speakers)).toEqual([GAME, SOGO]); // not the disabled member's Toasty
  expect(ha.heard.find((h) => h.path === ECHO_PATH)!.json.target).toEqual([GAME, SOGO]);

  await env.DB.prepare('DELETE FROM deliveries').run();
  await A.patch('/me', { houseSpeakers: [] });
  await B.patch('/me', { houseSpeakers: [] });
  const none = await call(A, 'POST', '/announce', { text: 'Dinner', channels: ['house'] });
  expect(none.status).toBe(409);
  expect(none.json.error).toBe('no_speakers');
  expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM deliveries').first<{ n: number }>())!.n).toBe(0);
  const both = await call(A, 'POST', '/announce', { text: 'Dinner', channels: ['house', 'push'] });
  expect(both.status).toBe(201);
  expect(both.json.deliveries.map((d: any) => d.channel)).toEqual(['push']);
});

it('HS11 (§7D.3): a machine alert is spoken on every speaker HA lists but Everywhere, whatever anyone ticked; HA unreadable → the defaults', async () => {
  await A.patch('/me', { houseSpeakers: [GAME] });
  ha.answers.set(TEMPLATE_PATH, { status: 200, body: JSON.stringify([
    { id: GAME, name: 'Game Room' }, { id: 'media_player.everywhere', name: 'Everywhere' }, { id: TOASTY, name: 'Toasty' }, { id: PE, name: 'Office' },
  ]) });
  const ring = async () => {
    expect((await call(A, 'POST', '/machines/washer/done', { ownerId: aId })).status).toBe(200);
    const now = new Date(Date.now() + 1000).toISOString();
    expect((await call(A, 'POST', `/dev/tick?now=${encodeURIComponent(now)}`)).status).toBe(200);
    const rows = await houseRows();
    expect(rows).toHaveLength(1);
    expect((await call(A, 'POST', '/machines/washer/clear')).status).toBe(200);
    await env.DB.prepare('DELETE FROM deliveries').run();
    return rows[0];
  };
  const row = await ring();
  expect(JSON.parse(row.speakers)).toEqual([GAME, TOASTY, PE]);
  expect(ha.heard.find((h) => h.path === ECHO_PATH)!.json.target).toEqual([GAME, TOASTY]);

  ha.answers.set(TEMPLATE_PATH, { status: 500, body: 'down' });
  expect((await ring()).speakers).toBeNull();
});
