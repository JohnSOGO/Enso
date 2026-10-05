// SPEC §7B.7 — the pure rules of whose mess: state, input, who is asked, when, To talk about, who may act, balances, the words.
import { describe, expect, it } from 'vitest';
import {
  DISCUSS_AFTER_H, MESS_NOTE_MAX, NUDGES_MAX, NUDGE_EVERY_MIN, askMessage, askedOf, balancesOf, canDelete, canSettle, decideError,
  discussDue, discussMessage, isAnswerable, isDecidable, messStatus, nudgeDue, parseMessInput,
} from '../src/shared/messes';
import { addMinutes } from '../src/shared/time';
import { MESS_STATUS } from '../src/shared/vocab';

const T = '2026-10-05T10:00:00.000Z';
const row = (over: Partial<Parameters<typeof messStatus>[0] & { reported_by: string }> = {}) =>
  ({ settled_at: null, closed_at: null, claimed_by: null, discuss_at: null, reported_by: 'A', ...over });

describe('§7B.7 messes — rules', () => {
  it('state is derived: settled, closed, owed, discuss, open — first match wins', () => {
    expect(messStatus(row())).toBe('open');
    expect(messStatus(row({ discuss_at: T }))).toBe('discuss');
    expect(messStatus(row({ discuss_at: T, claimed_by: 'B' }))).toBe('owed');
    expect(messStatus(row({ claimed_by: 'B', closed_at: T }))).toBe('closed');
    expect(messStatus(row({ claimed_by: 'B', settled_at: T }))).toBe('settled');
  });

  it('input: the note is trimmed and capped, empty is null; choreId is optional text', () => {
    expect(parseMessInput({ note: ' pans ', choreId: 'chr_1' })).toEqual({ note: 'pans', choreId: 'chr_1' });
    expect(parseMessInput({ note: '  ', choreId: '' })).toEqual({ note: null, choreId: null });
    expect(parseMessInput({})).toEqual({ note: null, choreId: null });
    expect(parseMessInput({ note: 'x'.repeat(MESS_NOTE_MAX + 1) })).toMatch(/note/);
    expect(parseMessInput({ note: 5 })).toMatch(/note/);
  });

  it('asked: everyone active but the reporter and those who said Not me, only while unanswered', () => {
    expect(askedOf(row(), ['A', 'B', 'C'], ['C'])).toEqual(['B']);
    expect(askedOf(row({ discuss_at: T }), ['A', 'B', 'C'], [])).toEqual(['B', 'C']);
    expect(askedOf(row({ claimed_by: 'B' }), ['A', 'B', 'C'], [])).toEqual([]);
  });

  it('who may act: answer while open or discuss; decide also while owed; settle owed by the one owed or an admin', () => {
    expect(MESS_STATUS.map(isAnswerable)).toEqual([true, true, false, false, false]);
    expect(MESS_STATUS.map(isDecidable)).toEqual([true, true, true, false, false]);
    const owed = { status: 'owed' as const, reportedBy: 'A' };
    expect(canSettle(owed, { id: 'A', admin: false })).toBe(true);
    expect(canSettle(owed, { id: 'B', admin: true })).toBe(true);
    expect(canSettle(owed, { id: 'B', admin: false })).toBe(false);
    expect(canSettle({ ...owed, status: 'open' }, { id: 'A', admin: true })).toBe(false);
  });

  it('delete: an admin always, the reporter only before anyone answers', () => {
    const viewerA = { id: 'A', admin: false };
    expect(canDelete({ status: 'open', reportedBy: 'A' }, viewerA)).toBe(true);
    expect(canDelete({ status: 'discuss', reportedBy: 'A' }, viewerA)).toBe(true);
    expect(canDelete({ status: 'owed', reportedBy: 'A' }, viewerA)).toBe(false);
    expect(canDelete({ status: 'open', reportedBy: 'B' }, viewerA)).toBe(false);
    expect(canDelete({ status: 'settled', reportedBy: 'B' }, { id: 'A', admin: true })).toBe(true);
  });

  it('decide: an active member who is not the reporter, else the refusal text', () => {
    expect(decideError('B', 'A', ['A', 'B'])).toBeNull();
    expect(decideError('C', 'A', ['A', 'B'])).toBe("memberId must be an active member, or null for nobody's.");
    expect(decideError(5, 'A', ['A', 'B'])).toBe("memberId must be an active member, or null for nobody's.");
    expect(decideError('A', 'A', ['A', 'B'])).toBe("The one who cleaned it up can't owe themselves.");
  });

  it(`asks: at most ${NUDGES_MAX}, ${NUDGE_EVERY_MIN} min apart from the report`, () => {
    expect(nudgeDue(T, 0, T)).toBe(true);
    expect(nudgeDue(T, 1, addMinutes(T, NUDGE_EVERY_MIN - 1))).toBe(false);
    expect(nudgeDue(T, 1, addMinutes(T, NUDGE_EVERY_MIN))).toBe(true);
    expect(nudgeDue(T, 3, addMinutes(T, 3 * NUDGE_EVERY_MIN))).toBe(true);
    expect(nudgeDue(T, NUDGES_MAX, addMinutes(T, 600))).toBe(false);
  });

  it(`To talk about: nobody left to ask, or ${DISCUSS_AFTER_H} h after the report`, () => {
    expect(discussDue(T, [], T)).toBe(true);
    expect(discussDue(T, ['B'], addMinutes(T, DISCUSS_AFTER_H * 60 - 1))).toBe(false);
    expect(discussDue(T, ['B'], addMinutes(T, DISCUSS_AFTER_H * 60))).toBe(true);
  });

  it('balances are netted per pair; a member sees their own pairs, an admin every pair', () => {
    const owed = [
      { reported_by: 'A', claimed_by: 'C' }, { reported_by: 'A', claimed_by: 'C' }, { reported_by: 'C', claimed_by: 'A' },
      { reported_by: 'B', claimed_by: 'D' }, { reported_by: 'D', claimed_by: 'B' },
    ];
    expect(balancesOf(owed, 'A', false)).toEqual([{ from: 'C', to: 'A', points: 1 }]);
    expect(balancesOf(owed, 'C', false)).toEqual([{ from: 'C', to: 'A', points: 1 }]);
    expect(balancesOf(owed, 'B', false)).toEqual([]); // B and D are even
    expect(balancesOf(owed, 'X', true)).toEqual([{ from: 'C', to: 'A', points: 1 }]);
    expect(balancesOf([{ reported_by: 'A', claimed_by: 'B' }, { reported_by: 'C', claimed_by: 'B' }, { reported_by: 'C', claimed_by: 'B' }], 'X', true))
      .toEqual([{ from: 'B', to: 'C', points: 2 }, { from: 'B', to: 'A', points: 1 }]);
  });

  it('the words name the reporter, and the chore and note only when set', () => {
    expect(askMessage('Sam', 'Kitchen', 'pans')).toBe('Sam cleaned up a mess (Kitchen): pans. Was it yours? Open Ensō to answer.');
    expect(askMessage('Sam', null, null)).toBe('Sam cleaned up a mess. Was it yours? Open Ensō to answer.');
    expect(discussMessage('Sam', null, 'cups')).toBe("Nobody has claimed the mess Sam cleaned up: cups. It's on To talk about.");
  });
});
