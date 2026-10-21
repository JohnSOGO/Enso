// PL4–PL6 (SPEC §7.9b) — saved places through the real Worker: the seeded Incognito SD, add / change / delete with
// §6.3's creator-or-admin rule, and the refusals.
import { beforeAll, describe, expect, it } from 'vitest';
import { Client, member, owner } from './helpers';

let o: Client, a: Client, b: Client;
beforeAll(async () => {
  o = await owner();
  a = (await member(o)).client;
  b = (await member(o)).client;
});

describe('§7.9b /places', () => {
  it('PL4 a new household has Incognito SD', async () => {
    const r = await a.get('/places');
    expect(r.status).toBe(200);
    expect(r.json.find((p: any) => p.name === 'Incognito SD')).toMatchObject({
      address: '2335 Mirador, Vista, CA 92084', notes: expect.stringContaining('lower drive'), words: ['Incognito'], createdBy: null,
    });
  });

  it('PL5 a member adds one; only its creator or an admin changes it', async () => {
    const r = await a.post('/places', { name: ' Grandma ', address: ' 12 Oak St ', notes: 'Side gate', words: ['Grandma'] });
    expect(r.status, JSON.stringify(r.json)).toBe(201);
    expect(r.json).toMatchObject({ name: 'Grandma', address: '12 Oak St', notes: 'Side gate', words: ['Grandma'] });
    const id = r.json.id;
    const p = await a.patch(`/places/${id}`, { notes: null });
    expect(p.json).toMatchObject({ name: 'Grandma', address: '12 Oak St', notes: null, words: ['Grandma'] });
    expect((await b.patch(`/places/${id}`, { name: 'Mine' })).status).toBe(403);
    expect((await b.del(`/places/${id}`)).status).toBe(403);
    expect((await o.del(`/places/${id}`)).status).toBe(204);
    expect((await a.get('/places')).json.some((x: any) => x.id === id)).toBe(false);
  });

  it('PL6 refusals', async () => {
    expect((await a.post('/places', { name: '', address: 'x' })).status).toBe(400);
    expect((await a.patch('/places/plc_nope', { name: 'x' })).status).toBe(404);
    expect((await a.del('/places/plc_nope')).status).toBe(404);
    expect((await new Client().get('/places')).status).toBe(401);
  });
});
