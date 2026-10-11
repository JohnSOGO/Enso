// AL1–AL6 (SPEC §7D.7) — Alert when done: a machine load with nobody to alert rings phones only, never
// the house; with someone it rings as before. Routes use the real clock, as in machines.test.ts.
import { env } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { member, owner, tickAt, type Client } from './helpers';
import { MACHINE_CHANNELS, machineAlert, parseDoneNow, parseStart } from '../src/shared/machines';
import { addMinutes } from '../src/shared/time';

const Q = '2026-10-11T17:30:00.000Z';

describe('AL1–AL2 the pure rules', () => {
  it('AL1 machineAlert: someone → Phone + House on every speaker; nobody → Phone only', () => {
    expect(machineAlert(null, 'mem_a')).toMatchObject({ allSpeakers: true, cfg: { channels: [...MACHINE_CHANNELS] } });
    const none = machineAlert(Q, null);
    expect(none).toMatchObject({ allSpeakers: false, cfg: { channels: ['push'], quietUntil: Q } });
  });

  it('AL2 parseStart / parseDoneNow: absent → the owner, null → nobody, a member, a stranger refused', () => {
    const ids = ['a', 'b'];
    expect(parseStart({ ownerId: 'a', minutes: 60 }, 'washer', ids)).toEqual({ ownerId: 'a', minutes: 60, alertId: 'a' });
    expect(parseStart({ ownerId: 'a', minutes: 60, alertId: null }, 'washer', ids)).toEqual({ ownerId: 'a', minutes: 60, alertId: null });
    expect(parseStart({ ownerId: 'a', minutes: 60, alertId: 'b' }, 'washer', ids)).toEqual({ ownerId: 'a', minutes: 60, alertId: 'b' });
    expect(parseStart({ ownerId: 'a', minutes: 60, alertId: 'x' }, 'washer', ids)).toBe('Alert when done must be an active member or nobody.');
    expect(parseDoneNow({}, ids, true)).toEqual({ ownerId: null, alertId: null });
    expect(parseDoneNow({ ownerId: 'a' }, ids, true)).toEqual({ ownerId: 'a', alertId: 'a' });
    expect(parseDoneNow({ ownerId: 'a', alertId: null }, ids, true)).toEqual({ ownerId: 'a', alertId: null });
    expect(parseDoneNow({ alertId: 'b' }, ids, true)).toEqual({ ownerId: null, alertId: 'b' });
    expect(parseDoneNow({ alertId: 'x' }, ids, true)).toBe('Alert when done must be an active member or nobody.');
    expect(parseDoneNow({ ownerId: 'x', alertId: 'x' }, ids, false)).toEqual({ ownerId: null, alertId: null }); // running: ignored
  });
});

let o: Client, A: string, B: string;

beforeAll(async () => {
  o = await owner();
  A = (await o.get('/me')).json.id;
  B = (await member(o)).id;
  expect((await o.patch('/machines/hours', { weekday: null, weekend: null })).status).toBe(200); // ring at any hour
});

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare(`UPDATE machines SET owner_id = NULL, alert_id = NULL, minutes = NULL, started_at = NULL, done_at = NULL, started_by = NULL`),
    env.DB.prepare(`UPDATE fires SET state = 'closed', close_reason = 'removed', closed_at = ? WHERE kind = 'machine' AND state != 'closed'`).bind(Q),
  ]);
});

const view = async (id: string) => (await o.get('/machines')).json.find((m: any) => m.id === id);
const openFire = async (id: string) =>
  (await env.DB.prepare(`SELECT * FROM fires WHERE machine_id = ? AND state != 'closed'`).bind(id).first<any>())!;
const sent = async (fireId: string) =>
  (await env.DB.prepare('SELECT channel, member_id, message, alert_number FROM deliveries WHERE fire_id = ? ORDER BY alert_number, channel').bind(fireId).all<any>()).results;
/** Makes a running machine done now (its row and its open fire). Returns the done-at. */
async function doneNow(id: string): Promise<string> {
  const doneAt = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('UPDATE machines SET started_at = ?, done_at = ? WHERE id = ?').bind(addMinutes(doneAt, -60), doneAt, id),
    env.DB.prepare(`UPDATE fires SET due_at = ? WHERE machine_id = ? AND state != 'closed'`).bind(doneAt, id),
  ]);
  return doneAt;
}
const phones = (d: any[], n: number) => d.filter((x) => x.alert_number === n && x.channel === 'push').map((x) => x.member_id).sort();
const houses = (d: any[]) => d.filter((x) => x.channel === 'house');

describe('AL3–AL6 /machines and tick', () => {
  it('AL3 the dish washer started for A alerting nobody: every phone, no speaker, on every alert', async () => {
    const r = await o.post('/machines/dishwasher/start', { ownerId: A, minutes: 120, alertId: null });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.json.find((m: any) => m.id === 'dishwasher')).toMatchObject({ ownerId: A, alertId: null });
    const fire = await openFire('dishwasher');
    const at = await doneNow('dishwasher');
    for (const n of [0, 1, 2]) await tickAt(o, addMinutes(at, 15 * n));
    const d = await sent(fire.id);
    expect(phones(d, 1)).toEqual([A, B].sort());
    expect(phones(d, 3)).toEqual([A, B].sort());
    expect(houses(d)).toEqual([]);
  });

  it('AL4 Done now naming nobody alerts nobody: Owner unknown on the phones, never the house', async () => {
    const r = await o.post('/machines/washer/done', {});
    expect(r.json.find((m: any) => m.id === 'washer')).toMatchObject({ ownerId: null, alertId: null });
    const fire = await openFire('washer');
    const now = new Date().toISOString();
    for (const n of [0, 1]) await tickAt(o, addMinutes(now, 15 * n));
    const d = await sent(fire.id);
    expect(phones(d, 2)).toEqual([A, B].sort());
    expect(d[0].message).toBe('Clothes washer finished; Owner unknown; Please cycle to dryer');
    expect(houses(d)).toEqual([]);
  });

  it('AL5 A\'s load alerting B moves to the dryer still alerting B; the house speaks from alert 2 as before', async () => {
    expect((await o.post('/machines/washer/start', { ownerId: A, minutes: 60, alertId: B })).status).toBe(200);
    expect(await view('washer')).toMatchObject({ ownerId: A, alertId: B });
    await doneNow('washer');
    const mv = await o.post('/machines/washer/move', { minutes: 60 });
    expect(mv.json.find((m: any) => m.id === 'dryer')).toMatchObject({ ownerId: A, alertId: B });
    expect(mv.json.find((m: any) => m.id === 'washer')).toMatchObject({ state: 'free', alertId: null });
    const fire = await openFire('dryer');
    const at = await doneNow('dryer');
    for (const n of [0, 1]) await tickAt(o, addMinutes(at, 15 * n));
    const d = await sent(fire.id);
    expect(houses(d).map((x) => x.alert_number)).toEqual([2]); // §9.2d phone first
  });

  it('AL5 an older app sending no alertId alerts the owner; Still loaded keeps who is alerted', async () => {
    await o.post('/machines/washer/start', { ownerId: A, minutes: 60 });
    expect(await view('washer')).toMatchObject({ alertId: A });
    await doneNow('washer');
    await o.post('/machines/washer/remind');
    expect(await view('washer')).toMatchObject({ alertId: A });
  });

  it('AL6 an alert person disabled before the load is done counts as nobody: phones only', async () => {
    const c = await member(o);
    await o.post('/machines/washer/start', { ownerId: A, minutes: 30, alertId: c.id });
    await o.patch(`/members/${c.id}`, { disabled: true });
    const fire = await openFire('washer');
    const at = await doneNow('washer');
    for (const n of [0, 1]) await tickAt(o, addMinutes(at, 15 * n));
    const d = await sent(fire.id);
    expect(phones(d, 2)).toEqual([A, B].sort());
    expect(houses(d)).toEqual([]);
  });
});
