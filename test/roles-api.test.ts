// SPEC §6.3 "Whose entry it is" (A8–A12) — a plain member (a kid) changes only their own things, shows, recipes,
// list items and chores' areas, through the real Worker; ticks, alarm acks and mess answers stay open to everyone.
import { SELF, env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { BASE, Client, member, owner, tickAt } from './helpers';
import { SHOPPING_LIST_ID } from '../src/shared/lists';
import { cannotChangeText } from '../src/shared/roles';

let o: Client, k: Client, K: string;
beforeAll(async () => {
  o = await owner();
  ({ client: k, id: K } = await member(o));
});

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3, 4, 5]);
const raw = (c: Client, method: string, path: string, body?: Uint8Array) => SELF.fetch(BASE + path, {
  method, body, headers: { cookie: c.cookie, ...(body ? { 'content-type': 'image/jpeg' } : {}) },
});
let n = 0;
/** One of each entry, made by `c`. */
async function entries(c: Client) {
  const i = ++n;
  const thing = (await c.post('/things', { title: `Zoo ${i}` })).json;
  const show = (await c.post('/shows', { title: `Wicked ${i}` })).json;
  const recipe = (await c.post('/recipes', { title: `Tacos ${i}`, ingredients: ['tortillas'], steps: ['fold'] })).json;
  const item = (await c.post(`/lists/${SHOPPING_LIST_ID}/items`, { text: `Milk ${i}` })).json.item;
  for (const x of [thing, show, recipe, item]) expect(x?.id, JSON.stringify(x)).toBeTruthy();
  return { thing, show, recipe, item };
}
/** Every write §6.3 reserves for the creator or an admin, as [what, status]. */
async function writes(c: Client, e: Awaited<ReturnType<typeof entries>>) {
  return [
    ['PATCH thing', (await c.patch(`/things/${e.thing.id}`, { note: 'x' })).status],
    ['plan thing', (await c.post(`/things/${e.thing.id}/plan`, { date: '2026-12-01' })).status],
    ['PUT thing photo', (await raw(c, 'PUT', `/things/${e.thing.id}/photo`, jpeg)).status],
    ['DELETE thing photo', (await raw(c, 'DELETE', `/things/${e.thing.id}/photo`)).status],
    ['PATCH show', (await c.patch(`/shows/${e.show.id}`, { note: 'x' })).status],
    ['PATCH show status + more', (await c.patch(`/shows/${e.show.id}`, { status: 'watched', note: 'x' })).status],
    ['PATCH recipe', (await c.patch(`/recipes/${e.recipe.id}`, { title: 'x' })).status],
    ['re-read recipe', (await c.post(`/recipes/${e.recipe.id}/transcript`, { text: 'x' })).status],
    ['PUT recipe photo', (await raw(c, 'PUT', `/recipes/${e.recipe.id}/photo`, jpeg)).status],
    ['DELETE recipe photo', (await raw(c, 'DELETE', `/recipes/${e.recipe.id}/photo`)).status],
    ['PATCH item', (await c.patch(`/list-items/${e.item.id}`, { note: 'x' })).status],
    ['PATCH item checked + more', (await c.patch(`/list-items/${e.item.id}`, { checked: true, note: 'x' })).status],
    ['PUT item photo', (await raw(c, 'PUT', `/list-items/${e.item.id}/photo`, jpeg)).status],
    ['DELETE item photo', (await raw(c, 'DELETE', `/list-items/${e.item.id}/photo`)).status],
    ['DELETE thing', (await c.del(`/things/${e.thing.id}`)).status],
    ['DELETE show', (await c.del(`/shows/${e.show.id}`)).status],
    ['DELETE recipe', (await c.del(`/recipes/${e.recipe.id}`)).status],
    ['DELETE item', (await c.del(`/list-items/${e.item.id}`)).status],
  ] as const;
}

describe('§6.3 whose entry it is', () => {
  it('A8 a member changes nothing someone else made; nothing changes', async () => {
    const e = await entries(o);
    for (const [what, status] of await writes(k, e)) expect(status, what).toBe(403);
    const r = await k.patch(`/things/${e.thing.id}`, { note: 'x' });
    expect(r.json).toEqual({ error: 'forbidden', message: cannotChangeText('thing') });
    expect((await o.get(`/things/${e.thing.id}`)).json).toMatchObject({ note: null, status: 'idea' });
    expect((await o.get(`/shows/${e.show.id}`)).json).toMatchObject({ note: null, status: 'want' });
    expect((await o.get(`/recipes/${e.recipe.id}`)).json.title).toBe(e.recipe.title);
    const list = (await o.get(`/lists/${SHOPPING_LIST_ID}`)).json;
    expect(list.open.find((i: any) => i.id === e.item.id)).toMatchObject({ note: null });
  });

  it('A9 a member changes their own, and an admin changes anyone\'s', async () => {
    const mine = await entries(k);
    for (const [what, status] of await writes(k, mine)) expect([200, 201, 204, 400, 409, 422, 429, 503], what).toContain(status);
    const theirs = await entries(k);
    for (const [what, status] of await writes(o, theirs)) expect(status, what).not.toBe(403);
  });

  it('A10 anyone ticks anyone\'s list item and marks anyone\'s show watched', async () => {
    const e = await entries(o);
    expect((await k.patch(`/list-items/${e.item.id}`, { checked: true })).json).toMatchObject({ checkedBy: K });
    expect((await k.patch(`/list-items/${e.item.id}`, { checked: false })).json).toMatchObject({ checkedAt: null });
    expect((await k.patch(`/shows/${e.show.id}`, { status: 'watched' })).json).toMatchObject({ status: 'watched', watchedBy: K });
    expect((await k.patch(`/shows/${e.show.id}`, { status: 'want' })).status).toBe(200);
    expect((await k.patch(`/shows/${e.show.id}`, {})).status).toBe(403); // an empty PATCH is not a tick
  });

  it('A11 a chore\'s areas are its creator\'s or an admin\'s', async () => {
    const chore = (await o.post('/chores', { title: 'Bath', days: ['MO'], timing: 'by', time: '19:00', people: [K], steps: [{ title: 'Bath' }] })).json.id;
    const area = (await o.post(`/chores/${chore}/areas`, { name: 'Tub' })).json;
    const photo = (await (await raw(o, 'POST', `/chore-areas/${area.id}/photos`, jpeg)).json() as any).photos[0];
    expect((await k.get(`/chores/${chore}/areas`)).status).toBe(200);
    expect((await raw(k, 'GET', `/chore-area-photos/${photo}`)).status).toBe(200);
    expect((await k.post(`/chores/${chore}/areas`, { name: 'Sink' })).status).toBe(403);
    expect((await k.patch(`/chore-areas/${area.id}`, { name: 'x' })).status).toBe(403);
    expect((await raw(k, 'POST', `/chore-areas/${area.id}/photos`, jpeg)).status).toBe(403);
    expect((await raw(k, 'DELETE', `/chore-area-photos/${photo}`)).status).toBe(403);
    expect((await raw(k, 'DELETE', `/chore-areas/${area.id}`)).status).toBe(403);
    expect((await o.get(`/chores/${chore}/areas`)).json).toMatchObject([{ name: 'Tub', photos: [photo] }]);

    const own = (await k.post('/chores', { title: 'Room', days: ['MO'], timing: 'by', time: '19:00', people: [K], steps: [{ title: 'Room' }] })).json.id;
    const mine = await k.post(`/chores/${own}/areas`, { name: 'Bed' });
    expect(mine.status).toBe(201);
    expect((await raw(k, 'DELETE', `/chore-areas/${mine.json.id}`)).status).toBe(204);
  });

  it('A12 a member acknowledges someone else\'s alarm and answers someone else\'s mess', async () => {
    const a = await o.post('/alarms', { title: 'Wake up', time: '07:00', days: ['WE'], channels: ['push'] });
    await env.DB.prepare('UPDATE events SET start_date = ? WHERE id = ?').bind('2026-10-01', a.json.id).run();
    await tickAt(o, '2026-10-06T12:00:00Z');
    await tickAt(o, '2026-10-07T14:00:00Z'); // Wed 07:00 PDT
    const fire = (await k.get('/fires?state=ringing')).json.find((f: any) => f.eventId === a.json.id);
    expect(fire, 'the alarm rings').toBeTruthy();
    const ack = await k.post(`/fires/${fire.id}/actions`, { action: 'done' });
    expect(ack.status, JSON.stringify(ack.json)).toBe(200);

    const m = await raw(o, 'POST', '/messes', jpeg);
    const mess: any = await m.json();
    expect(m.status).toBe(201);
    expect((await k.post(`/messes/${mess.id}/deny`)).status).toBe(200);
    expect((await k.post(`/messes/${mess.id}/claim`)).json).toMatchObject({ status: 'owed', claimedBy: K });
  });
});
