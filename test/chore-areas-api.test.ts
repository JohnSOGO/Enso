// M4y acceptance (SPEC §7B.6) — what done looks like: a chore's areas, their expectations and their photos (R2,
// private), through the real Worker. Each test makes its own chore; the bucket is checked directly.
import { SELF, env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { BASE, Client, member, owner } from './helpers';
import { AREAS_MAX, AREA_NAME_MAX, EXPECTATIONS_MAX, EXPECTATION_MAX, parseAreaInput } from '../src/shared/chore-areas';

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
async function newChore() {
  const r = await o.post('/chores', { title: 'Kitchen', days: ['MO'], timing: 'by', time: '19:00', people: [A], steps: [{ title: 'Kitchen' }] });
  expect(r.status, JSON.stringify(r.json)).toBe(201);
  return r.json.id as string;
}
const objects = async (areaId: string) => (await env.PHOTOS.list({ prefix: `chore-areas/${areaId}/` })).objects.map((x) => x.key);

describe('M4y what done looks like — areas', () => {
  it('CA1 an area is trimmed, blank expectations dropped, listed, and counted on /chores and today', async () => {
    const id = await newChore();
    const r = await o.post(`/chores/${id}/areas`, { name: ' Sink ', expectations: ['No dishes', ' ', ' Faucet dry '] });
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ choreId: id, name: 'Sink', expectations: ['No dishes', 'Faucet dry'], photos: [] });
    expect((await o.get(`/chores/${id}/areas`)).json.map((a: any) => a.id)).toEqual([r.json.id]);
    expect((await o.get('/chores')).json.find((c: any) => c.id === id).areaCount).toBe(1);
    const run = (await o.get('/chores/today')).json.runs.find((x: any) => x.choreId === id);
    if (run) expect(run.areaCount).toBe(1); // only when today is a Monday
  });

  it('CA2 areas keep the order added; a PATCH of the name keeps the expectations', async () => {
    const id = await newChore();
    const first = (await o.post(`/chores/${id}/areas`, { name: 'Sink', expectations: ['No dishes'] })).json;
    await o.post(`/chores/${id}/areas`, { name: 'Counters' });
    const p = await o.patch(`/chore-areas/${first.id}`, { name: 'Kitchen sink' });
    expect(p.json).toMatchObject({ name: 'Kitchen sink', expectations: ['No dishes'] });
    expect((await o.get(`/chores/${id}/areas`)).json.map((a: any) => a.name)).toEqual(['Kitchen sink', 'Counters']);
  });

  it('CA3 bad names, too many expectations, a long one and a 9th area are 400 naming the field', async () => {
    const id = await newChore();
    for (const [bad, field] of [
      [{ name: '' }, 'name'], [{ name: 'x'.repeat(AREA_NAME_MAX + 1) }, 'name'],
      [{ name: 'Sink', expectations: Array(EXPECTATIONS_MAX + 1).fill('a') }, 'expectations'],
      [{ name: 'Sink', expectations: ['x'.repeat(EXPECTATION_MAX + 1)] }, 'expectations'],
      [{ name: 'Sink', expectations: 'wipe it' }, 'expectations'],
    ] as const) {
      const r = await o.post(`/chores/${id}/areas`, bad);
      expect(r.status).toBe(400);
      expect(r.json).toMatchObject({ error: 'invalid_input' });
      expect(r.json.message).toContain(field);
    }
    for (let i = 0; i < AREAS_MAX; i++) expect((await o.post(`/chores/${id}/areas`, { name: `Area ${i}` })).status).toBe(201);
    const ninth = await o.post(`/chores/${id}/areas`, { name: 'One more' });
    expect(ninth.status).toBe(400);
    expect(ninth.json.message).toBe(`A chore has at most ${AREAS_MAX} areas.`);
  });

  it('CA7 a member who did not make the chore may add, edit and delete an area', async () => {
    const id = await newChore();
    const a = await b.post(`/chores/${id}/areas`, { name: 'Floor' });
    expect(a.status).toBe(201);
    expect((await b.patch(`/chore-areas/${a.json.id}`, { expectations: ['Swept'] })).json.expectations).toEqual(['Swept']);
    expect((await raw(b, 'DELETE', `/chore-areas/${a.json.id}`)).status).toBe(204);
    expect((await o.get(`/chores/${id}/areas`)).json).toEqual([]);
  });

  it('parseAreaInput: a PATCH keeps what it leaves out; an empty list clears the expectations', () => {
    expect(parseAreaInput({ name: 'Sink' }, { name: 'Old', expectations: ['a'] })).toEqual({ name: 'Sink', expectations: ['a'] });
    expect(parseAreaInput({ expectations: [] }, { name: 'Old', expectations: ['a'] })).toEqual({ name: 'Old', expectations: [] });
    expect(parseAreaInput({ name: 'New' })).toEqual({ name: 'New', expectations: [] });
  });
});

describe('M4y what done looks like — photos', () => {
  it('CA4 photos round-trip privately, list oldest first, stop at 4; no key on the wire', async () => {
    const id = await newChore();
    const area = (await o.post(`/chores/${id}/areas`, { name: 'Sink' })).json;
    const pics = [1, 2, 3, 4].map((s) => jpeg(1500, s));
    const ids: string[] = [];
    for (const p of pics) {
      const r = await raw(o, 'POST', `/chore-areas/${area.id}/photos`, p);
      expect(r.status).toBe(201);
      const body = await r.json<any>();
      ids.push(body.photos.at(-1));
      expect(JSON.stringify(body)).not.toContain('chore-areas/');
    }
    expect((await o.get(`/chores/${id}/areas`)).json[0].photos).toEqual(ids);
    const got = await raw(o, 'GET', `/chore-area-photos/${ids[0]}`);
    expect(got.status).toBe(200);
    expect(got.headers.get('cache-control')).toBe('private, max-age=3600');
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(pics[0]);
    const fifth = await raw(o, 'POST', `/chore-areas/${area.id}/photos`, jpeg(100, 9));
    expect(fifth.status).toBe(400);
    expect((await fifth.json<any>()).message).toBe('An area has at most 4 photos.');
    expect(await objects(area.id)).toHaveLength(4);
  });

  it('CA5 deleting a photo, then the area, removes the R2 objects', async () => {
    const id = await newChore();
    const area = (await o.post(`/chores/${id}/areas`, { name: 'Counters' })).json;
    await raw(o, 'POST', `/chore-areas/${area.id}/photos`, jpeg(500, 1));
    const two = await (await raw(o, 'POST', `/chore-areas/${area.id}/photos`, jpeg(500, 2))).json<any>();
    expect((await raw(o, 'DELETE', `/chore-area-photos/${two.photos[0]}`)).status).toBe(204);
    expect(await objects(area.id)).toHaveLength(1);
    expect((await raw(o, 'GET', `/chore-area-photos/${two.photos[0]}`)).status).toBe(404);
    expect((await raw(o, 'DELETE', `/chore-areas/${area.id}`)).status).toBe(204);
    expect(await objects(area.id)).toEqual([]);
    expect((await o.patch(`/chore-areas/${area.id}`, { name: 'x' })).status).toBe(404);
  });

  it('CA6 deleting the chore deletes its areas, their photos and objects; its areas are then 404', async () => {
    const id = await newChore();
    const area = (await o.post(`/chores/${id}/areas`, { name: 'Stove' })).json;
    const withPhoto = await (await raw(o, 'POST', `/chore-areas/${area.id}/photos`, jpeg(500, 3))).json<any>();
    expect((await o.del(`/chores/${id}`)).status).toBe(200);
    expect(await objects(area.id)).toEqual([]);
    const left = await env.DB.prepare('SELECT COUNT(*) AS n FROM chore_areas WHERE chore_id = ?').bind(id).first<{ n: number }>();
    expect(left!.n).toBe(0);
    expect((await o.get(`/chores/${id}/areas`)).status).toBe(404);
    expect((await raw(o, 'GET', `/chore-area-photos/${withPhoto.photos[0]}`)).status).toBe(404);
  });

  it('CA8 no session → 401; a bad photo type → 400', async () => {
    const id = await newChore();
    const area = (await o.post(`/chores/${id}/areas`, { name: 'Sink' })).json;
    expect((await SELF.fetch(`${BASE}/chores/${id}/areas`)).status).toBe(401);
    expect((await raw(o, 'POST', `/chore-areas/${area.id}/photos`, jpeg(10, 1), 'image/gif')).status).toBe(400);
  });
});
