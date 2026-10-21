// SPEC §8.4a — what stands out in a notes text (NH1–NH6): pure, no React, no DOM. The list marks are notes-edit.ts.
import { webLink } from '../../src/shared/things';

export type Mark = 'time' | 'date' | 'phone' | 'money' | 'link' | 'email' | 'address' | 'key';
export interface Seg { text: string; mark: Mark | null }

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

/** NH1–NH6: the notes cut into plain and highlighted pieces; joined, they are the notes again. Overlaps: the first to start wins, then the longer. */
export function markNotes(text: string): Seg[] {
  const found: { start: number; end: number; mark: Mark; rank: number }[] = [];
  RULES.forEach(([mark, re], rank) => {
    for (const m of text.matchAll(re)) found.push({ start: m.index!, end: m.index! + m[0].length, mark, rank });
  });
  found.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start) || a.rank - b.rank);
  const segs: Seg[] = [];
  let at = 0;
  for (const f of found) {
    if (f.start < at) continue;
    if (f.start > at) segs.push({ text: text.slice(at, f.start), mark: null });
    segs.push({ text: text.slice(f.start, f.end), mark: f.mark });
    at = f.end;
  }
  if (at < text.length) segs.push({ text: text.slice(at), mark: null });
  return segs;
}

/** NH6 — where a tapped highlight goes: a phone rings, a link opens (only through §7C.1 `webLink`); anything else stays text. */
export function markHref(seg: Seg): string | null {
  if (seg.mark === 'phone') return `tel:${seg.text.replace(/[^\d+]/g, '')}`;
  if (seg.mark === 'link') return webLink(seg.text);
  return null;
}
