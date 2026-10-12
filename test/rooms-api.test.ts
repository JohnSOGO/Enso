// M4y acceptance (SPEC §7B.6) — rooms and what done looks like: a room's areas, their expectations and their photos
// (R2, private), and a chore's room, through the real Worker. Each test makes its own room; the bucket is checked directly.
import { SELF, env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { BASE, Client, member, owner } from './helpers';
import { AREAS_MAX, AREA_NAME_MAX, EXPECTATIONS_MAX, EXPECTATION_MAX, ROOM_NAME_MAX, parseAreaInput } from '../src/shared/rooms';

let o: Client, A: string, b: Client;
beforeAll(async () => {
  o = await owner();
  A = (await o.get('/me')).json.id;
  b = (await member(o)).client;
});

const jpeg = (size: number, seed: number) => {
  const x = new Uint8Array(size);
  for (let i = 0; i < size; i++) x[i] = (i * 17 + seed) & 255;
  x.set([0xff, 0xd8, 0xff], 0);
  return x;
};
/** A raw request through SELF, for photo bodies. */
const raw = (c: Client, method: string, path: string, body?: Uint8Array, type = 'image/jpeg') => SELF.fetch(BASE + path, {
  method, body, headers: { cookie: c.cookie, ...(body ? { 'content-type': type } : {}) },
});
async function newRoom(name = 'Kitchen') {
  const r = await o.post('/rooms', { name });
  expect(r.status, JSON.stringify(r.json)).toBe(201);
  return r.json.id as string;
}
const newChore = async (roomId: string | null) => {
  const r = await o.post('/chores', { title: 'Kitchen', days: ['MO'], timing: 'by', time: '19:00', people: [A], steps: [{ title: 'Kitchen' }], roomId });
  expect(r.status, JSON.stringify(r.json)).toBe(201);
  return r.json.id as string;
};
const objects = async (areaId: string) => (await env.PHOTOS.list({ prefix: `chore-areas/${areaId}/` })).objects.map((x) => x.key);

describe('M4y what done looks like — areas', () => {
  it('CA1 an area is trimmed, blank expectations dropped, listed, and counted on /chores and today', async () => {
    const id = await newRoom();
    const r = await o.post(`/rooms/${id}/areas`, { name: ' Sink ', expectations: ['No dishes', ' ', ' Faucet dry '] });
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ roomId: id, name: 'Sink', expectations: ['No dishes', 'Faucet dry'], photos: [] });
    expect((await o.get(`/rooms/${id}/areas`)).json.map((a: any) => a.id)).toEqual([r.json.id]);
    expect((await o.get('/rooms')).json.find((x: any) => x.id === id).areaCount).toBe(1);
    const chore = await newChore(id);
    expect((await o.get('/chores')).json.find((c: any) => c.id === chore)).toMatchObject({ roomId: id, areaCount: 1 });
    const run = (await o.get('/chores/today')).json.runs.find((x: any) => x.choreId === chore);
    if (run) expect(run.areaCount).toBe(1); // only when today is a Monday
  });

  it('CA2 areas keep the order added; a PATCH of the name keeps the expectations', async () => {
    const id = await newRoom();
    const first = (await o.post(`/rooms/${id}/areas`, { name: 'Sink', expectations: ['No dishes'] })).json;
    await o.post(`/rooms/${id}/areas`, { name: 'Counters' });
    const p = await o.patch(`/room-areas/${first.id}`, { name: 'Kitchen sink' });
    expect(p.json).toMatchObject({ name: 'Kitchen sink', expectations: ['No dishes'] });
    expect((await o.get(`/rooms/${id}/areas`)).json.map((a: any) => a.name)).toEqual(['Kitchen sink', 'Counters']);
  });

  it('CA3 bad names, too many expectations, a long one and a 9th area are 400 naming the field', async () => {
    const id = await newRoom();
    for (const [bad, field] of [
      [{ name: '' }, 'name'], [{ name: 'x'.repeat(AREA_NAME_MAX + 1) }, 'name'],
      [{ name: 'Sink', expectations: Array(EXPECTATIONS_MAX + 1).fill('a') }, 'expectations'],
      [{ name: 'Sink', expectations: ['x'.repeat(EXPECTATION_MAX + 1)] }, 'expectations'],
      [{ name: 'Sink', expectations: 'wipe it' }, 'expectations'],
    ] as const) {
      const r = await o.post(`/rooms/${id}/areas`, bad);
      expect(r.status).toBe(400);
      expect(r.json).toMatchObject({ error: 'invalid_input' });
      expect(r.json.message).toContain(field);
    }
    for (let i = 0; i < AREAS_MAX; i++) expect((await o.post(`/rooms/${id}/areas`, { name: `Area ${i}` })).status).toBe(201);
    const ninth = await o.post(`/rooms/${id}/areas`, { name: 'One more' });
    expect(ninth.status).toBe(400);
    expect(ninth.json.message).toBe(`A room has at most ${AREAS_MAX} areas.`);
  });

  it('CA7 a member who did not make the room may not add, edit or delete an area (Q163, §6.3)', async () => {
    const id = await newRoom();
    expect((await b.post(`/rooms/${id}/areas`, { name: 'Floor' })).status).toBe(403);
    const a = await o.post(`/rooms/${id}/areas`, { name: 'Floor' });
    expect((await b.patch(`/room-areas/${a.json.id}`, { expectations: ['Swept'] })).status).toBe(403);
    expect((await raw(b, 'DELETE', `/room-areas/${a.json.id}`)).status).toBe(403);
    expect((await o.get(`/rooms/${id}/areas`)).json).toMatchObject([{ name: 'Floor', expectations: [] }]);
  });

  it('parseAreaInput: a PATCH keeps what it leaves out; an empty list clears the expectations', () => {
    expect(parseAreaInput({ name: 'Sink' }, { name: 'Old', expectations: ['a'] })).toEqual({ name: 'Sink', expectations: ['a'] });
    expect(parseAreaInput({ expectations: [] }, { name: 'Old', expectations: ['a'] })).toEqual({ name: 'Old', expectations: [] });
    expect(parseAreaInput({ name: 'New' })).toEqual({ name: 'New', expectations: [] });
  });
});

describe('M4y what done looks like — photos', () => {
  it('CA4 photos round-trip privately, list oldest first, stop at 4; no key on the wire', async () => {
    const id = await newRoom();
    const area = (await o.post(`/rooms/${id}/areas`, { name: 'Sink' })).json;
    const pics = [1, 2, 3, 4].map((s) => jpeg(1500, s));
    const ids: string[] = [];
    for (const p of pics) {
      const r = await raw(o, 'POST', `/room-areas/${area.id}/photos`, p);
      expect(r.status).toBe(201);
      const body = await r.json<any>();
      ids.push(body.photos.at(-1));
      expect(JSON.stringify(body)).not.toContain('chore-areas/');
    }
    expect((await o.get(`/rooms/${id}/areas`)).json[0].photos).toEqual(ids);
    const got = await raw(o, 'GET', `/room-area-photos/${ids[0]}`);
    expect(got.status).toBe(200);
    expect(got.headers.get('cache-control')).toBe('private, max-age=3600');
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(pics[0]);
    const fifth = await raw(o, 'POST', `/room-areas/${area.id}/photos`, jpeg(100, 9));
    expect(fifth.status).toBe(400);
    expect((await fifth.json<any>()).message).toBe('An area has at most 4 photos.');
    expect(await objects(area.id)).toHaveLength(4);
  });

  it('CA5 deleting a photo, then the area, removes the R2 objects', async () => {
    const id = await newRoom();
    const area = (await o.post(`/rooms/${id}/areas`, { name: 'Counters' })).json;
    await raw(o, 'POST', `/room-areas/${area.id}/photos`, jpeg(500, 1));
    const two = await (await raw(o, 'POST', `/room-areas/${area.id}/photos`, jpeg(500, 2))).json<any>();
    expect((await raw(o, 'DELETE', `/room-area-photos/${two.photos[0]}`)).status).toBe(204);
    expect(await objects(area.id)).toHaveLength(1);
    expect((await raw(o, 'GET', `/room-area-photos/${two.photos[0]}`)).status).toBe(404);
    expect((await raw(o, 'DELETE', `/room-areas/${area.id}`)).status).toBe(204);
    expect(await objects(area.id)).toEqual([]);
    expect((await o.patch(`/room-areas/${area.id}`, { name: 'x' })).status).toBe(404);
  });

  it('CA6 deleting a chore keeps its room; deleting the room deletes its areas, photos and objects and frees its chores', async () => {
    const id = await newRoom();
    const area = (await o.post(`/rooms/${id}/areas`, { name: 'Stove' })).json;
    const withPhoto = await (await raw(o, 'POST', `/room-areas/${area.id}/photos`, jpeg(500, 3))).json<any>();
    expect((await o.del(`/chores/${await newChore(id)}`)).status).toBe(200);
    expect(await objects(area.id)).toHaveLength(1);
    const chore = await newChore(id);
    expect((await raw(o, 'DELETE', `/rooms/${id}`)).status).toBe(204);
    expect(await objects(area.id)).toEqual([]);
    const left = await env.DB.prepare('SELECT COUNT(*) AS n FROM room_areas WHERE room_id = ?').bind(id).first<{ n: number }>();
    expect(left!.n).toBe(0);
    expect((await o.get(`/rooms/${id}/areas`)).status).toBe(404);
    expect((await raw(o, 'GET', `/room-area-photos/${withPhoto.photos[0]}`)).status).toBe(404);
    expect((await o.get('/chores')).json.find((c: any) => c.id === chore)).toMatchObject({ roomId: null, areaCount: 0 });
  });

  it('CA8 no session → 401; a bad photo type → 400', async () => {
    const id = await newRoom();
    const area = (await o.post(`/rooms/${id}/areas`, { name: 'Sink' })).json;
    expect((await SELF.fetch(`${BASE}/rooms/${id}/areas`)).status).toBe(401);
    expect((await raw(o, 'POST', `/room-areas/${area.id}/photos`, jpeg(10, 1), 'image/gif')).status).toBe(400);
  });
});

describe('M4y rooms', () => {
  it('RM1 rooms are trimmed, listed in the order added, renamed; a bad name is 400', async () => {
    const a = await newRoom(' Bathroom '), b2 = await newRoom('Garage');
    const list = (await o.get('/rooms')).json.map((r: any) => r.id);
    expect(list.indexOf(a)).toBeLessThan(list.indexOf(b2));
    expect((await o.get('/rooms')).json.find((r: any) => r.id === a)).toMatchObject({ name: 'Bathroom', areaCount: 0, createdBy: A });
    expect((await o.patch(`/rooms/${a}`, { name: 'Downstairs bath' })).json).toMatchObject({ name: 'Downstairs bath' });
    for (const name of ['', ' ', 'x'.repeat(ROOM_NAME_MAX + 1)]) {
      const r = await o.post('/rooms', { name });
      expect(r.status).toBe(400);
      expect(r.json.message).toContain('name');
    }
  });

  it('RM2 a chore takes a room, changes it, drops it; an unknown room is 400; a PATCH without roomId keeps it', async () => {
    const r1 = await newRoom(), r2 = await newRoom('Yard');
    const chore = await newChore(r1);
    expect((await o.patch(`/chores/${chore}`, { title: 'Kitchen tidy' })).json).toMatchObject({ roomId: r1 });
    expect((await o.patch(`/chores/${chore}`, { roomId: r2 })).json).toMatchObject({ roomId: r2 });
    expect((await o.patch(`/chores/${chore}`, { roomId: null })).json).toMatchObject({ roomId: null });
    const bad = await o.patch(`/chores/${chore}`, { roomId: 'rom_nope' });
    expect(bad.status).toBe(400);
    expect(bad.json.message).toContain('roomId');
    expect((await o.post('/chores', { title: 'X', days: ['MO'], timing: 'by', time: '19:00', people: [A], steps: [{ title: 'X' }], roomId: 'rom_nope' })).status).toBe(400);
  });

  it('RM3 only an admin adds a room; only its creator or an admin renames or deletes it (Q163, §6.3)', async () => {
    const id = await newRoom();
    expect((await b.patch(`/rooms/${id}`, { name: 'Mine' })).status).toBe(403);
    expect((await raw(b, 'DELETE', `/rooms/${id}`)).status).toBe(403);
    expect((await b.get(`/rooms/${id}/areas`)).status).toBe(200);
    expect((await b.post('/rooms', { name: 'Bedroom' })).status).toBe(403); // ⚑ Q266 admins add rooms
  });
});
