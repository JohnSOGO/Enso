// SPEC §7.9b — saved places, the household's address book: limits, the wire type, cleanPlace (a POST/PATCH body →
// the place's fields), matchPlace (which place an event names) and placeOverForm (a place's address and arrival notes
// onto a form). Pure; imports alert-limits only. The Worker validates with it and the PWA fills with it.
import { EVENT_ADDRESS_MAX, EVENT_NOTES_MAX } from './alert-limits';

export const PLACES_MAX = 100;
export const PLACE_NAME_MAX = 60;
export const PLACE_NOTES_MAX = 500;
export const PLACE_WORDS_MAX = 5;
export const PLACE_WORD_MIN = 3;
export const PLACE_WORD_MAX = 40;

/** A place as the API sends it. */
export interface Place { id: string; name: string; address: string; notes: string | null; words: string[]; createdBy: string | null; updatedAt: string }

export interface PlaceInput { name: string; address: string; notes: string | null; words: string[] }

const req = (v: unknown, field: string, max: number): string | { error: string } => {
  const t = typeof v === 'string' ? v.trim() : '';
  return t && t.length <= max ? t : { error: `${field} must be 1–${max} characters.` };
};

/** POST/PATCH /places body → the place's fields, or a message naming the field. `current` fills what a PATCH leaves out. */
export function cleanPlace(b: Record<string, unknown>, current?: PlaceInput): PlaceInput | string {
  const pick = <K extends keyof PlaceInput>(k: K) => (b[k] === undefined && current ? current[k] : b[k]);
  const name = req(pick('name'), 'name', PLACE_NAME_MAX);
  if (typeof name !== 'string') return name.error;
  const address = req(pick('address'), 'address', EVENT_ADDRESS_MAX);
  if (typeof address !== 'string') return address.error;
  const rawNotes = pick('notes');
  if (rawNotes !== null && rawNotes !== undefined && typeof rawNotes !== 'string') return 'notes must be text.';
  const notes = typeof rawNotes === 'string' ? rawNotes.trim() || null : null;
  if (notes && notes.length > PLACE_NOTES_MAX) return `notes can be at most ${PLACE_NOTES_MAX} characters.`;
  const rawWords = pick('words') ?? [];
  if (!Array.isArray(rawWords) || !rawWords.every((w) => typeof w === 'string')) return 'words must be a list of text.';
  const seen = new Set<string>(), words: string[] = [];
  for (const w of (rawWords as string[]).map((x) => x.trim()).filter(Boolean)) {
    if (w.length < PLACE_WORD_MIN || w.length > PLACE_WORD_MAX) return `words: each must be ${PLACE_WORD_MIN}–${PLACE_WORD_MAX} characters.`;
    if (seen.has(w.toLowerCase())) continue;
    seen.add(w.toLowerCase());
    words.push(w);
  }
  if (words.length > PLACE_WORDS_MAX) return `words: a place has at most ${PLACE_WORDS_MAX}.`;
  return { name, address, notes, words };
}

/** The place an event names: one of its words or its name anywhere in a text, ignoring case; the longest matching
 *  word wins, then the name A–Z (⚑ Q366). */
export function matchPlace<P extends Pick<Place, 'name' | 'words'>>(places: readonly P[], texts: readonly (string | null | undefined)[]): P | null {
  const hay = texts.filter((t): t is string => !!t).map((t) => t.toLowerCase());
  let best: { place: P; len: number } | null = null;
  for (const place of places) {
    for (const w of [...place.words, place.name]) {
      const word = w.toLowerCase();
      if (!hay.some((t) => t.includes(word))) continue;
      if (!best || word.length > best.len || (word.length === best.len && place.name.localeCompare(best.place.name) < 0)) best = { place, len: word.length };
    }
  }
  return best?.place ?? null;
}

/** §7.9b — the place's address into the form; its arrival notes added under the notes (never replacing them, and not
 *  twice), cut to `notesMax`. → the form and how many fields changed. */
export function placeOverForm<F extends { address: string; notes: string }>(form: F, place: Pick<Place, 'address' | 'notes'>, notesMax = EVENT_NOTES_MAX): { form: F; filled: number } {
  const next: F = { ...form, address: place.address };
  if (place.notes && !form.notes.includes(place.notes)) next.notes = (form.notes.trim() ? `${form.notes.trimEnd()}\n\n${place.notes}` : place.notes).slice(0, notesMax);
  return { form: next, filled: (next.address !== form.address ? 1 : 0) + (next.notes !== form.notes ? 1 : 0) };
}
