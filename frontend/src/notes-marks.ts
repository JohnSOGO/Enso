// SPEC §8.4a — what stands out in a notes text (NH1–NH6, NA2): the patterns, and the home AI's marks laid over them;
// pure, no React, no DOM. The list marks are notes-edit.ts; asking the home AI is components/useNoteMarks.ts.
import { webLink } from '../../src/shared/things';
import type { FoundMark } from '../../src/shared/note-marks';
import type { NoteMark } from '../../src/shared/vocab';

export type Mark = NoteMark;
export interface Seg { text: string; mark: Mark | null }
interface Span { start: number; end: number; mark: Mark }

const MONTH = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const STREET = 'st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|ct|court|pl|place|pkwy|parkway|hwy|highway|cir|circle|ter|terrace';

/** In priority order: at the same start, the earlier rule wins a tie in length. */
const RULES: [Mark, RegExp][] = [
  ['link', /\b(?:https?:\/\/|www\.)[^\s<>]*[^\s<>.,;:!?'")\]]/gi],
  ['email', /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g],
  ['key', /\b(?:bring|don'?t forget|remember to|rsvp|deadline|due|important|gate code|door code|password|confirmation)\b[^\n]*/gi],
  ['phone', /(?:\+?1[\s.-]?)?(?:\(\d{3}\)\s?|\b\d{3}[\s.-])\d{3}[\s.-]\d{4}\b/g],
  ['money', /\$\s?\d[\d,]*(?:\.\d{2})?\b/g],
  ['address', new RegExp(`\\b\\d{1,6}\\s+(?:[A-Za-z0-9.'-]+\\s+){0,4}?(?:${STREET})\\b\\.?`, 'gi')],
  ['date', new RegExp(`\\b(?:${MONTH})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?\\b|\\b\\d{1,2}\\/\\d{1,2}(?:\\/\\d{2,4})?\\b|\\b(?:mon|tues|wednes|thurs|fri|satur|sun)day\\b|\\b(?:today|tomorrow|tonight)\\b`, 'gi')],
  ['time', /\b(?:[01]?\d|2[0-3]):[0-5]\d(?:\s?[ap]\.?m\.?)?(?![\w])|\b(?:1[0-2]|0?[1-9])\s?[ap]\.?m\.?(?![a-z])|\b(?:noon|midnight)\b/gi],
];

/** First to start wins, then the longer, then (patterns) the earlier rule. */
const order = (a: Span & { rank: number }, b: Span & { rank: number }) =>
  a.start - b.start || (b.end - b.start) - (a.end - a.start) || a.rank - b.rank;

/** Every pattern match, in order. */
function patternSpans(text: string) {
  const found: (Span & { rank: number })[] = [];
  RULES.forEach(([mark, re], rank) => {
    for (const m of text.matchAll(re)) found.push({ start: m.index!, end: m.index! + m[0].length, mark, rank });
  });
  return found.sort(order);
}

/** Every place each AI phrase appears, in order. */
function aiSpans(text: string, marks: readonly FoundMark[]) {
  const found: (Span & { rank: number })[] = [];
  marks.forEach(({ text: phrase, kind }, rank) => {
    for (let at = text.indexOf(phrase); phrase && at >= 0; at = text.indexOf(phrase, at + phrase.length)) {
      found.push({ start: at, end: at + phrase.length, mark: kind, rank });
    }
  });
  return found.sort(order);
}

/** Adds each span, in turn, that overlaps none already taken. */
function take(taken: Span[], spans: Span[]) {
  for (const f of spans) if (!taken.some((t) => f.start < t.end && t.start < f.end)) taken.push(f);
  return taken;
}

/** The taken spans → plain and highlighted pieces that join back into the text. */
function pieces(text: string, taken: Span[]): Seg[] {
  const segs: Seg[] = [];
  let at = 0;
  for (const f of [...taken].sort((a, b) => a.start - b.start)) {
    if (f.start > at) segs.push({ text: text.slice(at, f.start), mark: null });
    segs.push({ text: text.slice(f.start, f.end), mark: f.mark });
    at = f.end;
  }
  if (at < text.length) segs.push({ text: text.slice(at), mark: null });
  return segs;
}

/** NH1–NH6: the notes cut into plain and highlighted pieces; joined, they are the notes again. Overlaps: the first to start wins, then the longer. */
export const markNotes = (text: string): Seg[] => pieces(text, take([], patternSpans(text)));

/** NA2 (⚑ Q368): the home AI's marks lead, at every place each phrase appears; the patterns fill the gaps. With no AI
 *  marks this is markNotes. */
export const mergeMarks = (text: string, ai: readonly FoundMark[]): Seg[] =>
  pieces(text, take(take([], aiSpans(text, ai)), patternSpans(text)));

/** NH6 — where a tapped highlight goes: a phone rings, a link opens (only through §7C.1 `webLink`); anything else stays text. */
export function markHref(seg: Seg): string | null {
  if (seg.mark === 'phone') return `tel:${seg.text.replace(/[^\d+]/g, '')}`;
  if (seg.mark === 'link') return webLink(seg.text);
  return null;
}
