// M4l acceptance — the laundry loop (SPEC §7D.4 L1–L12): the pure rules, then the /machines
// routes through /dev/tick. Routes use the real clock, so a test "finishes" a machine by moving
// its done-at into the past; ticks then run at real-now-relative instants.
import { env } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Client, member, owner, tickAt } from './helpers';
import {
  MACHINE_MAX_ALERTS, MACHINE_MINUTES, MACHINE_RENOTIFY_MIN, clearMachine, doneMessage, doneNowMachine, finishMachine, machineAlertConfig, machineState,
  isStillLoaded, moveMachine, parseDoneNow, parseMove, parseStart, refusalText, remindMachine, startMachine, waitingLoad, type MachineRow,
} from '../src/shared/machines';
import { alertMessage, applyAction, newMachineFire, pushActions, stepFire, type FireRow } from '../src/shared/engine';
import { machineWrites } from '../src/worker/routes/machines';
import { addMinutes } from '../src/shared/time';

const T = '2026-10-05T12:00:00.000Z';
const row = (id: 'washer' | 'dryer', over: Partial<MachineRow> = {}): MachineRow =>
  ({ id, owner_id: null, minutes: null, started_at: null, done_at: null, started_by: null, updated_at: null, ...over });
const running = (id: 'washer' | 'dryer', owner: string, doneAt: string) =>
  row(id, { owner_id: owner, minutes: 45, started_at: addMinutes(doneAt, -45), done_at: doneAt, started_by: owner });
const fireOf = (machineId: string, dueAt: string): FireRow => ({ id: 'fire_1', ...newMachineFire(machineId, dueAt) });

describe('L1–L2 the pure rules (machines.ts)', () => {
  it('L1 machineState: free with no owner; running before done-at; done at and after it', () => {
    const r = running('washer', 'A', T);
    expect(machineState(row('washer'), T)).toBe('free');
    expect(machineState(r, addMinutes(T, -1))).toBe('running');
    expect(machineState(r, T)).toBe('done');
    expect(machineState(r, addMinutes(T, 90))).toBe('done');
  });

  it('L2 doneMessage: owner, no owner, a waiting load, a waiting load whose owner is not active', () => {
    expect(doneMessage('washer', 'Sam')).toBe('Sam, your laundry in the washer is done');
    expect(doneMessage('dryer', 'Sam')).toBe('Sam, your laundry in the dryer is done');
    expect(doneMessage('washer', null)).toBe('The laundry in the washer is done');
    expect(doneMessage('dryer', 'Sam', 'Kai')).toBe("Sam, your laundry in the dryer is done — Kai's load is waiting");
    expect(doneMessage('dryer', 'Sam', null)).toBe('Sam, your laundry in the dryer is done — another load is waiting');
    // The engine adds only the alert number to a machine's sentence — never "Chore: …".
    expect(alertMessage('machine', doneMessage('washer', 'Sam'), 1)).toBe('Sam, your laundry in the washer is done');
    expect(alertMessage('machine', doneMessage('washer', 'Sam'), 3)).toBe('Sam, your laundry in the washer is done (alert 3)');
  });

  it('waitingLoad: only a DONE load in the machine before counts', () => {
    const rows = [running('washer', 'K', T), running('dryer', 'S', addMinutes(T, 30))];
    expect(waitingLoad(rows, 'dryer', addMinutes(T, -1))).toBeNull();
    expect(waitingLoad(rows, 'dryer', T)?.owner_id).toBe('K');
    expect(waitingLoad(rows, 'washer', T)).toBeNull();
  });

  it('start: a free machine gets the owner and a fire due at done-at; a busy one is refused', () => {
    const r = startMachine(row('washer'), 'A', 45, 'B', T);
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.rows[0]).toMatchObject({ owner_id: 'A', minutes: 45, started_at: T, done_at: addMinutes(T, 45), started_by: 'B', updated_at: T });
    expect(r.newFire).toMatchObject({ kind: 'machine', machine_id: 'washer', due_at: addMinutes(T, 45), state: 'scheduled', event_id: null, timer_id: null, chore_run_id: null, thing_id: null });
    expect(startMachine(running('washer', 'A', T), 'B', 30, 'B', addMinutes(T, -5))).toMatchObject({ error: 'busy' });
  });

  it('move: washer free + its fire closed done; dryer runs for the same owner; refusals', () => {
    const w = running('washer', 'A', T), d = row('dryer'), open = fireOf('washer', T);
    const now = addMinutes(T, 10);
    const r = moveMachine(w, d, open, 60, 'B', now);
    if ('error' in r) throw new Error(r.error);
    expect(r.rows[0]).toMatchObject({ id: 'washer', owner_id: null, started_at: null, done_at: null });
    expect(r.rows[1]).toMatchObject({ id: 'dryer', owner_id: 'A', minutes: 60, started_by: 'B', done_at: addMinutes(now, 60) });
    expect(r.closeFire).toMatchObject({ state: 'closed', close_reason: 'done', closed_by: 'B', closed_at: now });
    expect(r.newFire).toMatchObject({ machine_id: 'dryer', due_at: addMinutes(now, 60) });
    expect(moveMachine(w, d, open, 60, 'B', addMinutes(T, -1))).toMatchObject({ error: 'not_done' });
    expect(moveMachine(w, running('dryer', 'S', addMinutes(T, 30)), open, 60, 'B', now)).toMatchObject({ error: 'busy', machine: { id: 'dryer' } });
    expect(moveMachine(running('dryer', 'A', T), null, null, 60, 'B', now)).toMatchObject({ error: 'invalid_state', why: 'no_next' });
  });

  it('finish and clear', () => {
    const now = addMinutes(T, 5);
    const f = finishMachine(running('dryer', 'A', T), fireOf('dryer', T), 'B', now);
    expect(f).toMatchObject({ rows: [{ id: 'dryer', owner_id: null }], closeFire: { close_reason: 'done', closed_by: 'B' } });
    expect(finishMachine(running('washer', 'A', T), null, 'B', now)).toMatchObject({ error: 'invalid_state', why: 'not_last' });
    expect(finishMachine(running('dryer', 'A', T), null, 'B', addMinutes(T, -5))).toMatchObject({ error: 'not_done' });
    const c = clearMachine(running('washer', 'A', T), fireOf('washer', T), 'B', addMinutes(T, -20));
    expect(c).toMatchObject({ rows: [{ id: 'washer', owner_id: null }], closeFire: { close_reason: 'removed', closed_by: 'B' } });
    expect(clearMachine(row('dryer'), null, 'B', now)).toMatchObject({ error: 'already_free' });
  });

  it('L14 Still loaded: a done load restarts its reminders now; the message says what the load needs next', () => {
    const w = running('washer', 'A', T), now = addMinutes(T, 70);
    const r = remindMachine(w, { ...fireOf('washer', T), state: 'ringing' }, 'B', now);
    if ('error' in r) throw new Error(r.error);
    expect(r.rows).toEqual([{ ...w, updated_at: now }]);
    expect(r.closeFire).toMatchObject({ state: 'closed', close_reason: 'superseded', closed_by: 'B', closed_at: now });
    expect(r.newFire).toMatchObject({ kind: 'machine', machine_id: 'washer', due_at: now, state: 'scheduled' });
    expect(remindMachine(w, null, 'B', addMinutes(T, -1))).toMatchObject({ error: 'not_done' });
    expect(remindMachine(row('dryer'), null, 'B', now)).toMatchObject({ error: 'not_done' });
    expect(isStillLoaded(w, T)).toBe(false);
    expect(isStillLoaded(w, now)).toBe(true);
    expect(doneMessage('washer', 'Sam', undefined, true)).toBe('Sam, your laundry is still in the washer — move it to the dryer');
    expect(doneMessage('dryer', 'Sam', undefined, true)).toBe('Sam, your laundry is still in the dryer — take it out');
    expect(doneMessage('washer', null, undefined, true)).toBe('The laundry is still in the washer — move it to the dryer');
    expect(doneMessage('dryer', 'Sam', 'Kai', true)).toBe("Sam, your laundry is still in the dryer — take it out — Kai's load is waiting");
  });

  it('L16 Done now: a free machine gets the load, done now; a running one finishes early; a done one is refused', () => {
    const now = addMinutes(T, -20);
    const f = doneNowMachine(row('washer'), 'A', null, 'B', now);
    if ('error' in f) throw new Error(f.error);
    expect(f.rows[0]).toMatchObject({ owner_id: 'A', minutes: null, started_at: now, done_at: now, started_by: 'B', updated_at: now });
    expect(machineState(f.rows[0], now)).toBe('done');
    expect(f.closeFire).toBeUndefined();
    expect(f.newFire).toMatchObject({ machine_id: 'washer', due_at: now, state: 'scheduled' });
    const r = doneNowMachine(running('dryer', 'K', T), null, fireOf('dryer', T), 'B', now);
    if ('error' in r) throw new Error(r.error);
    expect(r.rows[0]).toMatchObject({ owner_id: 'K', minutes: 45, done_at: now, updated_at: now });
    expect(r.closeFire).toMatchObject({ close_reason: 'superseded', closed_by: 'B' });
    expect(r.newFire).toMatchObject({ machine_id: 'dryer', due_at: now });
    expect(doneNowMachine(running('dryer', 'K', T), null, null, 'B', T)).toMatchObject({ error: 'busy' });
    expect(parseDoneNow({}, ['A'], true)).toBe('Whose load must be an active member.');
    expect(parseDoneNow({ ownerId: 'A' }, ['A'], true)).toEqual({ ownerId: 'A' });
    expect(parseDoneNow({}, ['A'], false)).toEqual({ ownerId: null });
  });

  it('refusal texts and input rules', () => {
    const names = new Map([['S', 'Sam']]);
    expect(refusalText({ error: 'busy', machine: running('dryer', 'S', T) }, names)).toBe("The dryer still has Sam's load.");
    expect(refusalText({ error: 'busy', machine: running('dryer', 'gone', T) }, names)).toBe('The dryer still has a load.');
    expect(refusalText({ error: 'not_done', machine: running('washer', 'S', T) }, names)).toBe("The washer isn't done yet.");
    expect(refusalText({ error: 'already_free', machine: row('washer') }, names)).toBe('The washer is already free.');
    expect(parseStart({ ownerId: 'S', minutes: 45 }, ['S'])).toEqual({ ownerId: 'S', minutes: 45 });
    expect(parseStart({ ownerId: 'X', minutes: 45 }, ['S'])).toMatch(/active member/);
    expect(parseStart({ ownerId: 'S', minutes: 20 }, ['S'])).toMatch(/30, 45, 60, 90/);
    expect(parseMove({ minutes: '60' })).toMatch(/Minutes/);
    expect(MACHINE_MINUTES).toEqual([30, 45, 60, 90]);
  });

  it('engine: a machine fire is never missed, renotifies every 15 min up to 4, takes no fire action, has no push buttons', () => {
    const cfg = machineAlertConfig();
    expect(cfg).toEqual({ channels: ['push', 'house'], renotifyMin: MACHINE_RENOTIFY_MIN, maxAlerts: MACHINE_MAX_ALERTS });
    let { fire, alert } = stepFire(fireOf('washer', T), cfg, addMinutes(T, 180)); // long overdue (an outage)
    expect(fire).toMatchObject({ state: 'ringing', alert_count: 1 });
    expect(alert).toBe(true);
    for (let n = 2; n <= 4; n++) ({ fire } = stepFire(fire, cfg, addMinutes(T, 180 + 15 * (n - 1))));
    expect(fire.alert_count).toBe(4);
    expect(stepFire(fire, cfg, addMinutes(T, 300)).alert).toBe(false);
    for (const a of ['done', 'snooze', 'ack'] as const) expect(applyAction(fire, a, cfg, 'A', T)).toEqual({ error: 'invalid_action' });
    expect(pushActions('machine')).toEqual([]);
  });
});

// ---- Routes ---------------------------------------------------------------------------------

let o: Client, A: string, A_NAME: string, B: string, B_NAME: string, bClient: Client;

beforeAll(async () => {
  o = await owner();
  const me = (await o.get('/me')).json;
  A = me.id; A_NAME = me.displayName ?? me.display_name;
  const m = await member(o);
  B = m.id; bClient = m.client;
  B_NAME = (await o.get('/members')).json.find((x: any) => x.id === B).displayName;
});

/** Every test starts with both machines free and no open machine fire. */
beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare(`UPDATE machines SET owner_id = NULL, minutes = NULL, started_at = NULL, done_at = NULL, started_by = NULL`),
    env.DB.prepare(`UPDATE fires SET state = 'closed', close_reason = 'removed', closed_at = ? WHERE kind = 'machine' AND state != 'closed'`).bind(T),
  ]);
});

const view = async (id: string) => (await o.get('/machines')).json.find((m: any) => m.id === id);
const firesOf = async (id: string) =>
  (await env.DB.prepare('SELECT * FROM fires WHERE machine_id = ? ORDER BY rowid').bind(id).all<any>()).results;
const openFire = async (id: string) => (await firesOf(id)).find((f) => f.state !== 'closed');
const deliveriesOf = async (fireId: string) =>
  (await env.DB.prepare('SELECT channel, member_id, message, alert_number FROM deliveries WHERE fire_id = ? ORDER BY alert_number, channel').bind(fireId).all<any>()).results;

/** Makes a running machine done `minsAgo` minutes ago (its row and its open fire). Returns the new done-at. */
async function finishedAgo(id: string, minsAgo: number): Promise<string> {
  const doneAt = new Date(Date.now() - minsAgo * 60_000).toISOString();
  await env.DB.batch([
    env.DB.prepare('UPDATE machines SET started_at = ?, done_at = ? WHERE id = ?').bind(addMinutes(doneAt, -45), doneAt, id),
    env.DB.prepare(`UPDATE fires SET due_at = ? WHERE machine_id = ? AND state != 'closed'`).bind(doneAt, id),
  ]);
  return doneAt;
}

describe('M4l /machines (L3–L12)', () => {
  it('GET /machines lists both machines free, in load order, with the server-derived state', async () => {
    const r = await o.get('/machines');
    expect(r.status).toBe(200);
    expect(r.json.map((m: any) => [m.id, m.label, m.state, m.next])).toEqual([['washer', 'Washer', 'free', 'dryer'], ['dryer', 'Dryer', 'free', null]]);
  });

  it('L3–L5 start the washer → a fire due at done-at; it rings for A by Phone + House, every 15 min, 4 times; then DONE — waiting', async () => {
    const r = await o.post('/machines/washer/start', { ownerId: A, minutes: 45 });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    const w = r.json.find((m: any) => m.id === 'washer');
    expect(w).toMatchObject({ state: 'running', ownerId: A, minutes: 45, startedBy: A });
    expect(Date.parse(w.doneAt) - Date.parse(w.startedAt)).toBe(45 * 60_000);
    const fire = await openFire('washer');
    expect(fire).toMatchObject({ kind: 'machine', state: 'scheduled', due_at: w.doneAt });

    const doneAt = await finishedAgo('washer', 0);
    await tickAt(o, doneAt);
    expect(await openFire('washer')).toMatchObject({ state: 'ringing', alert_count: 1 });
    const first = await deliveriesOf(fire.id);
    expect(first.filter((d) => d.channel === 'push').map((d) => d.member_id)).toEqual([A]);
    expect(first.filter((d) => d.channel === 'house')).toHaveLength(1);
    expect(first.every((d) => d.message === `${A_NAME}, your laundry in the washer is done`)).toBe(true);

    for (const n of [1, 2, 3]) await tickAt(o, addMinutes(doneAt, 15 * n));
    await tickAt(o, addMinutes(doneAt, 60)); // a 5th would be here
    const all = await deliveriesOf(fire.id);
    expect(all).toHaveLength(8);
    expect(Math.max(...all.map((d) => d.alert_number))).toBe(4);
    expect(all.find((d) => d.alert_number === 4 && d.channel === 'house').message).toBe(`${A_NAME}, your laundry in the washer is done (alert 4)`);
    expect(await view('washer')).toMatchObject({ state: 'done', ownerId: A });

    // §10: /fires carries the machine, its label and the owner; a fire action on it is refused.
    const ringing = (await bClient.get('/fires?state=ringing')).json.find((f: any) => f.id === fire.id);
    expect(ringing).toMatchObject({ kind: 'machine', machineId: 'washer', title: 'Washer', personId: A });
    const done = await o.post(`/fires/${fire.id}/actions`, { action: 'done' });
    expect(done.status).toBe(409);
    expect(done.json).toMatchObject({ error: 'invalid_action' });
    expect(done.json.message).toBeTruthy();
  });

  it('L6–L9 move to the dryer; a second load waits; the dryer names it; Fold & out ends the loop', async () => {
    await o.post('/machines/washer/start', { ownerId: A, minutes: 30 });
    await finishedAgo('washer', 5);
    const washerFire = await openFire('washer');

    // L6 — B taps Move: the washer frees, its fire closes done by B, the dryer runs A's load.
    const mv = await bClient.post('/machines/washer/move', { minutes: 60 });
    expect(mv.status, JSON.stringify(mv.json)).toBe(200);
    expect(mv.json.find((m: any) => m.id === 'washer')).toMatchObject({ state: 'free', ownerId: null });
    expect(mv.json.find((m: any) => m.id === 'dryer')).toMatchObject({ state: 'running', ownerId: A, minutes: 60, startedBy: B });
    expect((await firesOf('washer')).find((f) => f.id === washerFire.id)).toMatchObject({ state: 'closed', close_reason: 'done', closed_by: B });
    const dryerFire = await openFire('dryer');
    expect(dryerFire).toMatchObject({ kind: 'machine', state: 'scheduled' });

    // L7 — B's load finishes in the washer while A's is still in the dryer: Move is refused, nothing moves.
    expect((await bClient.post('/machines/washer/start', { ownerId: B, minutes: 30 })).status).toBe(200);
    await finishedAgo('washer', 1);
    const refused = await o.post('/machines/washer/move', { minutes: 45 });
    expect(refused.status).toBe(409);
    expect(refused.json).toEqual({ error: 'busy', message: `The dryer still has ${A_NAME}'s load.` });
    expect(await view('washer')).toMatchObject({ state: 'done', ownerId: B });
    expect(await view('dryer')).toMatchObject({ state: 'running', ownerId: A });

    // L8 — the dryer is done while B's load waits: its alert names the waiting load.
    const dryerDone = await finishedAgo('dryer', 0);
    await tickAt(o, dryerDone);
    const msgs = (await deliveriesOf(dryerFire.id)).map((d) => d.message);
    expect(msgs.length).toBeGreaterThan(0);
    expect(new Set(msgs)).toEqual(new Set([`${A_NAME}, your laundry in the dryer is done — ${B_NAME}'s load is waiting`]));

    // L9 — Fold & out on the done dryer.
    const fo = await o.post('/machines/dryer/finish');
    expect(fo.status, JSON.stringify(fo.json)).toBe(200);
    expect(fo.json.find((m: any) => m.id === 'dryer')).toMatchObject({ state: 'free', ownerId: null });
    expect((await firesOf('dryer')).find((f) => f.id === dryerFire.id)).toMatchObject({ state: 'closed', close_reason: 'done', closed_by: A });
    // Fold & out is for the dryer only.
    const wrong = await o.post('/machines/washer/finish');
    expect(wrong.status).toBe(409);
    expect(wrong.json).toMatchObject({ error: 'invalid_state' });
  });

  it('L10 Clear a running machine (a free dryer can Start too): its fire closes removed; nothing rings', async () => {
    const st = await o.post('/machines/dryer/start', { ownerId: B, minutes: 30 });
    expect(st.status).toBe(200);
    const fire = await openFire('dryer');
    const cl = await o.post('/machines/dryer/clear');
    expect(cl.status).toBe(200);
    expect(cl.json.find((m: any) => m.id === 'dryer')).toMatchObject({ state: 'free' });
    expect((await firesOf('dryer')).find((f) => f.id === fire.id)).toMatchObject({ state: 'closed', close_reason: 'removed', closed_by: A });
    await tickAt(o, addMinutes(new Date().toISOString(), 31));
    expect(await deliveriesOf(fire.id)).toEqual([]);
    const again = await o.post('/machines/dryer/clear');
    expect(again.status).toBe(409);
    expect(again.json).toEqual({ error: 'already_free', message: 'The dryer is already free.' });
  });

  it('L15 Still loaded on a done washer: the old fire closes superseded; a new one rings now, every 15 min, 4 times', async () => {
    await o.post('/machines/washer/start', { ownerId: A, minutes: 30 });
    await finishedAgo('washer', 70);
    const old = await openFire('washer');
    const notDone = await o.post('/machines/dryer/remind');
    expect(notDone.status).toBe(409);
    expect(notDone.json).toMatchObject({ error: 'not_done' });

    const r = await bClient.post('/machines/washer/remind');
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.json.find((m: any) => m.id === 'washer')).toMatchObject({ state: 'done', ownerId: A });
    expect((await firesOf('washer')).find((f) => f.id === old.id)).toMatchObject({ state: 'closed', close_reason: 'superseded', closed_by: B });
    const fresh = await openFire('washer');
    expect(fresh).toMatchObject({ kind: 'machine', state: 'scheduled' });

    for (const n of [0, 1, 2, 3, 4]) await tickAt(o, addMinutes(fresh.due_at, 15 * n));
    const sent = await deliveriesOf(fresh.id);
    expect(sent).toHaveLength(8); // 4 alerts × (A's phone + the house)
    expect(sent.find((d) => d.alert_number === 1 && d.channel === 'house').message)
      .toBe(`${A_NAME}, your laundry is still in the washer — move it to the dryer`);
    expect(sent.find((d) => d.alert_number === 4 && d.channel === 'push').message)
      .toBe(`${A_NAME}, your laundry is still in the washer — move it to the dryer (alert 4)`);
  });

  it('L17 Done now on a washer the app thought was free: done now for A, its alert rings at once', async () => {
    expect((await o.post('/machines/washer/done', {})).status).toBe(400);
    const r = await bClient.post('/machines/washer/done', { ownerId: A });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.json.find((m: any) => m.id === 'washer')).toMatchObject({ state: 'done', ownerId: A, minutes: null, startedBy: B });
    const fire = await openFire('washer');
    await tickAt(o, fire.due_at);
    const sent = await deliveriesOf(fire.id);
    expect(sent.filter((d) => d.channel === 'push').map((d) => d.member_id)).toEqual([A]);
    expect(sent.find((d) => d.channel === 'house').message).toBe(`${A_NAME}, your laundry in the washer is done`);
    expect((await o.post('/machines/washer/done', {})).json).toMatchObject({ error: 'busy' });
    // The dryer, running, finishes early: its old fire is replaced by one due now.
    await o.post('/machines/dryer/start', { ownerId: B, minutes: 60 });
    const old = await openFire('dryer');
    const early = await o.post('/machines/dryer/done');
    expect(early.json.find((m: any) => m.id === 'dryer')).toMatchObject({ state: 'done', ownerId: B, minutes: 60 });
    expect((await firesOf('dryer')).find((f) => f.id === old.id)).toMatchObject({ state: 'closed', close_reason: 'superseded' });
  });

  it('L11 two Start taps at once: one wins, the other is a 409, one open fire', async () => {
    const [r1, r2] = await Promise.all([
      o.post('/machines/washer/start', { ownerId: A, minutes: 30 }),
      bClient.post('/machines/washer/start', { ownerId: B, minutes: 60 }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    expect((r1.status === 409 ? r1 : r2).json.message).toBeTruthy();
    expect((await firesOf('washer')).filter((f) => f.state !== 'closed')).toHaveLength(1);
  });

  it('L11 a write read from a stale row is refused whole: nothing changes, no fire is closed or added', async () => {
    await o.post('/machines/washer/start', { ownerId: A, minutes: 30 });
    const fresh = (await env.DB.prepare('SELECT * FROM machines').all<MachineRow>()).results;
    const stale = fresh.map((r) => r.id === 'washer' ? { ...r, started_at: '2026-01-01T00:00:00.000Z' } : r);
    const open = await openFire('washer');
    const change = clearMachine(fresh.find((r) => r.id === 'washer')!, open, B, new Date().toISOString());
    if ('error' in change) throw new Error(change.error);
    await expect(env.DB.batch(machineWrites(env.DB, stale, change))).rejects.toThrow(/UNIQUE|constraint/i);
    expect(await view('washer')).toMatchObject({ state: 'running', ownerId: A });
    expect(await openFire('washer')).toMatchObject({ id: open.id, state: 'scheduled' });

    // A move whose SECOND row is stale: the washer's write, already run in the batch, rolls back too.
    await finishedAgo('washer', 1);
    const rows = (await env.DB.prepare('SELECT * FROM machines').all<MachineRow>()).results;
    const w = rows.find((r) => r.id === 'washer')!, d = rows.find((r) => r.id === 'dryer')!;
    const move = moveMachine(w, d, await openFire('washer'), 60, B, new Date().toISOString());
    if ('error' in move) throw new Error(move.error);
    const staleDryer = rows.map((r) => r.id === 'dryer' ? { ...r, started_at: '2026-01-01T00:00:00.000Z' } : r);
    await expect(env.DB.batch(machineWrites(env.DB, staleDryer, move))).rejects.toThrow(/UNIQUE|constraint/i);
    expect(await view('washer')).toMatchObject({ state: 'done', ownerId: A });
    expect(await view('dryer')).toMatchObject({ state: 'free' });
    expect(await openFire('washer')).toMatchObject({ id: open.id });
    expect(await openFire('dryer')).toBeUndefined();
  });

  it('L12 bad input: minutes, owner, machine — each with a message', async () => {
    const bad = [
      [await o.post('/machines/washer/start', { ownerId: A, minutes: 20 }), 400, 'invalid_input'],
      [await o.post('/machines/washer/start', { ownerId: 'mem_nobody', minutes: 30 }), 400, 'invalid_input'],
      [await o.post('/machines/dishwasher/start', { ownerId: A, minutes: 30 }), 404, 'not_found'],
      [await o.post('/machines/washer/move', { minutes: 60 }), 409, 'not_done'],
      [await o.post('/machines/dryer/move', { minutes: 60 }), 409, 'invalid_state'],
    ] as const;
    for (const [r, status, error] of bad) {
      expect(r.status, JSON.stringify(r.json)).toBe(status);
      expect(r.json.error).toBe(error);
      expect(r.json.message).toBeTruthy();
    }
    expect((await new Client().get('/machines')).status).toBe(401);
  });

  it('a disabled owner counts as nobody: everyone is pushed, the message names no one', async () => {
    const m = await member(o);
    await o.post('/machines/washer/start', { ownerId: m.id, minutes: 30 });
    await o.patch(`/members/${m.id}`, { disabled: true });
    const doneAt = await finishedAgo('washer', 0);
    const fire = await openFire('washer');
    await tickAt(o, doneAt);
    const d = await deliveriesOf(fire.id);
    expect(d.filter((x) => x.channel === 'push').map((x) => x.member_id).sort()).toEqual([A, B].sort());
    expect(d.find((x) => x.channel === 'house').message).toBe('The laundry in the washer is done');
  });
});
