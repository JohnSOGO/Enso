// SPEC §8.4a — editing a notes text as lines (NE1–NE6): the • ☐ ☑ marks are plain characters in the text, so they
// count toward the notes limit and the house, push and Ensō button read them as written. Pure, no React, no DOM.

export const BULLET = '• ';
export const BOX = '☐ ';
export const TICKED = '☑ ';

/** The text after an edit, with the selection to put back. */
export interface Edit { text: string; start: number; end: number }

const prefixOf = (line: string) => [BULLET, BOX, TICKED].find((p) => line.startsWith(p)) ?? '';

/** NE1–NE2: every line the selection touches gets `prefix`, or loses it when all of them already have it (☐ and ☑ count as a box). */
function toggle(text: string, start: number, end: number, prefix: string): Edit {
  const from = text.lastIndexOf('\n', start - 1) + 1;
  const nl = text.indexOf('\n', end);
  const to = nl < 0 ? text.length : nl;
  const lines = text.slice(from, to).split('\n');
  const has = (l: string) => (prefix === BULLET ? prefixOf(l) === BULLET : prefixOf(l) === BOX || prefixOf(l) === TICKED);
  const off = lines.every(has);
  const next = lines.map((l) => (off ? '' : prefix) + l.slice(prefixOf(l).length));
  const block = next.join('\n');
  // The cursor stays where it was on its line; a selection covers the changed lines.
  const shift = next[0].length - lines[0].length;
  const out = text.slice(0, from) + block + text.slice(to);
  return start === end
    ? { text: out, start: Math.max(from, start + shift), end: Math.max(from, start + shift) }
    : { text: out, start: from, end: from + block.length };
}

export const toggleBullet = (text: string, start: number, end: number) => toggle(text, start, end, BULLET);
export const toggleBox = (text: string, start: number, end: number) => toggle(text, start, end, BOX);

/** NE3: line `n` (from 0) flips ☐ ↔ ☑; any other line is left alone. */
export function tickLine(text: string, n: number): string {
  const lines = text.split('\n');
  const l = lines[n];
  if (l === undefined) return text;
  if (l.startsWith(BOX)) lines[n] = TICKED + l.slice(BOX.length);
  else if (l.startsWith(TICKED)) lines[n] = BOX + l.slice(TICKED.length);
  return lines.join('\n');
}

/** NE4–NE5: Enter on a • or ☐ line starts the next line with the same mark (a ☑ line starts a ☐ one); on a line that is only the mark, the mark goes and the list ends. null = a plain Enter. */
export function continueList(text: string, at: number): Edit | null {
  const from = text.lastIndexOf('\n', at - 1) + 1;
  const prefix = prefixOf(text.slice(from));
  if (!prefix || at < from + prefix.length) return null;
  const nl = text.indexOf('\n', from);
  const lineEnd = nl < 0 ? text.length : nl;
  if (text.slice(from, lineEnd) === prefix) return { text: text.slice(0, from) + text.slice(from + prefix.length), start: from, end: from };
  const next = `\n${prefix === TICKED ? BOX : prefix}`;
  return { text: text.slice(0, at) + next + text.slice(at), start: at + next.length, end: at + next.length };
}
