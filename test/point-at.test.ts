// SPEC §8.16 PA1 — pointLine, the pure half of naming what was tapped (frontend/src/point-line.ts). Loaded at run
// time like test/repeat-fields.test.ts: the Worker typecheck does not cover the PWA.
import { describe, expect, it } from 'vitest';

interface PointPieces { tab: string; modals: string[]; groups: string[]; name: string; kind: string; stamp: string; size: string }
const LINE = '../frontend/src/point-line.ts';
const { pointLine, GROUP_CHARS, NAME_CHARS } = (await import(/* @vite-ignore */ LINE)) as {
  pointLine: (p: PointPieces) => string; GROUP_CHARS: number; NAME_CHARS: number;
};

const pieces = (more: Partial<PointPieces> = {}): PointPieces => ({
  tab: '⚙ Settings', modals: ['🔔 Alerts'], groups: ['Morning pills'], name: 'FunHouse', kind: 'checkbox',
  stamp: 'v1.52.0 · 1a2b3c4', size: '430×932', ...more,
});

describe('pointLine — §8.16 PA1', () => {
  it('joins tab › modals › groups › "name" kind, then the stamp and size', () => {
    expect(pointLine(pieces())).toBe('📍 ⚙ Settings › 🔔 Alerts › Morning pills › "FunHouse" checkbox · v1.52.0 · 1a2b3c4 · 430×932');
  });

  it('keeps several modals bottom to top and groups outside in', () => {
    expect(pointLine(pieces({ modals: ['🍳 Recipes', 'Edit recipe'], groups: ['Ingredients', 'Eggs'], name: 'Delete', kind: 'button' })))
      .toBe('📍 ⚙ Settings › 🍳 Recipes › Edit recipe › Ingredients › Eggs › "Delete" button · v1.52.0 · 1a2b3c4 · 430×932');
  });

  it('leaves empty pieces out; a thing with no name is its kind alone', () => {
    expect(pointLine(pieces({ modals: [], groups: ['', '  '], name: '', kind: 'text', stamp: '' })))
      .toBe('📍 ⚙ Settings › text · 430×932');
  });

  it('cuts a name to NAME_CHARS and a group to GROUP_CHARS, and folds whitespace', () => {
    const line = pointLine(pieces({ modals: [], groups: ['a'.repeat(50)], name: `  two\n  words ${'b'.repeat(60)}` }));
    const [, group, thing] = line.split(' · ')[0].split(' › ');
    expect(group).toBe(`${'a'.repeat(GROUP_CHARS - 1)}…`);
    expect(thing).toBe(`"${`two words ${'b'.repeat(60)}`.slice(0, NAME_CHARS - 1)}…" checkbox`);
  });
});
