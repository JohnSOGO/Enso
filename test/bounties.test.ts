// SPEC §7B.8 — the pure rules of bounties: state, input, who may take or say Done, earn / drop on a run, OK at once,
// the score windows (BT14) and the words.
import { describe, expect, it } from 'vitest';
import {
  POINTS_MAX, TAKE_HOURS, bountyStatus, doneError, newBountyMessage, okAtOnce, parseBountyInput, parsePoints, runEarningChange,
  scoreSince, scoresOf, takeError, waitingMessage,
} from '../src/shared/bounties';
import { addMinutes, localToUtc } from '../src/shared/time';

const T = '2026-10-11T18:00:00.000Z';
const tz = 'America/Los_Angeles';

describe('§7B.8 bounties — rules', () => {
  it('state is derived: paid, pending, taken while the dib holds, open', () => {
    const b = { taken_by: 'B', taken_at: T };
    expect(bountyStatus({ taken_by: null, taken_at: null }, null, T)).toBe('open');
    expect(bountyStatus(b, null, addMinutes(T, TAKE_HOURS * 60 - 1))).toBe('taken');
    expect(bountyStatus(b, null, addMinutes(T, TAKE_HOURS * 60))).toBe('open');
    expect(bountyStatus(b, { ok_at: null }, T)).toBe('pending');
    expect(bountyStatus(b, { ok_at: T }, T)).toBe('paid');
  });

  it('BT3 input: title 1–60 trimmed, note ≤ 120, points 1–10 whole', () => {
    expect(parseBountyInput({ title: ' Clean the toilet ', note: ' ', points: 3 })).toEqual({ title: 'Clean the toilet', note: null, points: 3 });
    expect(parseBountyInput({ title: '', points: 3 })).toMatch(/title/);
    expect(parseBountyInput({ title: 'x'.repeat(61), points: 3 })).toMatch(/title/);
    expect(parseBountyInput({ title: 'x', note: 'n'.repeat(121), points: 3 })).toMatch(/note/);
    for (const p of [0, POINTS_MAX + 1, 2.5, '3', null]) expect(parsePoints(p)).toMatch(/points/);
    expect(parsePoints(10)).toBe(10);
  });

  it('BT4–BT5 take and Done refusals', () => {
    expect(takeError('open', null, 'B', 'x', null)).toBeNull();
    expect(takeError('taken', 'B', 'B', 'Bea', null)).toBeNull();
    expect(takeError('taken', 'B', 'C', 'Bea', null)).toBe('Bea is on it.');
    expect(takeError('open', null, 'B', 'x', 'Toilet')).toBe("You're already on Toilet. Finish it or let it go first.");
    expect(takeError('pending', null, 'B', 'x', null)).toBe('That bounty is waiting for OK.');
    expect(doneError('open', null, 'C', 'x')).toBeNull();
    expect(doneError('taken', 'B', 'B', 'Bea')).toBeNull();
    expect(doneError('taken', 'B', 'C', 'Bea')).toBe('Bea is on it.');
    expect(doneError('paid', null, 'C', 'x')).toBe('That bounty is already paid.');
  });

  it('a run earns when it finishes and drops when undone; an admin is OK\'d at once', () => {
    expect(runEarningChange({ done_at: null }, { done_at: T })).toBe('earn');
    expect(runEarningChange({ done_at: T }, { done_at: null })).toBe('drop');
    expect(runEarningChange({ done_at: null }, { done_at: null })).toBeNull();
    expect(okAtOnce({ id: 'A', admin: true }, T)).toEqual({ ok_by: 'A', ok_at: T });
    expect(okAtOnce({ id: 'B', admin: false }, T)).toBeNull();
  });

  it('BT14 scores: Sunday-start week and the month, OK\'d live points only, every active member', () => {
    const today = '2026-10-13'; // a Tuesday; the week began Sunday 2026-10-11
    const at = (date: string) => localToUtc(date, '12:00', tz);
    const e = (member_id: string, date: string, points: number, over = {}) =>
      ({ member_id, points, done_at: at(date), ok_at: T, dropped_at: null, ...over });
    const scores = scoresOf([
      e('B', '2026-10-10', 1), e('B', '2026-10-11', 2), e('B', '2026-09-30', 4), e('B', '2026-10-12', 8, { ok_at: null }),
      e('B', '2026-10-12', 16, { dropped_at: T }), e('X', '2026-10-12', 5),
    ], ['B', 'C'], today, tz);
    expect(scores).toEqual([{ memberId: 'B', week: 2, month: 3 }, { memberId: 'C', week: 0, month: 0 }]);
    expect(scoreSince(today, tz)).toBe(localToUtc('2026-10-01', '00:00', tz));
    expect(scoreSince('2026-11-02', tz)).toBe(localToUtc('2026-11-01', '00:00', tz)); // Sun 11-01 = the 1st
    expect(scoreSince('2026-10-02', tz)).toBe(localToUtc('2026-09-27', '00:00', tz)); // the week reaches back into September
  });

  it('the words', () => {
    expect(newBountyMessage('Clean the toilet', 3)).toBe('Clean the toilet · 3 points. Open Ensō → Chores → Bounties.');
    expect(waitingMessage('Kai', 'Clean the toilet', 3)).toBe('Kai says done: Clean the toilet · 3 points. OK it in Chores → Bounties.');
  });
});
