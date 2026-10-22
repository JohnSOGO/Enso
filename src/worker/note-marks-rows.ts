// SPEC §8.4a, §4.2zzi — the note_marks table: the home AI's marks remembered by the notes text's SHA-256. A remembered
// answer is re-checked against the text on read (rawMarksOf + validMarks), so a stale or bad row is a miss; a store
// keeps only a list with marks and drops rows older than NOTE_MARKS_KEEP_DAYS in the same batch. Never holds or logs
// the notes text; never asks SogoAI, never decides which marks stand. No Hono.
import { NOTE_MARKS_KEEP_DAYS, rawMarksOf, validMarks, type FoundMark } from '../shared/note-marks';
import { sha256hex } from './session';

/** The remembered marks that still stand for this exact text, or null (no row, bad JSON, none standing). */
export async function rememberedMarks(db: D1Database, text: string): Promise<FoundMark[] | null> {
  const row = await db.prepare('SELECT marks FROM note_marks WHERE text_hash = ?').bind(await sha256hex(text)).first<{ marks: string }>();
  if (!row) return null;
  let stored: unknown;
  try { stored = JSON.parse(row.marks); } catch { return null; }
  const marks = validMarks(text, rawMarksOf(stored));
  return marks.length ? marks : null;
}

/** Remembers a text's marks (nothing for none) and drops answers stored over NOTE_MARKS_KEEP_DAYS before `now`.
 *  A failed write is logged (never the text) and the answer still goes out. */
export async function rememberMarks(db: D1Database, text: string, marks: FoundMark[], now: string): Promise<void> {
  if (!marks.length) return;
  const before = new Date(Date.parse(now) - NOTE_MARKS_KEEP_DAYS * 86_400_000).toISOString();
  try {
    await db.batch([
      db.prepare('INSERT OR REPLACE INTO note_marks (text_hash, marks, created_at) VALUES (?, ?, ?)')
        .bind(await sha256hex(text), JSON.stringify(marks), now),
      db.prepare('DELETE FROM note_marks WHERE created_at < ?').bind(before),
    ]);
  } catch (e) {
    console.error('note_marks: not remembered:', e instanceof Error ? e.message : String(e));
  }
}
