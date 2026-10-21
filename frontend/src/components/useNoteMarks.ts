// SPEC §8.4a — asking for a notes text's home-AI marks: POST /notes/marks once for each text read mode shows (only
// while `on`), each answer kept for its text, so a late answer for an earlier text never shows on a newer one; a
// failed request → patterns, 'failed'. No UI, no app state, never decides a mark (validMarks did, on the Worker).
import { useEffect, useRef, useState } from 'react';
import { errorText, post } from '../api';
import type { FoundMark, NoteMarks } from '../../../src/shared/note-marks';
import type { NoteMarksWhy } from '../../../src/shared/vocab';

export type NoteMarksView =
  | { state: 'asking'; marks: FoundMark[] }
  | { state: 'ai'; marks: FoundMark[] }
  | { state: 'patterns'; marks: FoundMark[]; why: NoteMarksWhy };

const NONE: FoundMark[] = [];

export function useNoteMarks(text: string, on: boolean): NoteMarksView | null {
  const answers = useRef(new Map<string, NoteMarks>());
  const [, setAnswered] = useState(0);

  useEffect(() => {
    if (!on || !text.trim() || answers.current.has(text)) return;
    let live = true;
    post<NoteMarks>('/notes/marks', { text }).then(
      (a) => a,
      (e: unknown): NoteMarks => ({ via: 'patterns', why: 'failed', reason: errorText(e) }),
    ).then((a) => {
      answers.current.set(text, a);
      if (live) setAnswered((n) => n + 1);
    });
    return () => { live = false; };
  }, [text, on]);

  if (!on || !text.trim()) return null;
  const a = answers.current.get(text);
  if (!a) return { state: 'asking', marks: NONE };
  return a.via === 'sogoai' ? { state: 'ai', marks: a.marks } : { state: 'patterns', marks: NONE, why: a.why };
}
