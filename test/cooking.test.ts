// SPEC §7D.8 CK1–CK9 — cooking timers: the pure rules (cooking.ts), then /cooking through /dev/tick. Routes use the real
// clock, so a test "finishes" a timer by moving its done-at into the past; ticks then run at real-now-relative instants.
import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { Client, member, owner, tickAt } from './helpers';
import {
  COOK_RENOTIFY_MIN, closeCook, cookAlert, cookExpired, cookLabel, cookMessage, createCook, editCook, offCook, parseCreate, parseEdit,
  startCook, stopCook, type CookRow,
} from '../src/shared/cooking';
import { newMachineFire, type FireRow } from '../src/shared/engine';
import { addMinutes, localToUtc } from '../src/shared/time';

const T = '2026-10-11T19:00:00.000Z';
const make = (over: Partial<CookRow> = {}): CookRow => ({ ...createCook('cook_1', { kind: 'air_fryer', name: null, minutes: 12, alertId: 'A' }, 'A', T).row, ...over });
const fireOf = (dueAt: string, over: Partial<FireRow> = {}): FireRow => ({ id: 'fire_1', ...newMachineFire('cook_1', dueAt), ...over });

describe('CK1–CK2, CK5–CK6, CK8 the pure rules (cooking.ts)', () => {
  it('CK1 label and message', () => {
    expect(cookLabel({ cook_kind: 'oven', name: 'Oven 2' })).toBe('Oven 2');
    expect(cookLabel({ cook_kind: 'air_fryer', name: null })).toBe('Air fryer');
    expect(cookMessage({ cook_kind: 'air_fryer', name: null }, 'Sam')).toBe('Sam, the air fryer is done');
    expect(cookMessage({ cook_kind: 'oven', name: 'Oven 2' }, 'Sam')).toBe('Sam, Oven 2 is done');
    expect(cookMessage({ cook_kind: 'air_fryer', name: null }, null)).toBe('The air fryer is done');
    expect(cookMessage({ cook_kind: 'oven', name: 'Oven 2' }, null)).toBe('Oven 2 is done');
  });

  it('cookAlert: every 5 min, no alert hours; nobody → phones only', () => {
    expect(cookAlert('A')).toMatchObject({ allSpeakers: true, cfg: { channels: ['push', 'house'], renotifyMin: COOK_RENOTIFY_MIN, maxAlerts: 4 } });
    expect(cookAlert(null)).toMatchObject({ allSpeakers: false, cfg: { channels: ['push'], renotifyMin: 5 } });
    expect(cookAlert('A').cfg.quietUntil).toBeUndefined();
  });

  it('CK2 input rules', () => {
    const ok = { kind: 'oven', minutes: 12 };
    for (const m of [0, 601, 2.5, '12']) expect(parseCreate({ ...ok, minutes: m }, ['A'], 'A')).toBe('Minutes must be a whole number from 1 to 600.');
    expect(parseCreate({ ...ok, kind: 'grill' }, ['A'], 'A')).toBe('What must be one of Air fryer, Stove, Oven, Microwave, Other.');
    expect(parseCreate({ ...ok, name: 'x'.repeat(41) }, ['A'], 'A')).toBe('Name must be 40 characters or fewer.');
    expect(parseCreate(ok, ['A'], 'A')).toEqual({ kind: 'oven', name: null, minutes: 12, alertId: 'A' });
    expect(parseCreate({ ...ok, name: ' Oven 2 ', alertId: null }, ['A'], 'A')).toEqual({ kind: 'oven', name: 'Oven 2', minutes: 12, alertId: null });
    expect(parseCreate({ ...ok, alertId: 'Z' }, ['A'], 'A')).toBe('Alert when done must be an active member or nobody.');
    expect(parseEdit({ minutes: 20, name: '' }, ['A'])).toEqual({ minutes: 20, name: null });
    expect(parseEdit({ minutes: 0 }, ['A'])).toBe('Minutes must be a whole number from 1 to 600.');
  });

  it('CK5 Off, Stop, Start again and their refusals', () => {
    const r = make(), done = addMinutes(T, 12);
    expect(offCook(r, null, 'A', T)).toMatchObject({ error: 'not_done' });
    const o = offCook(r, fireOf(done), 'B', done);
    expect(o).toMatchObject({ row: { done_at: null, started_at: null, minutes: 12, alert_id: 'A' }, closeFire: { close_reason: 'done', closed_by: 'B' } });
    const off = (o as any).row as CookRow;
    expect(startCook(r, 'A', T)).toMatchObject({ error: 'busy' });
    expect(startCook(off, 'B', done)).toMatchObject({ row: { done_at: addMinutes(done, 12), owner_id: 'B' }, newFire: { machine_id: 'cook_1', due_at: addMinutes(done, 12) } });
    expect(stopCook(off, null, 'A', done)).toMatchObject({ error: 'not_running' });
    expect(stopCook(r, fireOf(done), 'A', T)).toMatchObject({ row: { done_at: null }, closeFire: { close_reason: 'removed' } });
  });

  it('CK6 Edit minutes moves done-at from the start, never before now', () => {
    const r = make(), now = addMinutes(T, 10);
    const longer = editCook(r, { minutes: 20 }, fireOf(addMinutes(T, 12)), 'A', now);
    expect(longer).toMatchObject({ row: { done_at: addMinutes(T, 20), minutes: 20 }, closeFire: { close_reason: 'superseded' }, newFire: { due_at: addMinutes(T, 20) } });
    expect(editCook(r, { minutes: 5 }, null, 'A', now)).toMatchObject({ row: { done_at: now }, newFire: { due_at: now } });
    expect(editCook(r, { name: 'Oven 2' }, null, 'A', now)).toEqual({ row: { ...r, name: 'Oven 2', updated_at: now } });
    const off = { ...r, started_at: null, done_at: null };
    expect(editCook(off, { minutes: 30 }, null, 'A', now)).toEqual({ row: { ...off, minutes: 30, updated_at: now } });
  });

  it('CK8 cookExpired, Los Angeles', () => {
    const tz = 'America/Los_Angeles', at = (d: string, t: string) => localToUtc(d, t, tz);
    const now = at('2026-10-12', '00:30');
    const offSince = (iso: string) => make({ started_at: null, done_at: null, updated_at: iso });
    expect(cookExpired(offSince(at('2026-10-11', '18:00')), null, tz, now)).toBe(true);
    expect(cookExpired(make({ started_at: at('2026-10-11', '23:50'), done_at: at('2026-10-12', '00:40'), updated_at: at('2026-10-11', '23:50') }), null, tz, now)).toBe(false);
    const doneLate = make({ started_at: at('2026-10-11', '23:40'), done_at: at('2026-10-11', '23:58'), updated_at: at('2026-10-11', '23:40') });
    expect(cookExpired(doneLate, fireOf(doneLate.done_at!, { state: 'ringing', alert_count: 2 }), tz, now)).toBe(false);
    expect(cookExpired(doneLate, fireOf(doneLate.done_at!, { state: 'ringing', alert_count: 4 }), tz, now)).toBe(true);
    expect(cookExpired(offSince(at('2026-10-12', '00:05')), null, tz, now)).toBe(false);
    expect(cookExpired({ ...offSince(at('2026-10-11', '18:00')), closed_at: now }, null, tz, now)).toBe(false);
    expect(closeCook(make(), null, null, now).row.closed_at).toBe(now);
  });
});

let o: Client, bClient: Client, A: string, A_NAME: string, B: string;

beforeAll(async () => {
  o = await owner();
  const me = (await o.get('/me')).json;
  A = me.id; A_NAME = me.displayName ?? me.display_name;
  const m = await member(o);
  B = m.id; bClient = m.client;
});

const firesOf = async (id: string) => (await env.DB.prepare('SELECT * FROM fires WHERE machine_id = ? ORDER BY rowid').bind(id).all<any>()).results;
const openFire = async (id: string) => (await firesOf(id)).find((f) => f.state !== 'closed');
const deliveriesOf = async (fireId: string) =>
  (await env.DB.prepare('SELECT channel, member_id, message, alert_number FROM deliveries WHERE fire_id = ? ORDER BY alert_number, channel').bind(fireId).all<any>()).results;

/** Makes a running timer done `minsAgo` minutes ago (its row and its open fire). Returns the new done-at. */
async function finishedAgo(id: string, minsAgo: number): Promise<string> {
  const doneAt = new Date(Date.now() - minsAgo * 60_000).toISOString();
  await env.DB.batch([
    env.DB.prepare('UPDATE machines SET started_at = ?, done_at = ?, updated_at = ? WHERE id = ?').bind(addMinutes(doneAt, -12), doneAt, addMinutes(doneAt, -12), id),
    env.DB.prepare(`UPDATE fires SET due_at = ? WHERE machine_id = ? AND state != 'closed'`).bind(doneAt, id),
  ]);
  return doneAt;
}
const create = async (b: object) => {
  const r = await o.post('/cooking', b);
  expect(r.status, JSON.stringify(r.json)).toBe(201);
  return r.json[r.json.length - 1];
};

describe('/cooking (CK3–CK7, CK9)', () => {
  it('CK3 create an air fryer for 12 min; at done-at it rings every phone, then the house too, every 5 min', async () => {
    const t = await create({ kind: 'air_fryer', minutes: 12 });
    expect(t).toMatchObject({ kind: 'air_fryer', name: null, label: 'Air fryer', state: 'running', minutes: 12, alertId: A, startedBy: A });
    expect(Date.parse(t.doneAt) - Date.parse(t.startedAt)).toBe(12 * 60_000);
    const fire = await openFire(t.id);
    expect(fire).toMatchObject({ kind: 'machine', state: 'scheduled', due_at: t.doneAt });
    expect((await o.get('/machines')).json.map((m: any) => m.id)).toEqual(['washer', 'dryer', 'dishwasher']);

    const doneAt = await finishedAgo(t.id, 0);
    await tickAt(o, doneAt);
    await tickAt(o, addMinutes(doneAt, 5));
    const d = await deliveriesOf(fire.id);
    expect(d.filter((x) => x.alert_number === 1 && x.channel === 'push').map((x) => x.member_id).sort()).toEqual([A, B].sort());
    expect(d.filter((x) => x.alert_number === 2 && x.channel === 'house')).toHaveLength(1);
    expect(d[0].message).toBe(`${A_NAME}, the air fryer is done`);
    const ringing = (await bClient.get('/fires?state=ringing')).json.find((f: any) => f.id === fire.id);
    expect(ringing).toMatchObject({ kind: 'machine', machineId: t.id, title: 'Air fryer', personId: A });
  });

  it('CK4 nobody to alert: phones only on every alert', async () => {
    const t = await create({ kind: 'oven', name: 'Oven 2', minutes: 30, alertId: null });
    const fire = await openFire(t.id);
    const doneAt = await finishedAgo(t.id, 0);
    await tickAt(o, doneAt);
    await tickAt(o, addMinutes(doneAt, 5));
    const d = await deliveriesOf(fire.id);
    expect(d.every((x) => x.channel === 'push')).toBe(true);
    expect(Math.max(...d.map((x) => x.alert_number))).toBe(2);
    expect(d[0].message).toBe('Oven 2 is done');
  });

  it('CK5 Off, Start again, Stop; refusals', async () => {
    const t = await create({ kind: 'stove', minutes: 10 });
    expect((await o.post(`/cooking/${t.id}/off`)).json).toMatchObject({ error: 'not_done', message: "Stove isn't done yet." });
    await finishedAgo(t.id, 0);
    const off = await bClient.post(`/cooking/${t.id}/off`);
    expect(off.json.find((x: any) => x.id === t.id)).toMatchObject({ state: 'free', minutes: 10 });
    expect((await firesOf(t.id))[0]).toMatchObject({ state: 'closed', close_reason: 'done', closed_by: B });
    const again = await o.post(`/cooking/${t.id}/start`);
    expect(again.json.find((x: any) => x.id === t.id)).toMatchObject({ state: 'running' });
    expect(await openFire(t.id)).toBeTruthy();
    await o.post(`/cooking/${t.id}/stop`);
    expect((await firesOf(t.id)).map((f) => f.close_reason)).toEqual(['done', 'removed']);
    expect((await o.post(`/cooking/${t.id}/stop`)).status).toBe(409);
  });

  it('CK6 Edit minutes on a running timer moves its fire; bad input is 400', async () => {
    const t = await create({ kind: 'microwave', minutes: 12 });
    const r = await o.patch(`/cooking/${t.id}`, { minutes: 20, name: 'Popcorn' });
    const e = r.json.find((x: any) => x.id === t.id);
    expect(e).toMatchObject({ label: 'Popcorn', minutes: 20 });
    expect(Date.parse(e.doneAt) - Date.parse(e.startedAt)).toBe(20 * 60_000);
    expect((await firesOf(t.id)).map((f) => [f.state, f.close_reason])).toEqual([['closed', 'superseded'], ['scheduled', null]]);
    expect((await o.patch(`/cooking/${t.id}`, { minutes: 0 })).status).toBe(400);
    expect((await o.post('/cooking', { kind: 'grill', minutes: 5 })).status).toBe(400);
  });

  it('CK7 ✕ closes it: its fire removed, gone from the list, 404 after', async () => {
    const t = await create({ kind: 'other', minutes: 5 });
    const r = await o.post(`/cooking/${t.id}/close`);
    expect(r.json.find((x: any) => x.id === t.id)).toBeUndefined();
    expect((await firesOf(t.id))[0]).toMatchObject({ state: 'closed', close_reason: 'removed' });
    expect((await o.post(`/cooking/${t.id}/start`)).status).toBe(404);
    expect((await o.patch(`/cooking/${t.id}`, { minutes: 3 })).status).toBe(404);
    expect((await o.post('/cooking/washer/close')).status).toBe(404);
  });

  it('CK9 a tick after midnight closes yesterday\'s off timer, keeps a running one', async () => {
    const off = await create({ kind: 'oven', minutes: 40 });
    await o.post(`/cooking/${off.id}/stop`);
    const run = await create({ kind: 'stove', minutes: 40 });
    const yesterday = new Date(Date.now() - 36 * 3600_000).toISOString();
    await env.DB.prepare('UPDATE machines SET updated_at = ? WHERE id = ?').bind(yesterday, off.id).run();
    await tickAt(o, new Date().toISOString());
    const ids = (await o.get('/cooking')).json.map((x: any) => x.id);
    expect(ids).toContain(run.id);
    expect(ids).not.toContain(off.id);
    expect(await env.DB.prepare('SELECT closed_at FROM machines WHERE id = ?').bind(off.id).first<any>()).toMatchObject({ closed_at: expect.any(String) });
  });
});
