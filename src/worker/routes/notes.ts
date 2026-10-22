// SPEC §8.4a — POST /notes/marks: the home AI's highlights for the notes text the sheet shows. Member only; a blank
// text or one over NOTE_MARKS_TEXT_MAX → 400. A remembered answer for this exact text (note-marks-rows.ts) answers at
// once, without the home; else no helper settings → patterns ('unset'); else SogoAI's marks through noteMarksFromHome,
// kept by validMarks and remembered when any stand, or why the sheet keeps its patterns. 200 every time, never a 5xx
// for a home failure. Only the marks are stored, under the text's hash; nothing counted; the notes never logged.
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { NOTE_MARKS_TEXT_MAX, validMarks, type NoteMarks } from '../../shared/note-marks';
import { nowIso } from '../db';
import { body, fail } from '../http';
import { requireMember } from '../session';
import { homeCaptionsConfigOf, noteMarksFromHome } from '../home-captions';
import { rememberMarks, rememberedMarks } from '../note-marks-rows';

export const notes = new Hono<AppEnv>();

notes.post('/notes/marks', requireMember, async (c) => {
  const b = await body(c);
  const text = typeof b.text === 'string' ? b.text : '';
  if (!text.trim()) return fail(c, 400, 'invalid_input', 'There are no notes to mark.');
  if (text.length > NOTE_MARKS_TEXT_MAX) return fail(c, 400, 'invalid_input', `Notes can be at most ${NOTE_MARKS_TEXT_MAX} characters.`);
  const remembered = await rememberedMarks(c.env.DB, text);
  if (remembered) return c.json<NoteMarks>({ via: 'sogoai', marks: remembered });
  const cfg = homeCaptionsConfigOf(c.env);
  if (!cfg) return c.json<NoteMarks>({ via: 'patterns', why: 'unset', reason: "SogoAI isn't set up." });
  const r = await noteMarksFromHome(cfg, text);
  if (!r.ok) return c.json<NoteMarks>({ via: 'patterns', why: r.kind, reason: r.reason });
  const marks = validMarks(text, r.marks);
  await rememberMarks(c.env.DB, text, marks, nowIso());
  return c.json<NoteMarks>({ via: 'sogoai', marks });
});
