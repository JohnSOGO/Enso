// M4z acceptance (SPEC §7B.7) — whose mess? through the real Worker: report with a photo, the asks (fire-less
// pushes with mess_id, counted from deliveries), That was me / Not me, To talk about, an admin's outcome, settling,
// balances and the photo's life in R2. Push goes nowhere (no subscriptions): each ask is still a delivery row.
import { SELF, env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { BASE, Client, member, owner, tickAt } from './helpers';
import { MESS_ASK_TITLE, MESS_DISCUSS_TITLE, MESS_NOTE_MAX, NUDGE_EVERY_MIN } from '../src/shared/messes';
import { addMinutes } from '../src/shared/time';

let a: Client, b: Client, cc: Client, A: string, B: string, C: string, chore: string;
beforeAll(async () => {
  a = await owner();
  A = (await a.get('/me')).json.id;
  ({ client: b, id: B } = await member(a));
  ({ client: cc, id: C } = await member(a));
  chore = (await a.post('/chores', { title: 'Kitchen', days: ['MO'], timing: 'by', time: '19:00', people: [A], steps: [{ title: 'Kitchen' }] })).json.id;
});

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3, 4, 5]);
const raw = (c: Client, method: string, path: string, body?: Uint8Array, type = 'image/jpeg') => SELF.fetch(BASE + path, {
  method, body, headers: { cookie: c.cookie, ...(body ? { 'content-type': type } : {}) },
});
async function report(c: Client, q = '') {
  const r = await raw(c, 'POST', `/messes${q}`, jpeg);
  const json: any = await r.json();
  expect(r.status, JSON.stringify(json)).toBe(201);
  return json;
}
const asks = async (messId: string, memberId?: string) => (await env.DB.prepare(
  `SELECT member_id, alert_number, channel, title FROM deliveries WHERE mess_id = ? AND title = ? ${memberId ? 'AND member_id = ?' : ''} ORDER BY alert_number`)
  .bind(messId, MESS_ASK_TITLE, ...(memberId ? [memberId] : [])).all<{ member_id: string; alert_number: number; channel: string }>()).results;
const notices = async (messId: string) => (await env.DB.prepare('SELECT member_id FROM deliveries WHERE mess_id = ? AND title = ?')
  .bind(messId, MESS_DISCUSS_TITLE).all<{ member_id: string }>()).results;
const objects = async (id: string) => (await env.PHOTOS.list({ prefix: `messes/${id}/` })).objects.length;
const find = async (c: Client, id: string) => (await c.get('/messes')).json.messes.find((m: any) => m.id === id);
const at = (m: any, min: number) => addMinutes(m.createdAt, min);

describe('M4z whose mess?', () => {
  it('MS1 a report asks everyone else at once, by push only', async () => {
    const m = await report(b, `?choreId=${chore}&note=${encodeURIComponent(' pans ')}`);
    expect(m).toMatchObject({ status: 'open', reportedBy: B, note: 'pans', choreTitle: 'Kitchen', hasPhoto: true, claimedBy: null });
    expect([...m.asked].sort()).toEqual([A, C].sort());
    const sent = await asks(m.id);
    expect(sent.map((d) => d.member_id).sort()).toEqual([A, C].sort());
    expect(sent.every((d) => d.alert_number === 1 && d.channel === 'push')).toBe(true);
    expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM deliveries WHERE mess_id = ? AND channel = 'house'`).bind(m.id).first<{ n: number }>())!.n).toBe(0);
    expect(await objects(m.id)).toBe(1);
    const photo = await raw(a, 'GET', `/messes/${m.id}/photo`);
    expect(photo.headers.get('cache-control')).toBe('private, max-age=3600');
    expect(new Uint8Array(await photo.arrayBuffer())).toEqual(jpeg);
  });

  it(`MS2 asks again every ${NUDGE_EVERY_MIN} min, four in all`, async () => {
    const m = await report(b);
    await tickAt(a, at(m, 14));
    expect((await asks(m.id, C)).length).toBe(1);
    for (const [min, n] of [[15, 2], [30, 3], [45, 4], [60, 4], [90, 4]]) {
      await tickAt(a, at(m, min));
      expect((await asks(m.id, C)).map((d) => d.alert_number), `at +${min}`).toEqual([1, 2, 3, 4].slice(0, n));
    }
  });

  it('MS3 Not me stops the asks to that person only', async () => {
    const m = await report(b);
    expect((await a.post(`/messes/${m.id}/deny`)).json).toMatchObject({ status: 'open', deniedBy: [A] });
    await tickAt(a, at(m, 15));
    expect((await asks(m.id, A)).length).toBe(1);
    expect((await asks(m.id, C)).length).toBe(2);
  });

  it('MS4 That was me ends the asking; a point is owed', async () => {
    const m = await report(b);
    const r = await cc.post(`/messes/${m.id}/claim`);
    expect(r.json).toMatchObject({ status: 'owed', claimedBy: C, assignedBy: null, asked: [] });
    await tickAt(a, at(m, 15));
    expect((await asks(m.id)).length).toBe(2);
    expect((await b.get('/messes')).json.balances.some((x: any) => x.from === C && x.to === B && x.points >= 1)).toBe(true);
  });

  it('MS5 the reporter is never asked; an owed mess takes no answers', async () => {
    const m = await report(b);
    expect((await b.post(`/messes/${m.id}/claim`)).status).toBe(400);
    expect((await b.post(`/messes/${m.id}/deny`)).status).toBe(400);
    await cc.post(`/messes/${m.id}/claim`);
    expect((await a.post(`/messes/${m.id}/claim`)).status).toBe(409);
    expect((await a.post(`/messes/${m.id}/deny`)).status).toBe(409);
  });

  it('MS6 everyone says Not me → To talk about at once, the admins told once, no more asks', async () => {
    const m = await report(b);
    await a.post(`/messes/${m.id}/deny`);
    const r = await cc.post(`/messes/${m.id}/deny`);
    expect(r.json).toMatchObject({ status: 'discuss', asked: [] });
    expect((await notices(m.id)).map((d) => d.member_id)).toEqual([A]);
    await tickAt(a, at(m, 15));
    expect((await asks(m.id)).length).toBe(2);
    expect((await cc.post(`/messes/${m.id}/claim`)).json.status).toBe('owed'); // claiming is still open
  });

  it('MS7 nobody answers for 24 h → To talk about; the admin push goes once', async () => {
    const m = await report(b);
    await tickAt(a, at(m, 24 * 60 - 1));
    expect((await find(b, m.id)).status).toBe('open');
    await tickAt(a, at(m, 24 * 60));
    const now = await find(b, m.id);
    expect(now.status).toBe('discuss');
    expect([...now.asked].sort()).toEqual([A, C].sort()); // the banner stays for those who haven't answered
    await tickAt(a, at(m, 24 * 60 + 1));
    expect((await notices(m.id)).length).toBe(1);
  });

  it('MS8 an admin records whose it was, or nobody\'s; nobody else may', async () => {
    const m = await report(b);
    expect((await cc.post(`/messes/${m.id}/decide`, { memberId: C })).status).toBe(403);
    expect((await a.post(`/messes/${m.id}/decide`, { memberId: B })).status).toBe(400);
    expect((await a.post(`/messes/${m.id}/decide`, { memberId: 'mem_nobody' })).status).toBe(400);
    expect((await a.post(`/messes/${m.id}/decide`, { memberId: C })).json).toMatchObject({ status: 'owed', claimedBy: C, assignedBy: A });
    const n = await report(b);
    expect((await a.post(`/messes/${n.id}/decide`, { memberId: null })).json).toMatchObject({ status: 'closed', hasPhoto: false });
    expect(await objects(n.id)).toBe(0);
    expect(await find(b, n.id)).toBeUndefined();
  });

  it('MS10 the one owed settles a point; nobody else but an admin', async () => {
    const m = await report(b);
    await cc.post(`/messes/${m.id}/claim`);
    expect((await cc.post(`/messes/${m.id}/settle`, { how: 'paid' })).status).toBe(403);
    expect((await b.post(`/messes/${m.id}/settle`, { how: 'later' })).status).toBe(400);
    expect((await b.post(`/messes/${m.id}/settle`, { how: 'paid' })).json).toMatchObject({ status: 'settled', hasPhoto: false });
    expect(await objects(m.id)).toBe(0);
    expect(await find(b, m.id)).toBeUndefined();
    expect((await b.post(`/messes/${m.id}/settle`, { how: 'paid' })).status).toBe(409);
  });

  it('MS11 the reporter deletes while unanswered; an admin any time', async () => {
    const m = await report(b);
    expect((await cc.del(`/messes/${m.id}`)).status).toBe(403);
    expect((await b.del(`/messes/${m.id}`)).status).toBe(204);
    expect(await objects(m.id)).toBe(0);
    expect((await b.post(`/messes/${m.id}/claim`)).status).toBe(404);
    const n = await report(b);
    await cc.post(`/messes/${n.id}/claim`);
    expect((await b.del(`/messes/${n.id}`)).status).toBe(403);
    expect((await a.del(`/messes/${n.id}`)).status).toBe(204);
    expect(await find(a, n.id)).toBeUndefined();
  });

  it('MS13 a report needs a good photo, a short note and a real chore', async () => {
    expect((await raw(b, 'POST', '/messes')).status).toBe(400);
    expect((await raw(b, 'POST', '/messes', jpeg, 'text/plain')).status).toBe(400);
    const long = await raw(b, 'POST', `/messes?note=${'x'.repeat(MESS_NOTE_MAX + 1)}`, jpeg);
    expect(long.status).toBe(400);
    expect(((await long.json()) as any).message).toMatch(/note/);
    expect((await raw(b, 'POST', '/messes?choreId=chr_nope', jpeg)).status).toBe(404);
    expect((await raw(new Client(), 'POST', '/messes', jpeg)).status).toBe(401);
  });

  it('MS14 mess asks never count toward the /ops/notify hourly limit', async () => {
    const m = await report(b);
    const now = new Date().toISOString();
    await env.DB.batch(Array.from({ length: 30 }, (_, i) => env.DB.prepare(
      `INSERT INTO deliveries (id, fire_id, alert_number, channel, member_id, message, title, mess_id, status, created_at, updated_at)
       VALUES (?, NULL, 1, 'push', ?, 'x', ?, ?, 'failed', ?, ?)`).bind(`dlv_ms14_${i}`, C, MESS_ASK_TITLE, m.id, now, now)));
    const r = await new Client().post('/ops/notify', { text: 'still pings' }, { authorization: 'Bearer test-ops-token' });
    expect(r.status, JSON.stringify(r.json)).toBe(201);
  });

  it('MS12 a photo is deleted 30 days after the report; the point stays owed', async () => {
    const m = await report(b);
    await cc.post(`/messes/${m.id}/claim`);
    await env.DB.prepare('UPDATE messes SET created_at = ? WHERE id = ?').bind(addMinutes(m.createdAt, -31 * 24 * 60), m.id).run();
    await tickAt(a, new Date().toISOString());
    expect(await find(b, m.id)).toMatchObject({ status: 'owed', hasPhoto: false });
    expect(await objects(m.id)).toBe(0);
  });

  it('MS9 balances: each sees their own pairs, netted; an admin sees all', async () => {
    for (const x of (await a.get('/messes')).json.messes) if (x.status === 'owed') await a.post(`/messes/${x.id}/settle`, { how: 'forgiven' });
    const { client: d } = await member(a);
    for (const [rep, claimer] of [[b, cc], [b, cc], [cc, b]] as const) {
      const m = await report(rep);
      await claimer.post(`/messes/${m.id}/claim`);
    }
    const pair = [{ from: C, to: B, points: 1 }];
    expect((await b.get('/messes')).json.balances).toEqual(pair);
    expect((await cc.get('/messes')).json.balances).toEqual(pair);
    expect((await a.get('/messes')).json.balances).toEqual(pair);
    const theirs = (await d.get('/messes')).json;
    expect(theirs.balances).toEqual([]);
    expect(theirs.messes.some((m: any) => m.status === 'owed')).toBe(false);
  });
});
