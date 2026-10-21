// SPEC §7A.3 — naming a snapped item at home: one photo → one LM Studio call (lm-studio.ts), asking the local vision
// model IDENTIFY_MODEL with IDENTIFY_PROMPT + " /no_think" and the image as a data URL → an IdentifyReport. Never throws
// and never decides: the model's raw text goes back as it came, and the Worker cleans it (cleanItemName). Node globals,
// lm-studio.ts and src/shared/item-reading.ts only (§2.5).
import { IDENTIFY_PROMPT, type IdentifyReport } from '../src/shared/item-reading';
import { chatCompletion } from './lm-studio';

export { LM_STUDIO_URL } from './lm-studio';

/** ⚑ Q114 — how long the helper waits for LM Studio. */
export const IDENTIFY_TIMEOUT_MS = 15_000;
/** Asks the local model not to think — qwen3.6 thinks anyway (found 2026-10-04), hence IDENTIFY_MAX_TOKENS. */
export const NO_THINK = ' /no_think';

/** Room for the model's thinking AND the answer: at 100 it was cut off mid-thought with an empty answer every time,
 * which silently sent every photo to the paid Claude fallback. ~400 tokens of thinking measured; 1024 leaves room. */
export const IDENTIFY_MAX_TOKENS = 1024;
/** ⚑ Q317 — seconds LM Studio keeps the model it loaded on demand after the last photo, so it isn't reloaded each time. */
export const IDENTIFY_TTL_S = 86_400;

export interface IdentifyDeps {
  /** IDENTIFY_MODEL from the helper's env; unset or empty → `off`. */
  model: string | undefined;
  fetch: typeof fetch;
}

function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** The one LM Studio request: the prompt and the image in one user message, temperature 0. */
export const identifyPayload = (model: string, photo: Uint8Array, type: string) => ({
  model,
  messages: [{
    role: 'user',
    content: [
      { type: 'text', text: IDENTIFY_PROMPT + NO_THINK },
      { type: 'image_url', image_url: { url: `data:${type};base64,${base64(photo)}` } },
    ],
  }],
  temperature: 0,
  max_tokens: IDENTIFY_MAX_TOKENS,
  ttl: IDENTIFY_TTL_S,
  stream: false,
});

/** One photo → the model's text, or an honest failure: `off` without IDENTIFY_MODEL, else `failed` with the reason. */
export async function identify(photo: Uint8Array, type: string, deps: IdentifyDeps): Promise<IdentifyReport> {
  if (!deps.model) return { ok: false, kind: 'off', reason: "IDENTIFY_MODEL isn't set on SogoAI." };
  const r = await chatCompletion(identifyPayload(deps.model, photo, type), { timeoutMs: IDENTIFY_TIMEOUT_MS, fetch: deps.fetch });
  return r.ok ? { ok: true, text: r.content } : { ok: false, kind: 'failed', reason: r.reason };
}
