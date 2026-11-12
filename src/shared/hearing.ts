// SPEC §8.18 part 2 ⚑ Q378 ⚑ Q408 — a recorded clip to write down: its types and bounds, the hotwords sent with it, and the
// helper's HearReport and its check. Pure; one of the repo files home/ may import. Never decides who is asked.

/** The types phones record, and the size and length bounds a clip is held to. */
export const SAY_AUDIO_TYPES = ['audio/mp4', 'audio/webm', 'audio/ogg', 'audio/wav'] as const;
export const SAY_AUDIO_MAX_BYTES = 2 * 1024 * 1024;
export const SAY_CLIP_MAX_MS = 60_000;

/** ⚑ Q408 — the language the home Whisper is told the family speaks. */
export const HEAR_LANGUAGE = 'en';
/** At most this many hotwords (the family's names) go with a clip; each at most HEAR_HOTWORD_MAX characters. */
export const HEAR_HOTWORDS_MAX = 20;
export const HEAR_HOTWORD_MAX = 40;
/** The longest words and reason a helper answer may carry (a minute of talk is ~1,000 characters). */
export const HEAR_TEXT_MAX = 4000;
export const HEAR_REASON_MAX = 300;

/** What the helper's POST /hear answers (§8.18 part 2): the words, or why not. */
export type HearReport = { ok: true; text: string } | { ok: false; reason: string };

/** Names → hotwords: trimmed, cut to HEAR_HOTWORD_MAX, empty and repeated (any case) dropped, the first HEAR_HOTWORDS_MAX. */
export function hotwordsOf(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    const w = n.trim().slice(0, HEAR_HOTWORD_MAX).trim();
    if (!w || seen.has(w.toLowerCase())) continue;
    seen.add(w.toLowerCase());
    out.push(w);
    if (out.length === HEAR_HOTWORDS_MAX) break;
  }
  return out;
}

/** A helper answer → a HearReport (an ok one with its words trimmed, never empty), or why it isn't one. */
export function parseHearReport(v: unknown): HearReport | string {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return 'The helper answered something that is not a hearing.';
  const r = v as Record<string, unknown>;
  if (r.ok === true) {
    const text = typeof r.text === 'string' ? r.text.replace(/\s+/g, ' ').trim() : '';
    if (!text) return 'The helper heard no words.';
    return { ok: true, text: text.slice(0, HEAR_TEXT_MAX) };
  }
  if (r.ok === false && typeof r.reason === 'string' && r.reason.trim()) return { ok: false, reason: r.reason.trim().slice(0, HEAR_REASON_MAX) };
  return 'The helper answered something that is not a hearing.';
}
