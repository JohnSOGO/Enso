// NA1, NA2 (SPEC §8.4a) — which of the home AI's marks stand (validMarks, parseNoteMarksReport) and how they lie over
// the patterns (mergeMarks); and every kind markNotes can emit is in NOTE_MARK (found by CALLING it).
import { describe, expect, it } from 'vitest';
import { NOTE_MARKS_MAX, NOTE_MARK_TEXT_MAX, parseNoteMarksReport, validMarks } from '../src/shared/note-marks';
import { NOTE_MARK } from '../src/shared/vocab';
import { markNotes, mergeMarks } from '../frontend/src/notes-marks';

const NOTES = "Party at Jake's, 412 Oak Ridge Rd. Starts 3:30.\nSam's allergy is peanuts. Call 760-555-0142.\nSam's allergy is peanuts!";

describe('NA1 validMarks', () => {
  it('keeps exact copies on one line; drops what is not in the text, crosses a line, is empty, unknown or repeated', () => {
    const got = validMarks(NOTES, [
      { text: "Sam's allergy is peanuts", kind: 'key' },
      { text: '  Starts 3:30 ', kind: 'time' }, // trimmed, then found
      { text: 'Grandma drives', kind: 'key' }, // not in the notes
      { text: 'Starts 3:30.\nSam', kind: 'key' }, // across a line break
      { text: '   ', kind: 'key' },
      { text: '412 Oak Ridge Rd', kind: 'street' }, // not a NOTE_MARK
      { text: "Sam's allergy is peanuts", kind: 'date' }, // a repeat
      { text: 'x'.repeat(NOTE_MARK_TEXT_MAX + 1), kind: 'key' },
    ]);
    expect(got).toEqual([{ text: "Sam's allergy is peanuts", kind: 'key' }, { text: 'Starts 3:30', kind: 'time' }]);
  });

  it(`keeps at most ${NOTE_MARKS_MAX}`, () => {
    const text = Array.from({ length: NOTE_MARKS_MAX + 5 }, (_, i) => `w${i}`).join(' ');
    const marks = text.split(' ').map((w) => ({ text: w, kind: 'key' }));
    expect(validMarks(text, marks)).toHaveLength(NOTE_MARKS_MAX);
  });

  it('parseNoteMarksReport: ok keeps only { text, kind } strings; a failure needs a kind and a reason', () => {
    expect(parseNoteMarksReport({ ok: true, marks: [{ text: 'a', kind: 'key', extra: 1 }, { text: 1, kind: 'key' }, null] }))
      .toEqual({ ok: true, marks: [{ text: 'a', kind: 'key' }] });
    expect(parseNoteMarksReport({ ok: false, kind: 'busy', reason: ' photo-polish is loading ' }))
      .toEqual({ ok: false, kind: 'busy', reason: 'photo-polish is loading' });
    expect(typeof parseNoteMarksReport({ ok: true })).toBe('string');
    expect(typeof parseNoteMarksReport({ ok: false, kind: 'nope', reason: 'x' })).toBe('string');
    expect(typeof parseNoteMarksReport({ ok: false, kind: 'off', reason: '' })).toBe('string');
    expect(typeof parseNoteMarksReport([])).toBe('string');
  });
});

describe('NA2 mergeMarks', () => {
  const line = "Sam's allergy is peanuts. Call 760-555-0142. Sam's allergy is peanuts!";

  it('the pieces join back; the AI leads at every place its phrase appears; the patterns fill the gaps', () => {
    const segs = mergeMarks(line, [{ text: "Sam's allergy is peanuts", kind: 'key' }]);
    expect(segs.map((s) => s.text).join('')).toBe(line);
    expect(segs.filter((s) => s.mark)).toEqual([
      { text: "Sam's allergy is peanuts", mark: 'key' },
      { text: '760-555-0142', mark: 'phone' },
      { text: "Sam's allergy is peanuts", mark: 'key' },
    ]);
  });

  it('an AI mark wins over a pattern it overlaps', () => {
    const segs = mergeMarks('Call 760-555-0142 after 6pm', [{ text: 'Call 760-555-0142', kind: 'key' }]);
    expect(segs.filter((s) => s.mark)).toEqual([{ text: 'Call 760-555-0142', mark: 'key' }, { text: '6pm', mark: 'time' }]);
  });

  it('with no AI marks it is markNotes', () => {
    for (const l of NOTES.split('\n')) expect(mergeMarks(l, [])).toEqual(markNotes(l));
  });

  it('every kind markNotes can emit is in NOTE_MARK', () => {
    const all = 'At 6pm on Oct 25th call 760-555-0142, pay $25, see https://example.com or a@b.co at 12 Main St. Bring cake';
    const kinds = new Set(markNotes(all).flatMap((s) => (s.mark ? [s.mark] : [])));
    expect([...kinds].sort()).toEqual([...NOTE_MARK].sort());
  });
});
