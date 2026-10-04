// SPEC §7.6 — the one-emoji rule: an event's emoji is one grapheme of emoji presentation
// within a byte cap. Pure; imports nothing.

export const EMOJI_MAX_BYTES = 16;

// Not \p{Emoji} (lets "1" and "#" through) nor \p{Emoji_Presentation} (rejects 🗑️ = U+1F5D1 U+FE0F).
const EMOJI_START = /^[\p{Extended_Pictographic}\p{Regional_Indicator}]/u;

/** null when `v` is a single emoji, else a message for the person. */
export function emojiError(v: unknown): string | null {
  const msg = 'Emoji must be a single emoji, like 🧹.';
  if (typeof v !== 'string' || v.length === 0) return msg;
  if (new TextEncoder().encode(v).length > EMOJI_MAX_BYTES) return msg;
  const graphemes = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(v)];
  if (graphemes.length !== 1) return msg;
  return EMOJI_START.test(v) ? null : msg;
}
