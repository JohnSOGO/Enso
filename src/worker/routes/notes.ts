// SPEC §8.4a — POST /notes/marks: the home AI's highlights for the notes text the sheet shows. Member only; a blank
// text or one over NOTE_MARKS_TEXT_MAX → 400. No helper settings → patterns ('unset'); else SogoAI's marks through
// noteMarksFromHome, kept by validMarks, or why the sheet keeps its patterns. 200 every time, never a 5xx for a home
// failure. Nothing stored or counted; the notes are never logged.
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { NOTE_MARKS_TEXT_MAX, validMarks, type NoteMarks } from '../../shared/note-marks';
import { body, fail } from '../http';
import { requireMember } from '../session';
import { homeCaptionsConfigOf, noteMarksFromHome } from '../home-captions';

export const notes = new Hono<AppEnv>();

notes.post('/notes/marks', requireMember, async (c) => {
  const b = await body(c);
  const text = typeof b.text === 'string' ? b.text : '';
  if (!text.trim()) return fail(c, 400, 'invalid_input', 'There are no notes to mark.');
  if (text.length > NOTE_MARKS_TEXT_MAX) return fail(c, 400, 'invalid_input', `Notes can be at most ${NOTE_MARKS_TEXT_MAX} characters.`);
  const cfg = homeCaptionsConfigOf(c.env);
  if (!cfg) return c.json<NoteMarks>({ via: 'patterns', why: 'unset', reason: "SogoAI isn't set up." });
  const r = await noteMarksFromHome(cfg, text);
  if (!r.ok) return c.json<NoteMarks>({ via: 'patterns', why: r.kind, reason: r.reason });
  return c.json<NoteMarks>({ via: 'sogoai', marks: validMarks(text, r.marks) });
});
