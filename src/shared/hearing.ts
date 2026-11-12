// SPEC §8.18 part 2 ⚑ Q378 — a recorded clip to write down: its types and bounds. Pure; one of the repo files home/ may import.

/** The types phones record, and the size and length bounds a clip is held to. */
export const SAY_AUDIO_TYPES = ['audio/mp4', 'audio/webm', 'audio/ogg', 'audio/wav'] as const;
export const SAY_AUDIO_MAX_BYTES = 2 * 1024 * 1024;
export const SAY_CLIP_MAX_MS = 60_000;
