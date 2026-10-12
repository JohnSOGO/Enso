// SPEC §7.1 / §8.3 FA1–FA5 — who an event is for (frontend/src/participants.ts).
// Loaded at run time like test/day-lines.test.ts: the Worker typecheck does not cover the PWA.
import { describe, expect, it } from 'vitest';

interface Participants { family: boolean; ids: string[] }
const PATH = '../frontend/src/participants.ts';
const { participants } = (await import(/* @vite-ignore */ PATH)) as {
  participants: (assignedTo: string[], members: { id: string; disabledAt: string | null }[], first?: string) => Participants;
};

const m = (id: string, disabledAt: string | null = null) => ({ id, disabledAt });
const house = [m('a'), m('b'), m('c'), m('d', '2026-10-01T00:00:00Z')];

describe('event participants (§7.1, §8.3)', () => {
  it('FA1 each person once', () => {
    expect(participants(['a', 'b', 'a'], house)).toEqual({ family: false, ids: ['a', 'b'] });
  });
  it('FA2 every active member → Family (a disabled member is not needed)', () => {
    expect(participants(['c', 'a', 'b'], house).family).toBe(true);
  });
  it('FA3 some members → not Family', () => {
    expect(participants(['a', 'b'], house).family).toBe(false);
  });
  it('FA4 a one-person household is never Family; nobody is never Family', () => {
    expect(participants(['a'], [m('a')]).family).toBe(false);
    expect(participants([], house)).toEqual({ family: false, ids: [] });
  });
  it('FA5 the creator, when taking part, comes first; otherwise order is kept', () => {
    expect(participants(['b', 'c', 'a'], house, 'a').ids).toEqual(['a', 'b', 'c']);
    expect(participants(['b', 'c'], house, 'a').ids).toEqual(['b', 'c']);
  });
});
