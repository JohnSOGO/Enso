// SPEC §7.1 DL1–DL5 — the fit for a calendar day's event lines (frontend/src/day-lines.ts).
// Loaded at run time like test/point-at.test.ts: the Worker typecheck does not cover the PWA.
import { describe, expect, it } from 'vitest';

interface LinesFit { lineH: number; shown: number; more: number }
const LINES = '../frontend/src/day-lines.ts';
const { fitLines, dotSize, LINE_MAX, LINE_MIN, DOT_MIN } = (await import(/* @vite-ignore */ LINES)) as {
  fitLines: (room: number, count: number) => LinesFit; dotSize: (lineH: number, dots: number, width: number) => number;
  LINE_MAX: number; LINE_MIN: number; DOT_MIN: number;
};

describe('calendar day lines (§7.1)', () => {
  it('DL1 two lines with room stay full size', () => {
    expect(fitLines(40, 2)).toEqual({ lineH: LINE_MAX, shown: 2, more: 0 });
  });
  it('DL2 four lines shrink to fit, all shown', () => {
    const f = fitLines(40, 4);
    expect(f.shown).toBe(4);
    expect(f.more).toBe(0);
    expect(f.lineH).toBeGreaterThanOrEqual(LINE_MIN);
    expect(f.lineH).toBeLessThan(LINE_MAX);
    expect(f.lineH * 4 + 3).toBeLessThanOrEqual(40);
  });
  it('DL3 ten lines: smallest size, the last becomes +N', () => {
    const f = fitLines(40, 10);
    expect(f.lineH).toBe(LINE_MIN);
    expect(f.more).toBeGreaterThan(0);
    expect(f.shown + f.more).toBe(10);
    expect((f.shown + 1) * (LINE_MIN + 1) - 1).toBeLessThanOrEqual(40);
  });
  it('DL4 many dots shrink to the cell width, never below the floor', () => {
    const d = dotSize(LINE_MAX, 8, 40);
    expect(d * 8 + 7).toBeLessThanOrEqual(40);
    expect(d).toBeGreaterThanOrEqual(DOT_MIN);
    expect(dotSize(LINE_MAX, 30, 40)).toBe(DOT_MIN);
    expect(dotSize(LINE_MAX, 1, 40)).toBe(Math.round(LINE_MAX * 0.6));
  });
  it('DL5 no room: only +N of all', () => {
    expect(fitLines(0, 3)).toEqual({ lineH: LINE_MIN, shown: 0, more: 3 });
  });
});
