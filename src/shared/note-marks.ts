// SPEC §8.4a — what stands out in a notes text, asked of SogoAI (pure): the prompt and the json_schema the helper
// sends LM Studio, the helper's report and its check, which of the model's marks stand (validMarks), and the answer
// of POST /notes/marks. Imports vocab and alert-limits only. Shared by the Worker, the PWA and home/ (§2.5).
import { EVENT_NOTES_MAX } from './alert-limits';
import {
  NOTE_MARK, NOTE_MARKS_FAILURE, isOneOf, type NoteMark, type NoteMarksFailure, type NoteMarksWhy,
} from './vocab';

/** The longest notes text asked about: an event's notes (a list item's NOTE_MAX is shorter). */
export const NOTE_MARKS_TEXT_MAX = EVENT_NOTES_MAX;
/** The longest phrase one mark may hold. */
export const NOTE_MARK_TEXT_MAX = 200;
/** At most this many marks stand for one text. */
export const NOTE_MARKS_MAX = 60;
/** A failure's reason is cut to this many characters. */
export const NOTE_MARKS_REASON_MAX = 200;
/** How many raw marks a report may carry before validMarks looks at them. */
const RAW_MARKS_MAX = 200;

/** The system message the helper sends with the notes as the user message. */
export const NOTE_MARKS_PROMPT =
  "You mark what matters in a family's calendar and list notes so it stands out. Return every short phrase a busy " +
  'parent would need to see at a glance: times, dates, phone numbers, money, links, emails, addresses, and key facts ' +
  '(what to bring, codes, allergies, who picks up or drives, deadlines). Copy each phrase EXACTLY as it appears in ' +
  'the notes, character for character, on one line, a few words at most, never a whole paragraph. ' +
  `kind is one of: ${NOTE_MARK.join(', ')}.`;

/** LM Studio's response_format: the answer must be { marks: [{ text, kind }] }. */
export const NOTE_MARKS_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'note_marks',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        marks: {
          type: 'array',
          items: {
            type: 'object',
            properties: { text: { type: 'string' }, kind: { type: 'string', enum: [...NOTE_MARK] } },
            required: ['text', 'kind'],
          },
        },
      },
      required: ['marks'],
    },
  },
} as const;

/** One mark as the model gave it: not yet checked against the notes. */
export interface RawMark { text: string; kind: string }
/** One mark that stands: an exact phrase of the notes and its kind. */
export interface FoundMark { text: string; kind: NoteMark }

/** What the SogoAI helper's POST /note-marks answers (§8.4a). */
export type NoteMarksReport = { ok: true; marks: RawMark[] } | { ok: false; kind: NoteMarksFailure; reason: string };

/** POST /notes/marks's answer: the marks that stand, or why the sheet keeps its patterns. */
export type NoteMarks = { via: 'sogoai'; marks: FoundMark[] } | { via: 'patterns'; why: NoteMarksWhy; reason: string };

const cut = (s: string, max: number) => s.trim().slice(0, max);

/** The helper's answer (through JSON) → checked, or a message saying what is wrong with it. Marks that aren't
 *  { text, kind } strings are dropped here; validMarks decides the rest. */
export function parseNoteMarksReport(body: unknown): NoteMarksReport | string {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'The answer must be a note-marks report.';
  const r = body as Record<string, unknown>;
  if (r.ok === true) {
    if (!Array.isArray(r.marks)) return 'marks must be a list.';
    const marks = r.marks.slice(0, RAW_MARKS_MAX).filter((m): m is RawMark =>
      !!m && typeof m === 'object' && typeof (m as RawMark).text === 'string' && typeof (m as RawMark).kind === 'string');
    return { ok: true, marks: marks.map(({ text, kind }) => ({ text, kind })) };
  }
  if (r.ok !== false) return 'ok must be true or false.';
  if (!isOneOf(NOTE_MARKS_FAILURE, r.kind)) return `kind must be one of: ${NOTE_MARKS_FAILURE.join(', ')}.`;
  const reason = typeof r.reason === 'string' ? cut(r.reason, NOTE_MARKS_REASON_MAX) : '';
  return reason ? { ok: false, kind: r.kind, reason } : 'reason must be non-empty text.';
}

/** NA1 — the marks that stand: a NOTE_MARK kind, a non-empty phrase (trimmed) found exactly in the notes on one
 *  line, at most NOTE_MARK_TEXT_MAX; a repeated phrase once (its first kind); at most NOTE_MARKS_MAX. */
export function validMarks(text: string, marks: readonly RawMark[]): FoundMark[] {
  const kept: FoundMark[] = [];
  const seen = new Set<string>();
  for (const m of marks) {
    const phrase = m.text.trim();
    if (!phrase || phrase.length > NOTE_MARK_TEXT_MAX || phrase.includes('\n')) continue;
    if (!isOneOf(NOTE_MARK, m.kind) || seen.has(phrase) || !text.includes(phrase)) continue;
    seen.add(phrase);
    kept.push({ text: phrase, kind: m.kind });
    if (kept.length === NOTE_MARKS_MAX) break;
  }
  return kept;
}
