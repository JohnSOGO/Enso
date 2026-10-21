// SPEC §8.4a NH1–NH6 — what stands out in a notes text (frontend/src/notes-marks.ts).
// Loaded at run time like test/day-lines.test.ts: the Worker typecheck does not cover the PWA.
import { describe, expect, it } from 'vitest';

type Mark = 'time' | 'date' | 'phone' | 'money' | 'link' | 'email' | 'address' | 'key';
interface Seg { text: string; mark: Mark | null }
const MARKS = '../frontend/src/notes-marks.ts';
const { markNotes, markHref } = (await import(/* @vite-ignore */ MARKS)) as { markNotes: (t: string) => Seg[]; markHref: (s: Seg) => string | null };

const marked = (t: string) => markNotes(t).filter((s) => s.mark).map((s) => [s.mark, s.text]);

describe('highlights', () => {
  it('NH1 pieces join back to the notes; plain notes are one plain piece', () => {
    const t = 'Pick up Sam at 3:30 pm from 123 Main St.\nCall (760) 555-1234';
    expect(markNotes(t).map((s) => s.text).join('')).toBe(t);
    expect(markNotes('just words')).toEqual([{ text: 'just words', mark: null }]);
    expect(markNotes('')).toEqual([]);
  });
  it('NH2 times and dates', () => {
    expect(marked('Doors 6pm, starts 18:30 on Oct 25th, Saturday; or 10/26 noon')).toEqual([
      ['time', '6pm'], ['time', '18:30'], ['date', 'Oct 25th'], ['date', 'Saturday'], ['date', '10/26'], ['time', 'noon'],
    ]);
  });
  it('NH3 phone, money, email and link', () => {
    expect(marked('Call 760-555-1234 or (760) 555 9876. $25.50 each. a@b.com https://x.com/rsvp.')).toEqual([
      ['phone', '760-555-1234'], ['phone', '(760) 555 9876'], ['money', '$25.50'], ['email', 'a@b.com'], ['link', 'https://x.com/rsvp'],
    ]);
  });
  it('NH4 a street address', () => {
    expect(marked('Meet at 400 North Coast Hwy then lunch')).toEqual([['address', '400 North Coast Hwy']]);
  });
  it('NH5 a bring / RSVP / due line is marked to its end, swallowing what it holds', () => {
    expect(marked('Fun day\nBring sunscreen by 9am\nmore')).toEqual([['key', 'Bring sunscreen by 9am']]);
    expect(marked('RSVP to Ann')).toEqual([['key', 'RSVP to Ann']]);
  });
  it('NH6 tapping a highlight: a phone rings, a link opens through webLink; the rest stay text', () => {
    expect(markHref({ text: '(760) 555-1234', mark: 'phone' })).toBe('tel:7605551234');
    expect(markHref({ text: 'www.x.com', mark: 'link' })).toBe('https://www.x.com');
    expect(markHref({ text: 'https://x.com/a', mark: 'link' })).toBe('https://x.com/a');
    expect(markHref({ text: '1 Main St', mark: 'address' })).toBeNull();
    expect(markHref({ text: '6pm', mark: 'time' })).toBeNull();
  });
});
