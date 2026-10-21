// SPEC §8.4a — what stands out in a notes text, read at home: no IDENTIFY_MODEL → `off`; the PC model manager first
// (model-manager.ts: only a loaded, idle model is asked), then one LM Studio call (lm-studio.ts) with NOTE_MARKS_PROMPT,
// temperature 0 and the json_schema answer → a NoteMarksReport with the model's marks as it gave them (the Worker's
// validMarks decides which stand). Unlike identify.ts (which may load its model on demand, ttl Q317) this never sends
// a ttl, so LM Studio never loads or unloads for it. Never throws, never logs or keeps the notes. Node globals,
// siblings and src/shared/note-marks.ts only (§2.5).
import { NOTE_MARKS_PROMPT, NOTE_MARKS_SCHEMA, parseNoteMarksReport, type NoteMarksReport } from '../src/shared/note-marks';
import { chatCompletion } from './lm-studio';
import { modelReady } from './model-manager';

/** ⚑ Q370 — how long the helper waits for LM Studio. */
export const NOTE_MARKS_TIMEOUT_MS = 15_000;
/** Room for every mark of a 2000-character note. */
export const NOTE_MARKS_MAX_TOKENS = 2048;

export interface NoteMarksDeps {
  /** IDENTIFY_MODEL from the helper's env; unset or empty → `off`. */
  model: string | undefined;
  fetch: typeof fetch;
}

/** The one LM Studio request: the prompt as the system message, the notes as the user's, no ttl. */
export const noteMarksPayload = (model: string, text: string) => ({
  model,
  messages: [{ role: 'system', content: NOTE_MARKS_PROMPT }, { role: 'user', content: text }],
  temperature: 0,
  max_tokens: NOTE_MARKS_MAX_TOKENS,
  response_format: NOTE_MARKS_SCHEMA,
  stream: false,
});

/** One notes text → the model's marks, or an honest failure: `off`, `busy` or `failed`, each with its reason. */
export async function noteMarks(text: string, deps: NoteMarksDeps): Promise<NoteMarksReport> {
  if (!deps.model) return { ok: false, kind: 'off', reason: "IDENTIFY_MODEL isn't set on SogoAI." };
  const ready = await modelReady(deps.model, { fetch: deps.fetch });
  if (!ready.ok) return ready;
  const r = await chatCompletion(noteMarksPayload(deps.model, text), { timeoutMs: NOTE_MARKS_TIMEOUT_MS, fetch: deps.fetch });
  if (!r.ok) return { ok: false, kind: 'failed', reason: r.reason };
  let answer: unknown;
  try { answer = JSON.parse(r.content); } catch { return { ok: false, kind: 'failed', reason: 'The local model answered something that is not JSON.' }; }
  const report = parseNoteMarksReport({ ok: true, marks: (answer as { marks?: unknown } | null)?.marks });
  return typeof report === 'string' ? { ok: false, kind: 'failed', reason: `The local model's answer: ${report}` } : report;
}
