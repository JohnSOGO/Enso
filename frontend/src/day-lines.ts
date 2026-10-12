// SPEC §7.1 — the pure fit for a calendar day's event lines (emoji, then participant dots).
// Numbers in, layout out: no React, no DOM, no app state. Drawn by components/DayCell.tsx.

export const LINE_MAX = 13; // px, a line's height when there is room
export const LINE_MIN = 8; // px, the smallest it shrinks to before `+N`
export const LINE_GAP = 1; // px between lines
export const DOT_MIN = 3; // px, the smallest a participant dot gets
export const DOT_GAP = 1; // px between dots

export interface LinesFit { lineH: number; shown: number; more: number }

/** How `count` lines share `room` px: shrink from LINE_MAX to LINE_MIN, then show what fits and turn the last into `+N`. */
export function fitLines(room: number, count: number): LinesFit {
  if (count === 0) return { lineH: LINE_MAX, shown: 0, more: 0 };
  const each = Math.floor((room - (count - 1) * LINE_GAP) / count);
  if (each >= LINE_MIN) return { lineH: Math.min(LINE_MAX, each), shown: count, more: 0 };
  const fit = Math.floor((room + LINE_GAP) / (LINE_MIN + LINE_GAP));
  const shown = Math.max(0, fit - 1);
  return { lineH: LINE_MIN, shown, more: count - shown };
}

/** A line's dot size: about 60% of the line, shrunk so `dots` fit in `width` px, never below DOT_MIN. */
export function dotSize(lineH: number, dots: number, width: number): number {
  const base = Math.round(lineH * 0.6);
  if (dots <= 1) return base;
  return Math.max(DOT_MIN, Math.min(base, Math.floor((width - (dots - 1) * DOT_GAP) / dots)));
}
