// M4ab acceptance (SPEC §7B.8) — bounties through the real Worker: posting (admins only) and its push, I'll do it /
// Let it go / Done, the waiting push to admins, OK / Not yet, chore bounties paid on a run's last step and dropped
// on undo (both Done paths), the score, and the founder-ping predicate leaving bounty pushes out. Push goes nowhere
// (no subscriptions): each push is still a delivery row.
import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { Client, member, owner } from './helpers';
import { NEW_BOUNTY_TITLE, TAKE_HOURS, WAITING_TITLE } from '../src/shared/bounties';
import { addMinutes } from '../src/shared/time';
import { opsPingsAfter, opsPingsSince } from '../src/worker/deliveries';

let a: Client, b: Client, cc: Client, d: Client, A: string, B: string, C: string, D: string;
beforeAll(async () => {
  a = await owner();
  A = (await a.get('/me')).json.id;
  ({ client: b, id: B } = await member(a));
  ({ client: cc, id: C } = await member(a));
  ({ client: d, id: D } = await member(a));
  expect((await a.patch(`/members/${D}`, { role: 'owner' })).status).toBe(200); // a second admin
});

const post = async (title = 'Clean the toilet', points = 3) => {
  const r = await a.post('/bounties', { title, points });
  expect(r.status, JSON.stringify(r.json)).toBe(201);
  return r.json;
};
const pushes = async (col: 'bounty_id' | 'earning_id', id: string) => (await env.DB.prepare(
  `SELECT member_id, channel, title FROM deliveries WHERE ${col} = ? ORDER BY member_id`).bind(id).all<{ member_id: string; channel: string; title: string }>()).results;
const list = async (c: Client = a) => (await c.get('/bounties')).json;
const waitingFor = async (title: string) => (await list()).waiting.filter((e: any) => e.title === title);
const score = async (id: string) => (await list()).scores.find((s: any) => s.memberId === id);
const sorted = (xs: string[]) => [...xs].sort();

describe('M4ab bounties', () => {
  it('BT1 an admin posts; everyone else gets one push, never house', async () => {
    const r = await a.post('/bounties', { title: ' Clean the toilet ', note: ' downstairs ', points: 3 });
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ title: 'Clean the toilet', note: 'downstairs', points: 3, status: 'open', createdBy: A, takenBy: null });
    const sent = await pushes('bounty_id', r.json.id);
    expect(sent.map((p) => p.member_id)).toEqual(sorted([B, C, D]));
    expect(sent.every((p) => p.channel === 'push' && p.title === NEW_BOUNTY_TITLE)).toBe(true);
  });

  it('BT2 a member can neither post nor set a chore bounty', async () => {
    expect((await b.post('/bounties', { title: 'Mine', points: 10 })).status).toBe(403);
    const chore = (await a.post('/chores', { title: 'Trash', days: ['MO'], timing: 'by', time: '19:00', people: [A], steps: [{ title: 'Trash' }] })).json.id;
    expect((await b.put(`/chores/${chore}/bounty`, { points: 2 })).status).toBe(403);
  });

  it('BT3 bad input is refused naming the field', async () => {
    for (const [body, field] of [[{ title: '', points: 1 }, 'title'], [{ title: 'x'.repeat(61), points: 1 }, 'title'],
      [{ title: 'x', points: 0 }, 'points'], [{ title: 'x', points: 11 }, 'points'], [{ title: 'x', points: 2.5 }, 'points'],
      [{ title: 'x', points: '3' }, 'points'], [{ title: 'x', points: 1, note: 'n'.repeat(121) }, 'note']] as const) {
      const r = await a.post('/bounties', body);
      expect(r.status).toBe(400);
      expect(r.json.message).toMatch(field);
    }
  });

  it('BT4–BT5 a dib keeps others off; one dib at a time', async () => {
    const x = await post('Empty the bathroom bin', 1);
    expect((await b.post(`/bounties/${x.id}/take`)).json).toMatchObject({ status: 'taken', takenBy: B });
    const no = await cc.post(`/bounties/${x.id}/take`);
    expect(no.status).toBe(409);
    expect(no.json).toMatchObject({ error: 'bounty_state', message: expect.stringMatching(/is on it\.$/) });
    expect((await cc.post(`/bounties/${x.id}/done`)).status).toBe(409);
    const y = await post('Wipe the mirror', 1);
    expect((await b.post(`/bounties/${y.id}/take`)).json.message).toBe("You're already on Empty the bathroom bin. Finish it or let it go first.");
    expect((await b.post(`/bounties/${x.id}/let-go`)).json).toMatchObject({ status: 'open', takenBy: null });
    expect((await cc.post(`/bounties/${x.id}/let-go`)).status).toBe(409);
  });

  it('BT6 a dib lapses after the hours', async () => {
    const x = await post('Sweep the porch', 1);
    await b.post(`/bounties/${x.id}/take`);
    await env.DB.prepare('UPDATE bounties SET taken_at = ? WHERE id = ?').bind(addMinutes(new Date().toISOString(), -TAKE_HOURS * 60), x.id).run();
    expect((await cc.post(`/bounties/${x.id}/take`)).json).toMatchObject({ status: 'taken', takenBy: C });
    await cc.post(`/bounties/${x.id}/let-go`);
  });

  it('BT7–BT8 Done waits for an admin; OK pays it', async () => {
    const x = await post('Clean the downstairs toilet', 3);
    await b.post(`/bounties/${x.id}/take`);
    expect((await b.post(`/bounties/${x.id}/done`)).json).toMatchObject({ status: 'pending', doneBy: B });
    const [w] = await waitingFor('Clean the downstairs toilet');
    expect(w).toMatchObject({ kind: 'bounty', points: 3, memberId: B });
    const sent = await pushes('earning_id', w.id);
    expect(sent.map((p) => p.member_id)).toEqual(sorted([A, D]));
    expect(sent.every((p) => p.channel === 'push' && p.title === WAITING_TITLE)).toBe(true);
    expect((await b.post(`/earnings/${w.id}/ok`)).status).toBe(403);
    const before = (await score(B)).week;
    expect((await a.post(`/earnings/${w.id}/ok`)).status).toBe(204);
    expect((await list()).bounties.some((y: any) => y.id === x.id)).toBe(false);
    expect((await score(B)).week).toBe(before + 3);
    expect((await score(B)).month).toBeGreaterThanOrEqual(3);
    expect((await a.post(`/earnings/${w.id}/ok`)).status).toBe(409);
    expect((await a.del(`/bounties/${x.id}`)).status).toBe(409); // BT15 paid
  });

  it('BT9 Not yet hands it back to the doer as a fresh dib', async () => {
    const x = await post('Kitchen trash', 1);
    await cc.post(`/bounties/${x.id}/done`);
    const [w] = await waitingFor('Kitchen trash');
    expect((await a.post(`/earnings/${w.id}/not-yet`)).status).toBe(204);
    expect((await list()).bounties.find((y: any) => y.id === x.id)).toMatchObject({ status: 'taken', takenBy: C, doneBy: null });
    expect(await waitingFor('Kitchen trash')).toEqual([]);
    await cc.post(`/bounties/${x.id}/let-go`);
  });

  it('BT10 an admin can OK it as someone else\'s', async () => {
    const x = await post('Can back in', 2);
    await b.post(`/bounties/${x.id}/done`);
    const [w] = await waitingFor('Can back in');
    const [bw, cw] = [(await score(B)).week, (await score(C)).week];
    expect((await a.post(`/earnings/${w.id}/ok`, { memberId: 'nobody' })).status).toBe(400);
    expect((await a.post(`/earnings/${w.id}/ok`, { memberId: C })).status).toBe(204);
    expect([(await score(B)).week, (await score(C)).week]).toEqual([bw, cw + 2]);
  });

  it('BT11–BT13, BT17 a chore bounty pays whoever finishes; undo drops it; an admin is OK\'d at once', async () => {
    const chore = (await a.post('/chores', { title: 'Trash to the curb', days: ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'], timing: 'by',
      time: '23:59', people: [A], steps: [{ title: 'Bag it' }, { title: 'To the curb' }] })).json.id;
    expect((await a.put(`/chores/${chore}/bounty`, { points: 11 })).status).toBe(400);
    expect((await a.put(`/chores/${chore}/bounty`, { points: 2 })).json).toEqual({ choreId: chore, bounty: 2 });
    expect((await a.get('/chores')).json.find((x: any) => x.id === chore).bounty).toBe(2);
    const run = (await a.get('/chores/today')).json.runs.find((r: any) => r.choreId === chore);
    expect(run.bounty).toBe(2);
    await cc.post(`/chore-runs/${run.id}/done`);
    expect((await b.post(`/chore-runs/${run.id}/done`)).json).toMatchObject({ doneBy: B, bounty: 2 });
    const [w] = await waitingFor('Trash to the curb');
    expect(w).toMatchObject({ kind: 'chore', points: 2, memberId: B });
    expect((await pushes('earning_id', w.id)).map((p) => p.member_id)).toEqual(sorted([A, D]));
    await a.put(`/chores/${chore}/bounty`, { points: 5 });
    expect((await waitingFor('Trash to the curb'))[0].points).toBe(2);
    // BT12 undo drops it; finishing again earns anew
    await b.post(`/chore-runs/${run.id}/undo`);
    expect(await waitingFor('Trash to the curb')).toEqual([]);
    await b.post(`/chore-runs/${run.id}/done`);
    const [again] = await waitingFor('Trash to the curb');
    expect(again).toMatchObject({ points: 5, memberId: B });
    expect(again.id).not.toBe(w.id);
    // BT13 an admin's own finish
    await b.post(`/chore-runs/${run.id}/undo`);
    const before = (await score(A)).week;
    await a.post(`/chore-runs/${run.id}/done`);
    expect(await waitingFor('Trash to the curb')).toEqual([]);
    expect((await score(A)).week).toBe(before + 5);
    const x = await post('Admin job', 4);
    expect((await d.post(`/bounties/${x.id}/done`)).json).toMatchObject({ status: 'paid', doneBy: D });
    await a.put(`/chores/${chore}/bounty`, { points: null });
    expect((await a.get('/chores')).json.find((y: any) => y.id === chore).bounty).toBeNull();
  });

  it('BT11 a chore fire\'s Done pays too', async () => {
    const chore = (await a.post('/chores', { title: 'Bins in', days: ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'], timing: 'by',
      time: '23:59', nudge: true, channels: ['push'], people: [C], steps: [{ title: 'Bins in' }] })).json.id;
    await a.put(`/chores/${chore}/bounty`, { points: 1 });
    const run = (await a.get('/chores/today')).json.runs.find((r: any) => r.choreId === chore);
    const fire = await env.DB.prepare(`SELECT id FROM fires WHERE chore_run_id = ? AND state != 'closed'`).bind(run.id).first<{ id: string }>();
    if (!fire) return; // past 23:59 local: no fire was planned; the /done path above covers it
    await env.DB.prepare(`UPDATE fires SET state = 'ringing' WHERE id = ?`).bind(fire.id).run(); // as if it rang
    expect((await cc.post(`/fires/${fire.id}/actions`, { action: 'done' })).status).toBe(200);
    expect(await waitingFor('Bins in')).toEqual([expect.objectContaining({ kind: 'chore', memberId: C, points: 1 })]);
  });

  it('BT14 everyone sees everyone\'s score, zeros too', async () => {
    const s = (await list(b)).scores.map((x: any) => x.memberId);
    expect(sorted(s)).toEqual(sorted([A, B, C, D]));
  });

  it('BT15 an admin deletes an open bounty; its pending earning goes too', async () => {
    const x = await post('Fold towels', 1);
    expect((await b.del(`/bounties/${x.id}`)).status).toBe(403);
    await b.post(`/bounties/${x.id}/done`);
    expect((await a.del(`/bounties/${x.id}`)).status).toBe(204);
    expect((await list()).bounties.some((y: any) => y.id === x.id)).toBe(false);
    expect(await waitingFor('Fold towels')).toEqual([]);
    expect((await b.post(`/bounties/${x.id}/take`)).status).toBe(404);
  });

  it('BT16 bounty pushes are not founder pings', async () => {
    const since = addMinutes(new Date().toISOString(), -60);
    expect(await opsPingsSince(env.DB, since)).toBe(0);
    expect(await opsPingsAfter(env.DB, null, since, 100)).toEqual([]);
  });

  it('BT18 no session', async () => {
    expect((await new Client().get('/bounties')).status).toBe(401);
  });
});
