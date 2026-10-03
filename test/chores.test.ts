// M4c — the pure chore rules (SPEC §7B): C1, C2, and units for planning, advance, undo,
// re-plan, the fire context and input validation. API rows C3–C12 are in chores-api.test.ts.
import { describe, expect, it } from 'vitest';
import {
  advanceRun, assigneeFor, choreFireContext, parseChoreInput, planChoreRuns, replanRun, showsOnToday, stepPerson, undoRun,
  type Chore, type ChoreRun,
} from '../src/shared/chores';
import { newChoreFire, stepFire, type FireRow } from '../src/shared/engine';

const TZ = 'America/Los_Angeles';
const A = 'mem_a', B = 'mem_b';

const laundry: Chore = {
  id: 'chr_1', title: 'Laundry', done_means: null, days: ['MO'], timing: 'at', time: '07:30', nudge: false,
  people: [A], channels: ['push', 'house'], renotify_min: 15, max_alerts: 4, start_date: '2026-10-04',
  steps: [
    { title: 'Start washer', waitMin: 60, memberId: null },
    { title: 'Move to dryer', waitMin: 50, memberId: null },
    { title: 'Fold & put away', waitMin: null, memberId: null },
  ],
};
const trash: Chore = {
  ...laundry, id: 'chr_2', title: 'Trash', days: ['TU'], timing: 'by', time: '19:00', nudge: true, renotify_min: 15,
  steps: [{ title: 'Trash', waitMin: null, memberId: null }],
};
const run = (over: Partial<ChoreRun> = {}): ChoreRun => ({
  id: 'run_1', chore_id: laundry.id, date: '2026-10-05', assignee_id: A, step: 0, done_at: null, done_by: null, ...over,
});
const openFire = (dueAt: string, runId = 'run_1'): FireRow => ({ id: 'fire_1', ...newChoreFire(runId, dueAt) });
const MON_0730 = '2026-10-05T14:30:00.000Z'; // 07:30 PDT

describe('§7B.1 turns', () => {
  const pair = { people: [A, B], start_date: '2026-10-04' };
  it('C1 people [A, B], start Sun 2026-10-04: 10-05, 10-10, 10-12, 10-19 → A, A, B, A', () => {
    expect(['2026-10-05', '2026-10-10', '2026-10-12', '2026-10-19'].map((d) => assigneeFor(pair, d, [A, B]))).toEqual([A, A, B, A]);
  });
  it('C2 with B disabled → A every week', () => {
    expect(['2026-10-05', '2026-10-10', '2026-10-12', '2026-10-19'].map((d) => assigneeFor(pair, d, [A]))).toEqual([A, A, A, A]);
  });
  it('nobody active → no assignee ("anyone")', () => {
    expect(assigneeFor(pair, '2026-10-12', [])).toBeNull();
  });
  it('a start mid-week counts from that week\'s Sunday', () => {
    expect(assigneeFor({ ...pair, start_date: '2026-10-08' }, '2026-10-11', [A, B])).toBe(B);
  });
});

describe('§7B.2 step person', () => {
  it('the step\'s own member, else whose turn it is; nobody once finished', () => {
    const c = { ...laundry, steps: [laundry.steps[0], { ...laundry.steps[1], memberId: B }, laundry.steps[2]] };
    expect(stepPerson(c, run())).toBe(A);
    expect(stepPerson(c, run({ step: 1 }))).toBe(B);
    expect(stepPerson(c, run({ step: 3 }))).toBeNull();
  });
});

describe('§7B.3 planning', () => {
  it('one run per due date in the window; an `at` first fire at date + time', () => {
    const p = planChoreRuns({ ...laundry, days: ['MO', 'TU'] }, TZ, '2026-10-05T07:00:00.000Z', '2026-10-06T19:00:00.000Z', [A]);
    expect(p).toEqual([
      { date: '2026-10-05', assignee_id: A, firstDueAt: MON_0730 },
      { date: '2026-10-06', assignee_id: A, firstDueAt: '2026-10-06T14:30:00.000Z' },
    ]);
  });
  it('never before start_date', () => {
    const p = planChoreRuns({ ...laundry, days: ['MO', 'TU'], start_date: '2026-10-06' }, TZ, '2026-10-05T07:00:00.000Z', '2026-10-06T19:00:00.000Z', [A]);
    expect(p.map((r) => r.date)).toEqual(['2026-10-06']);
  });
  it('a first fire already past is not created (C9 rule); the run still is', () => {
    const p = planChoreRuns(laundry, TZ, '2026-10-06T03:00:00.000Z' /* Mon 20:00 PDT */, '2026-10-07T15:00:00.000Z', [A]);
    expect(p).toEqual([{ date: '2026-10-05', assignee_id: A, firstDueAt: null }]);
  });
  it('`by` with nudge → fire at the deadline; nudge off → none (C7 rule)', () => {
    const from = '2026-10-06T07:00:00.000Z', to = '2026-10-07T07:00:00.000Z';
    expect(planChoreRuns(trash, TZ, from, to, [A])[0].firstDueAt).toBe('2026-10-07T02:00:00.000Z');
    expect(planChoreRuns({ ...trash, nudge: false }, TZ, from, to, [A])[0].firstDueAt).toBeNull();
  });
});

describe('§7B.3 advance and undo', () => {
  it('done with a wait: the open fire closes done; a new fire rings after waitMin (C4 rule)', () => {
    const r = advanceRun(laundry, run(), openFire(MON_0730), A, '2026-10-05T14:40:00.000Z', TZ);
    if ('error' in r) throw new Error(r.error);
    expect(r.run.step).toBe(1);
    expect(r.closeFire).toMatchObject({ state: 'closed', close_reason: 'done', closed_by: A });
    expect(r.newFire).toMatchObject({ kind: 'chore', chore_run_id: 'run_1', due_at: '2026-10-05T15:40:00.000Z' });
  });
  it('done on the last step finishes the run; then already_done (C5 rule)', () => {
    const r = advanceRun(laundry, run({ step: 2 }), null, B, '2026-10-05T17:00:00.000Z', TZ);
    if ('error' in r) throw new Error(r.error);
    expect(r.run).toMatchObject({ step: 3, done_at: '2026-10-05T17:00:00.000Z', done_by: B });
    expect(r.newFire).toBeUndefined();
    expect(advanceRun(laundry, r.run, null, B, '2026-10-05T17:01:00.000Z', TZ)).toEqual({ error: 'already_done' });
  });
  it('done with no wait on an `at` chore: no fire, the next step is just current', () => {
    const c = { ...laundry, steps: [{ ...laundry.steps[0], waitMin: null }, laundry.steps[1]] };
    const r = advanceRun(c, run(), null, A, MON_0730, TZ);
    if ('error' in r) throw new Error(r.error);
    expect(r.newFire).toBeUndefined();
  });
  it('a `by` nudge still ahead is kept after a step with no wait (rule 4)', () => {
    const c = { ...trash, steps: [{ title: 'Bag it', waitMin: null, memberId: null }, { title: 'Out', waitMin: null, memberId: null }] };
    const r = advanceRun(c, run({ date: '2026-10-06' }), openFire('2026-10-07T02:00:00.000Z'), A, '2026-10-07T00:00:00.000Z', TZ);
    if ('error' in r) throw new Error(r.error);
    expect(r.newFire?.due_at).toBe('2026-10-07T02:00:00.000Z');
  });
  it('undo: step − 1, open fire removed, waits not re-armed (C8 rule); nothing_to_undo at 0', () => {
    const r = undoRun(laundry, run({ step: 1 }), openFire('2026-10-05T15:40:00.000Z'), '2026-10-05T14:45:00.000Z', TZ);
    if ('error' in r) throw new Error(r.error);
    expect(r.run.step).toBe(0);
    expect(r.closeFire?.close_reason).toBe('removed');
    expect(r.newFire).toBeUndefined();
    expect(undoRun(laundry, run(), null, MON_0730, TZ)).toEqual({ error: 'nothing_to_undo' });
  });
  it('undo of a finished run clears done_at/done_by; a `by` nudge still ahead comes back', () => {
    const r = undoRun(trash, run({ date: '2026-10-06', step: 1, done_at: 'x', done_by: A }), null, '2026-10-07T00:00:00.000Z', TZ);
    if ('error' in r) throw new Error(r.error);
    expect(r.run).toMatchObject({ step: 0, done_at: null, done_by: null });
    expect(r.newFire?.due_at).toBe('2026-10-07T02:00:00.000Z');
  });
});

describe('§7B.3 edit re-plan', () => {
  const now = '2026-10-05T12:00:00.000Z'; // Mon 05:00 PDT
  it('an unstarted run of today gets the new assignee; its fire is replaced (C10 rule)', () => {
    const r = replanRun({ ...laundry, people: [B] }, run(), openFire(MON_0730), TZ, now, [A, B]);
    expect(r?.run.assignee_id).toBe(B);
    expect(r?.closeFire?.close_reason).toBe('removed');
    expect(r?.newFire?.due_at).toBe(MON_0730);
  });
  it('started runs and earlier days are left alone', () => {
    expect(replanRun(laundry, run({ step: 1 }), null, TZ, now, [A])).toBeNull();
    expect(replanRun(laundry, run({ date: '2026-10-04' }), null, TZ, now, [A])).toBeNull();
  });
  it('a day no longer chosen gets no fire and leaves Today', () => {
    const c = { ...laundry, days: ['TU' as const] };
    expect(replanRun(c, run(), openFire(MON_0730), TZ, now, [A])?.newFire).toBeUndefined();
    expect(showsOnToday(c, run())).toBe(false);
    expect(showsOnToday(c, run({ step: 1 }))).toBe(true);
  });
});

describe('chore fire context', () => {
  it('an `at` chore rings with its renotify; a `by` chore once (renotify ignored)', () => {
    expect(choreFireContext(laundry, run()).cfg).toEqual({ channels: ['push', 'house'], renotifyMin: 15, maxAlerts: 4 });
    expect(choreFireContext(trash, run()).cfg.renotifyMin).toBeNull();
    const ringing = stepFire(openFire('2026-10-07T02:00:00.000Z'), choreFireContext(trash, run()).cfg, '2026-10-07T02:00:00.000Z').fire;
    expect(stepFire(ringing, choreFireContext(trash, run()).cfg, '2026-10-07T03:00:00.000Z').alert).toBe(false);
  });
  it('names the current step and its person', () => {
    expect(choreFireContext(laundry, run({ step: 1 }))).toMatchObject({ personId: A, stepTitle: 'Move to dryer', stepCount: 3 });
  });
});

describe('§7B.4 validation', () => {
  const ok = {
    title: ' Laundry ', days: ['TH', 'MO'], timing: 'at', time: '07:30', people: [A],
    steps: [{ title: 'Start washer', waitMin: 60 }, { title: 'Fold' }], channels: ['push'],
  };
  it('normalizes a good body', () => {
    expect(parseChoreInput(ok, [A])).toEqual({
      title: 'Laundry', done_means: null, days: ['MO', 'TH'], timing: 'at', time: '07:30', nudge: false, people: [A],
      steps: [{ title: 'Start washer', waitMin: 60, memberId: null }, { title: 'Fold', waitMin: null, memberId: null }],
      channels: ['push'], renotify_min: null, max_alerts: 4,
    });
  });
  it.each([
    ['title', { title: '' }],
    ['doneMeans', { doneMeans: 'x'.repeat(201) }],
    ['days', { days: [] }],
    ['timing', { timing: 'around' }],
    ['time', { time: '7:30' }],
    ['people', { people: [] }],
    ['people', { people: ['mem_gone'] }],
    ['people', { people: [A, A] }],
    ['steps', { steps: Array.from({ length: 7 }, (_, i) => ({ title: `S${i}` })) }],
    ['steps[0].title', { steps: [{ title: '' }] }],
    ['steps[0].waitMin', { steps: [{ title: 'S', waitMin: 0 }] }],
    ['steps[0].memberId', { steps: [{ title: 'S', memberId: 'mem_gone' }] }],
    ['channels', { channels: [] }],
    ['renotifyMin', { renotifyMin: 0 }],
  ])('rejects bad %s with a message naming it', (field, over) => {
    const r = parseChoreInput({ ...ok, ...over }, [A]);
    expect(typeof r).toBe('string');
    expect(r as string).toContain(field);
  });
  it('a quiet `by` chore needs no channel; nudge only applies to `by`', () => {
    expect(parseChoreInput({ ...ok, timing: 'by', channels: [] }, [A])).toMatchObject({ channels: [], nudge: false });
    expect(parseChoreInput({ ...ok, timing: 'by', nudge: true, channels: [] }, [A])).toContain('channels');
    expect(parseChoreInput({ ...ok, nudge: true }, [A])).toMatchObject({ nudge: false });
  });
});
