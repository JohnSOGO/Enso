// SPEC §9.2e HD5–HD10 — the house's devices by room through the Worker, against a fake Home Assistant at
// https://ha.test: the pick list, a room's devices picked and read live, one tap, and a room delete.
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import worker from '../src/worker/index';
import type { Env } from '../src/worker/env';
import { DEVICE_TEMPLATE } from '../src/worker/home-devices';
import { BASE, Client, member, owner } from './helpers';
import { AC, AC_STATE, fakeHa, houseEnv } from './ha-helpers';

const LAMP = 'light.lamp';
let A: Client, B: Client, roomA: string, roomB: string;
let ha: ReturnType<typeof fakeHa>;

beforeAll(async () => {
  A = await owner();
  B = (await member(A)).client;
  roomA = (await A.post('/rooms', { name: "John's room" })).json.id;
  roomB = (await A.post('/rooms', { name: 'Den' })).json.id;
});
beforeEach(async () => {
  ha = fakeHa();
  await env.DB.prepare('DELETE FROM room_devices').run();
});
afterEach(() => { vi.restoreAllMocks(); });

async function call(c: Client, method: string, path: string, body?: unknown, e: Env = houseEnv()) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`${BASE}${path}`, {
    method, headers: { 'content-type': 'application/json', cookie: c.cookie }, body: body === undefined ? undefined : JSON.stringify(body),
  }), e, ctx);
  await waitOnExecutionContext(ctx);
  return { status: res.status, json: await res.json<any>().catch(() => null) };
}

it('HD5: GET /house/devices asks HA once, marks each device\'s room; 503 / 502', async () => {
  await call(A, 'PUT', `/rooms/${roomA}/devices`, { devices: [AC] });
  ha.answers.set('/api/template', { status: 200, body: JSON.stringify([{ id: AC, name: 'Midea AC' }, { id: LAMP, name: 'Lamp' }, { id: 'media_player.tv', name: 'TV' }]) });
  const r = await call(B, 'GET', '/house/devices');
  expect(r.status).toBe(200);
  expect(r.json.devices).toEqual([
    { id: LAMP, name: 'Lamp', domain: 'light', roomId: null }, { id: AC, name: 'Midea AC', domain: 'climate', roomId: roomA },
  ]);
  expect(ha.heard).toHaveLength(1);
  expect(ha.heard[0].json).toEqual({ template: DEVICE_TEMPLATE });
  expect(ha.heard[0].headers.get('Authorization')).toBe('Bearer fake-ha-token');
  expect(ha.heard[0].headers.get('CF-Access-Client-Id')).toBe('fake-access-id');

  const off = await call(B, 'GET', '/house/devices', undefined, env as unknown as Env);
  expect(off.status).toBe(503);
  expect(ha.heard).toHaveLength(1);
  ha.answers.set('/api/template', { status: 500, body: 'boom' });
  expect((await call(B, 'GET', '/house/devices')).json.error).toBe('house_unreachable');
});

it('HD6: PUT then GET a room\'s devices, live, in order; a failing one shows its error; empty makes no fetch', async () => {
  expect((await call(A, 'GET', `/rooms/${roomA}/devices`)).json).toEqual({ devices: [] });
  expect(ha.heard).toHaveLength(0);
  const put = await call(A, 'PUT', `/rooms/${roomA}/devices`, { devices: [LAMP, AC] });
  expect(put).toEqual({ status: 200, json: { devices: [LAMP, AC] } });
  ha.answers.set(`/api/states/${AC}`, { status: 200, body: AC_STATE });
  ha.answers.set(`/api/states/${LAMP}`, { status: 404, body: '{"message":"Entity not found."}' });
  const r = await call(B, 'GET', `/rooms/${roomA}/devices`);
  expect(r.status).toBe(200);
  expect(r.json.devices.map((d: any) => [d.id, d.available])).toEqual([[LAMP, false], [AC, true]]);
  expect(r.json.devices[0].error).toMatch(/^HTTP 404/);
  expect(r.json.devices[1].climate).toMatchObject({ mode: 'fan_only', current: 54.5, target: 70 });
  expect(ha.heard.map((h) => [h.method, h.path]).sort()).toEqual([['GET', `/api/states/${AC}`], ['GET', `/api/states/${LAMP}`]]);
});

it('HD7: a device already in another room; a bad list; a member who did not make the room', async () => {
  await call(A, 'PUT', `/rooms/${roomA}/devices`, { devices: [AC] });
  const taken = await call(A, 'PUT', `/rooms/${roomB}/devices`, { devices: [AC] });
  expect(taken.status).toBe(400);
  expect(taken.json.message).toBe(`${AC} is already in John's room.`);
  expect((await call(A, 'PUT', `/rooms/${roomB}/devices`, { devices: ['media_player.tv'] })).status).toBe(400);
  expect((await call(B, 'PUT', `/rooms/${roomA}/devices`, { devices: [] })).status).toBe(403);
});

it('HD8: a plain member sets the AC to cool: one read, one allowed service, one read back', async () => {
  await call(A, 'PUT', `/rooms/${roomA}/devices`, { devices: [AC] });
  ha.answers.set(`/api/states/${AC}`, { status: 200, body: AC_STATE });
  const r = await call(B, 'POST', `/house/devices/${AC}`, { action: 'mode', mode: 'cool' });
  expect(r.status).toBe(200);
  expect(r.json.id).toBe(AC);
  expect(ha.heard.map((h) => [h.method, h.path])).toEqual([
    ['GET', `/api/states/${AC}`], ['POST', '/api/services/climate/set_hvac_mode'], ['GET', `/api/states/${AC}`],
  ]);
  expect(ha.heard[1].json).toEqual({ entity_id: AC, hvac_mode: 'cool' });
});

it('HD9: a device in no room → 404 and no fetch; a bad action → 400 and no service; HA 500 → 502', async () => {
  expect((await call(B, 'POST', `/house/devices/${AC}`, { action: 'on' })).status).toBe(404);
  expect(ha.heard).toHaveLength(0);
  await call(A, 'PUT', `/rooms/${roomA}/devices`, { devices: [AC] });
  ha.answers.set(`/api/states/${AC}`, { status: 200, body: AC_STATE });
  expect((await call(B, 'POST', `/house/devices/${AC}`, { action: 'explode' })).status).toBe(400);
  expect(ha.heard.some((h) => h.path.startsWith('/api/services/'))).toBe(false);
  ha.answers.set('/api/services/climate/turn_off', { status: 500, body: 'no' });
  const bad = await call(B, 'POST', `/house/devices/${AC}`, { action: 'off' });
  expect(bad.status).toBe(502);
  expect(bad.json.error).toBe('house_unreachable');
});

it('HD10: deleting a room takes its device rows; the device can go in another room', async () => {
  const gone = (await A.post('/rooms', { name: 'Spare' })).json.id;
  await call(A, 'PUT', `/rooms/${gone}/devices`, { devices: [LAMP] });
  expect((await A.del(`/rooms/${gone}`)).status).toBe(204);
  expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM room_devices WHERE room_id = ?').bind(gone).first<{ n: number }>())!.n).toBe(0);
  expect((await call(A, 'PUT', `/rooms/${roomB}/devices`, { devices: [LAMP] })).status).toBe(200);
});
