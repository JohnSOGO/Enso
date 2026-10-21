// SPEC §8.4a NE1–NE6 — editing a notes text as lines (frontend/src/notes-edit.ts).
// Loaded at run time like test/day-lines.test.ts: the Worker typecheck does not cover the PWA.
import { describe, expect, it } from 'vitest';

interface Edit { text: string; start: number; end: number }
const EDIT = '../frontend/src/notes-edit.ts';
const { toggleBullet, toggleBox, tickLine, continueList } = (await import(/* @vite-ignore */ EDIT)) as {
  toggleBullet: (t: string, s: number, e: number) => Edit; toggleBox: (t: string, s: number, e: number) => Edit;
  tickLine: (t: string, n: number) => string; continueList: (t: string, at: number) => Edit | null;
};

describe('list editing', () => {
  it('NE1 • List adds a bullet to every selected line, and takes it off when all have one', () => {
    expect(toggleBullet('eggs\nmilk', 0, 9)).toEqual({ text: '• eggs\n• milk', start: 0, end: 13 });
    expect(toggleBullet('• eggs\n• milk', 0, 13).text).toBe('eggs\nmilk');
    expect(toggleBullet('a\nb', 2, 2)).toEqual({ text: 'a\n• b', start: 4, end: 4 }); // the cursor's line only
  });
  it('NE2 ☐ Box swaps a bullet for a box; ☐ and ☑ lines lose their box together', () => {
    expect(toggleBox('• eggs', 3, 3).text).toBe('☐ eggs');
    expect(toggleBox('☐ a\n☑ b', 0, 7).text).toBe('a\nb');
  });
  it('NE3 tickLine flips ☐ ↔ ☑ on that line only', () => {
    expect(tickLine('☐ a\n☐ b', 1)).toBe('☐ a\n☑ b');
    expect(tickLine('☑ a', 0)).toBe('☐ a');
    expect(tickLine('plain', 0)).toBe('plain');
    expect(tickLine('a', 5)).toBe('a');
  });
  it('NE4 Enter on a list line continues it; a ☑ line starts a ☐ one', () => {
    expect(continueList('• eggs', 6)).toEqual({ text: '• eggs\n• ', start: 9, end: 9 });
    expect(continueList('☑ done', 6)?.text).toBe('☑ done\n☐ ');
  });
  it('NE5 Enter on a line that is only the mark ends the list', () => {
    expect(continueList('• eggs\n• ', 9)).toEqual({ text: '• eggs\n', start: 7, end: 7 });
  });
  it('NE6 Enter on a plain line, or before the mark, is a plain Enter', () => {
    expect(continueList('eggs', 4)).toBeNull();
    expect(continueList('• eggs', 0)).toBeNull();
  });
});
