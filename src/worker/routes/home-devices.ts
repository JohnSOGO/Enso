// SPEC §9.2e — the house's devices, room by room: the pick list (GET /house/devices), a room's devices live (GET) and
// picked (PUT, the room's creator or an admin, §6.3), and one tap on a device (POST, any member, only a device in a
// room). Rules and HA's answers read in src/shared/home-devices.ts; HA is called through ../home-devices.ts.
import { Hono, type Context } from 'hono';
import type { AppEnv } from '../env';
import { all, first, nowIso } from '../db';
import { body, fail } from '../http';
import { requireMember } from '../session';
import { HOUSE_NOT_CONFIGURED, haConfigOf, type HaConfig } from '../ha';
import { callDeviceService, deviceStates, houseDeviceList } from '../home-devices';
import { loadRoom } from './rooms';
import { deviceCall, deviceDomain, deviceFromState, devicePickList, deviceUnreachable, parseRoomDevices, type Device } from '../../shared/home-devices';

export const homeDevices = new Hono<AppEnv>();

const notSetUp = (c: Context<AppEnv>) => fail(c, 503, HOUSE_NOT_CONFIGURED, "House isn't set up.");

/** Each device's state, in order; one HA didn't answer for (or answered unreadably) is deviceUnreachable. */
async function readDevices(cfg: HaConfig, ids: readonly string[]): Promise<Device[]> {
  const answers = await deviceStates(cfg, ids);
  return ids.map((id, i) => {
    const a = answers[i];
    return (a.ok ? deviceFromState(id, a.text) : null) ?? deviceUnreachable(id, a.ok ? "Home Assistant's answer couldn't be read." : a.reason);
  });
}

homeDevices.get('/house/devices', requireMember, async (c) => {
  const cfg = haConfigOf(c.env);
  if (!cfg) return notSetUp(c);
  const r = await houseDeviceList(cfg);
  if (!r.ok) return fail(c, 502, 'house_unreachable', r.reason);
  const list = devicePickList(r.text);
  if (!list) return fail(c, 502, 'house_unreachable', "Home Assistant's device list couldn't be read.");
  const rooms = new Map((await all<{ entity_id: string; room_id: string }>(c.env.DB, 'SELECT entity_id, room_id FROM room_devices'))
    .map((d) => [d.entity_id, d.room_id]));
  return c.json({ devices: list.map((d) => ({ ...d, roomId: rooms.get(d.id) ?? null })) });
});

const roomDeviceIds = async (db: D1Database, roomId: string) =>
  (await all<{ entity_id: string }>(db, 'SELECT entity_id FROM room_devices WHERE room_id = ? ORDER BY position', roomId)).map((d) => d.entity_id);

homeDevices.get('/rooms/:id/devices', requireMember, async (c) => {
  const r = await loadRoom(c, false);
  if (r instanceof Response) return r;
  const ids = await roomDeviceIds(c.env.DB, r.id);
  if (!ids.length) return c.json({ devices: [] });
  const cfg = haConfigOf(c.env);
  if (!cfg) return notSetUp(c);
  return c.json({ devices: await readDevices(cfg, ids) });
});

homeDevices.put('/rooms/:id/devices', requireMember, async (c) => {
  const r = await loadRoom(c, true);
  if (r instanceof Response) return r;
  const ids = parseRoomDevices((await body(c)).devices);
  if (typeof ids === 'string') return fail(c, 400, 'invalid_input', ids);
  const db = c.env.DB;
  if (ids.length) {
    const taken = await first<{ entity_id: string; name: string }>(db,
      `SELECT d.entity_id, r.name FROM room_devices d JOIN rooms r ON r.id = d.room_id
        WHERE d.room_id <> ? AND d.entity_id IN (${ids.map(() => '?').join(',')}) LIMIT 1`, r.id, ...ids);
    if (taken) return fail(c, 400, 'invalid_input', `${taken.entity_id} is already in ${taken.name}.`);
  }
  const now = nowIso();
  await db.batch([
    db.prepare('DELETE FROM room_devices WHERE room_id = ?').bind(r.id),
    ...ids.map((id, i) => db.prepare('INSERT INTO room_devices (entity_id, room_id, position, created_at) VALUES (?, ?, ?, ?)').bind(id, r.id, i, now)),
  ]);
  return c.json({ devices: await roomDeviceIds(db, r.id) });
});

homeDevices.post('/house/devices/:entity', requireMember, async (c) => {
  const id = c.req.param('entity');
  if (!deviceDomain(id) || !(await first(c.env.DB, 'SELECT entity_id FROM room_devices WHERE entity_id = ?', id))) {
    return fail(c, 404, 'not_found', "That device isn't in a room.");
  }
  const cfg = haConfigOf(c.env);
  if (!cfg) return notSetUp(c);
  const [before] = await readDevices(cfg, [id]);
  if (before.error) return fail(c, 502, 'house_unreachable', before.error);
  const call = deviceCall(before, await body(c));
  if (typeof call === 'string') return fail(c, 400, 'invalid_input', call);
  const done = await callDeviceService(cfg, call);
  if (!done.ok) return fail(c, 502, 'house_unreachable', done.reason);
  const [after] = await readDevices(cfg, [id]);
  return c.json(after);
});
