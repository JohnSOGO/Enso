// M4c acceptance — chores through the API and /dev/tick (SPEC §7B.5 C3–C12).
// Simulated ticks use September 2026 dates (before any chore's real start_date), so each test
// backdates its chore's start_date. Done/undo use the real clock; their times are asserted relative to it.
import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { Client, member, owner, tickAt } from './helpers';
import { addDays, localToUtc, utcToLocal } from '../src/shared/time';

const TZ = 'America/Los_Angeles';
let o: Client, A: string, A_NAME: string, B: string, bClient: Client;

beforeAll(async () => {
  o = await owner();
  const me = (await o.get('/me')).json;
  A = me.id; A_NAME = me.display_name ?? me.displayName;
  const m = await member(o);
  B = m.id; bClient = m.client;
});

const laundryBody = () => ({
  title: 'Laundry', days: ['MO'], timing: 'at', time: '07:30', people: [A], channels: ['push', 'house'],
  steps: [
    { title: 'Start washer', waitMin: 60 },
    { title: 'Move to dryer', waitMin: 50 },
    { title: 'Fold & put away' },
  ],
});

async function createChore(body: object, backdateTo?: string) {
  const r = await o.post('/chores', body);
  expect(r.status, JSON.stringify(r.json)).toBe(201);
  if (backdateTo) await env.DB.prepare('UPDATE chores SET start_date = ? WHERE id = ?').bind(backdateTo, r.json.id).run();
  return r.json;
}
const runOn = (choreId: string, date: string) =>
  env.DB.prepare('SELECT * FROM chore_runs WHERE chore_id = ? AND date = ?').bind(choreId, date).first<any>();
const firesOf = async (runId: string) =>
  (await env.DB.prepare('SELECT * FROM fires WHERE chore_run_id = ? ORDER BY due_at').bind(runId).all<any>()).results;
const deliveriesOf = async (fireId: string) =>
  (await env.DB.prepare('SELECT channel, member_id, message FROM deliveries WHERE fire_id = ? ORDER BY alert_number').bind(fireId).all<any>()).results;
const nearNowPlus = (iso: string, min: number) => expect(Math.abs(Date.parse(iso) - (Date.now() + min * 60_000))).toBeLessThan(10_000);

describe('M4c chores — the Laundry loop (C3, C4, C5, C8)', () => {
  it('C3 tick Mon 07:30 → ringing; push to A only; house names A and the step', async () => {
    const ch = await createChore(laundryBody(), '2026-09-06');
    await tickAt(o, '2026-09-14T14:30:00.000Z'); // Mon 07:30 PDT
    const run = await runOn(ch.id, '2026-09-14');
    expect(run).toMatchObject({ assignee_id: A, step: 0 });
    const [fire] = await firesOf(run.id);
    expect(fire).toMatchObject({ kind: 'chore', state: 'ringing', due_at: '2026-09-14T14:30:00.000Z' });
    const d = await deliveriesOf(fire.id);
    expect(d.filter((x) => x.channel === 'push').map((x) => x.member_id)).toEqual([A]);
    expect(d.find((x) => x.channel === 'house').message).toBe(`Chore for ${A_NAME}: Laundry — Start washer`);

    // §10: /fires carries the run, the step title (multi-step) and the step's person.
    const row = (await o.get('/fires?state=ringing')).json.find((f: any) => f.id === fire.id);
    expect(row).toMatchObject({ kind: 'chore', title: 'Laundry', choreRunId: run.id, stepTitle: 'Start washer', personId: A });
  });

  it('C4 done on the ringing fire → step 1, next fire in 60 min that rings "— Move to dryer"; C5 done twice more → finished', async () => {
    const ch = await createChore(laundryBody(), '2026-09-06');
    await tickAt(o, '2026-09-21T14:30:00.000Z'); // the next Monday
    const run = await runOn(ch.id, '2026-09-21');
    const [fire] = await firesOf(run.id);

    const done = await o.post(`/fires/${fire.id}/actions`, { action: 'done' });
    expect(done.status, JSON.stringify(done.json)).toBe(200);
    expect(done.json.fire).toMatchObject({ id: fire.id, state: 'closed', close_reason: 'done', closed_by: A });
    nearNowPlus(done.json.next.due_at, 60);
    expect((await runOn(ch.id, '2026-09-21')).step).toBe(1);

    await tickAt(o, done.json.next.due_at);
    const second = (await firesOf(run.id)).find((f) => f.state === 'ringing');
    expect((await deliveriesOf(second.id)).find((x) => x.channel === 'house').message).toBe(`Chore for ${A_NAME}: Laundry — Move to dryer`);

    // C5: done (step 1 → 2, a 50-min wait), then done again (step 2 → finished).
    const d2 = await bClient.post(`/chore-runs/${run.id}/done`);
    expect(d2.json).toMatchObject({ step: 2, doneAt: null, ringing: false, personId: A });
    nearNowPlus(d2.json.nextDueAt, 50);
    const d3 = await bClient.post(`/chore-runs/${run.id}/done`);
    expect(d3.json).toMatchObject({ step: 3, doneBy: B, nextDueAt: null, ringing: false, personId: null });
    expect(d3.json.doneAt).not.toBeNull();
    expect((await firesOf(run.id)).filter((f) => f.state !== 'closed')).toEqual([]);
    const again = await o.post(`/chore-runs/${run.id}/done`);
    expect(again.status).toBe(409);
    expect(again.json.error).toBe('already_done');
  });

  it('C8 after a done, undo → step 0 and the pending wait fire closed removed; undo at 0 → 409', async () => {
    const ch = await createChore(laundryBody(), '2026-09-06');
    await tickAt(o, '2026-09-28T14:30:00.000Z');
    const run = await runOn(ch.id, '2026-09-28');
    const done = await o.post(`/chore-runs/${run.id}/done`);
    expect(done.json.step).toBe(1);
    const pending = (await firesOf(run.id)).find((f) => f.state === 'scheduled');
    expect(pending).toBeDefined();

    const undo = await o.post(`/chore-runs/${run.id}/undo`);
    expect(undo.json).toMatchObject({ step: 0, nextDueAt: null });
    expect((await env.DB.prepare('SELECT state, close_reason FROM fires WHERE id = ?').bind(pending.id).first<any>()))
      .toEqual({ state: 'closed', close_reason: 'removed' });
    const none = await o.post(`/chore-runs/${run.id}/undo`);
    expect(none.status).toBe(409);
    expect(none.json.error).toBe('nothing_to_undo');
  });

  it('C14 delete a chore while a step wait is pending → that fire closes removed; nothing rings', async () => {
    const ch = await createChore(laundryBody(), '2026-09-06');
    await tickAt(o, '2026-09-28T14:30:00.000Z');
    const run = await runOn(ch.id, '2026-09-28');
    await o.post(`/chore-runs/${run.id}/done`); // step 1 started: a wait fire is pending
    const pending = (await firesOf(run.id)).find((f) => f.state === 'scheduled');
    expect(pending).toBeDefined();

    expect((await o.del(`/chores/${ch.id}`)).status).toBe(200);
    expect((await env.DB.prepare('SELECT state, close_reason FROM fires WHERE id = ?').bind(pending.id).first<any>()))
      .toEqual({ state: 'closed', close_reason: 'removed' });
    expect((await firesOf(run.id)).filter((f) => f.state !== 'closed')).toEqual([]);
  });
});

describe('M4c chores — by, today, edits', () => {
  it('C6 `by` 19:00 with nudge; done before 19:00 → the scheduled fire closes done; tick at 19:00 sends nothing', async () => {
    const ch = await createChore({ title: 'Trash', days: ['TU'], timing: 'by', time: '19:00', nudge: true, people: [A], steps: [{ title: 'Trash' }], channels: ['push'] }, '2026-09-06');
    await tickAt(o, '2026-09-15T15:00:00.000Z'); // Tue 08:00 PDT
    const run = await runOn(ch.id, '2026-09-15');
    const [fire] = await firesOf(run.id);
    expect(fire).toMatchObject({ state: 'scheduled', due_at: '2026-09-16T02:00:00.000Z' });
    await o.post(`/chore-runs/${run.id}/done`);
    expect((await firesOf(run.id))[0]).toMatchObject({ state: 'closed', close_reason: 'done' });
    await tickAt(o, '2026-09-16T02:00:00.000Z');
    expect(await deliveriesOf(fire.id)).toEqual([]);
  });

  it('C7 `by` 19:00, nudge off → no fire ever; the run is on /chores/today', async () => {
    const ch = await createChore({ title: 'Wipe counters', days: ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'], timing: 'by', time: '19:00', people: [A], steps: [{ title: 'Wipe counters' }] });
    const today = await o.get('/chores/today');
    const run = today.json.runs.find((r: any) => r.choreId === ch.id);
    expect(today.json.date).toBe(utcToLocal(new Date().toISOString(), TZ).date);
    expect(run).toMatchObject({ title: 'Wipe counters', timing: 'by', time: '19:00', step: 0, assigneeId: A, personId: A, nextDueAt: null, ringing: false });
    await tickAt(o, localToUtc(today.json.date, '19:00', TZ));
    expect(await firesOf(run.id)).toEqual([]);
  });

  it('C9 a chore created after its time today → today\'s run exists, no fire for it', async () => {
    // 00:00 today is always already past when the request arrives.
    const ch = await createChore({ title: 'Feed fish', days: ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'], timing: 'at', time: '00:00', people: [A], steps: [{ title: 'Feed fish' }], channels: ['push'] });
    const run = (await o.get('/chores/today')).json.runs.find((r: any) => r.choreId === ch.id);
    expect(run).toBeDefined();
    expect(await firesOf(run.id)).toEqual([]);
  });

  it('C10 edit people [A] → [B]: today\'s unstarted run is B\'s at once; the old fire closed removed, a new one if still ahead', async () => {
    const ch = await createChore({ title: 'Dishes', days: ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'], timing: 'at', time: '23:59', people: [A], steps: [{ title: 'Dishes' }], channels: ['push'] });
    const today = (await o.get('/chores/today')).json;
    const before = today.runs.find((r: any) => r.choreId === ch.id);
    expect(before.assigneeId).toBe(A);
    const ahead = Date.parse(localToUtc(today.date, '23:59', TZ)) > Date.now();
    const oldFires = await firesOf(before.id);
    expect(oldFires).toHaveLength(ahead ? 1 : 0);

    const e = await o.patch(`/chores/${ch.id}`, { people: [B] });
    expect(e.status, JSON.stringify(e.json)).toBe(200);
    expect(e.json).toMatchObject({ id: ch.id, people: [B], thisWeek: B, title: 'Dishes' });
    const after = (await o.get('/chores/today')).json.runs.find((r: any) => r.choreId === ch.id);
    expect(after).toMatchObject({ id: before.id, assigneeId: B, personId: B });
    const fires = await firesOf(before.id);
    for (const f of oldFires) expect(fires.find((x) => x.id === f.id)).toMatchObject({ state: 'closed', close_reason: 'removed' });
    expect(fires.filter((f) => f.state === 'scheduled')).toHaveLength(ahead ? 1 : 0);
  });

  it('GET /chores lists whose turn it is this week and next; only the creator or owner can change it', async () => {
    const ch = await createChore({ title: 'Mow', days: ['SA'], timing: 'by', time: '17:00', people: [A, B], steps: [{ title: 'Mow' }] });
    const listed = (await o.get('/chores')).json.find((c: any) => c.id === ch.id);
    expect(listed).toMatchObject({ title: 'Mow', doneMeans: null, days: ['SA'], timing: 'by', nudge: false, people: [A, B], thisWeek: A, nextWeek: B, createdBy: A });
    expect((await bClient.patch(`/chores/${ch.id}`, { title: 'Nope' })).status).toBe(403);
    expect((await bClient.del(`/chores/${ch.id}`)).status).toBe(403);
    expect((await o.del(`/chores/${ch.id}`)).status).toBe(200);
    expect((await o.get('/chores')).json.some((c: any) => c.id === ch.id)).toBe(false);
  });

  it('C11 no days / no people / 7 steps / waitMin 0 → 400 invalid_input naming the field', async () => {
    const base = { title: 'Bad', days: ['MO'], timing: 'at', time: '08:00', people: [A], steps: [{ title: 'Bad' }], channels: ['push'] };
    const cases: [object, RegExp][] = [
      [{ days: [] }, /days/],
      [{ people: [] }, /people/],
      [{ steps: Array.from({ length: 7 }, (_, i) => ({ title: `Step ${i}` })) }, /steps/],
      [{ steps: [{ title: 'A', waitMin: 0 }, { title: 'B' }] }, /waitMin/],
    ];
    for (const [over, field] of cases) {
      const r = await o.post('/chores', { ...base, ...over });
      expect(r.status).toBe(400);
      expect(r.json.error).toBe('invalid_input');
      expect(r.json.message).toMatch(field);
    }
  });

  it('C12 no chore appears in /calendar or /alarms', async () => {
    const ch = await createChore({ title: 'Chore not an event', days: ['MO', 'WE'], timing: 'at', time: '08:00', people: [A], steps: [{ title: 'x' }], channels: ['push'] });
    const today = utcToLocal(new Date().toISOString(), TZ).date;
    const cal = (await o.get(`/calendar?from=${today}&to=${addDays(today, 14)}`)).json;
    expect(JSON.stringify(cal)).not.toContain(ch.title);
    const alarms = (await o.get('/alarms')).json;
    expect(alarms.some((a: any) => a.id === ch.id || a.title === ch.title)).toBe(false);
  });
});

describe('M4c chores — recipients when the step person is gone', () => {
  it('a step person who was disabled → every active member is alerted, and the message names nobody', async () => {
    const c = await member(o);
    const ch = await createChore({ title: 'Water plants', days: ['WE'], timing: 'at', time: '09:00', people: [A], steps: [{ title: 'Water plants', memberId: c.id }], channels: ['push', 'house'] }, '2026-09-06');
    expect((await o.patch(`/members/${c.id}`, { disabled: true })).status).toBe(200);
    await tickAt(o, '2026-09-16T16:00:00.000Z'); // Wed 09:00 PDT
    const run = await runOn(ch.id, '2026-09-16');
    const [fire] = await firesOf(run.id);
    const d = await deliveriesOf(fire.id);
    const active = (await env.DB.prepare('SELECT id FROM members WHERE disabled_at IS NULL').all<any>()).results.map((r) => r.id);
    expect(d.filter((x) => x.channel === 'push').map((x) => x.member_id).sort()).toEqual(active.sort());
    expect(d.find((x) => x.channel === 'house').message).toBe('Chore: Water plants');
  });
});
