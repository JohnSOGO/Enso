// SPEC §7A.3 — naming a snapped item at home: one photo → one POST to LM Studio's OpenAI-compatible chat endpoint on
// SogoAI (127.0.0.1:1234), asking the local vision model IDENTIFY_MODEL with IDENTIFY_PROMPT + " /no_think" and the
// image as a data URL → an IdentifyReport. Never throws and never decides: the model's raw text goes back as it came,
// and the Worker cleans it (cleanItemName). Node globals and src/shared/item-reading.ts only (§2.5).
import { IDENTIFY_PROMPT, type IdentifyReport } from '../src/shared/item-reading';

export const LM_STUDIO_URL = 'http://127.0.0.1:1234/v1/chat/completions';
/** ⚑ Q114 — how long the helper waits for LM Studio. */
export const IDENTIFY_TIMEOUT_MS = 15_000;
/** Asks the local model not to think — qwen3.6 thinks anyway (found 2026-10-04), hence IDENTIFY_MAX_TOKENS. */
export const NO_THINK = ' /no_think';

const BODY_MAX = 200;
/** Room for the model's thinking AND the answer: at 100 it was cut off mid-thought with an empty answer every time,
 * which silently sent every photo to the paid Claude fallback. ~400 tokens of thinking measured; 1024 leaves room. */
export const IDENTIFY_MAX_TOKENS = 1024;

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
  stream: false,
});

/** One photo → the model's text, or an honest failure: `off` without IDENTIFY_MODEL, else `failed` with the reason. */
export async function identify(photo: Uint8Array, type: string, deps: IdentifyDeps): Promise<IdentifyReport> {
  if (!deps.model) return { ok: false, kind: 'off', reason: "IDENTIFY_MODEL isn't set on SogoAI." };
  try {
    const res = await deps.fetch(LM_STUDIO_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(identifyPayload(deps.model, photo, type)),
      signal: AbortSignal.timeout(IDENTIFY_TIMEOUT_MS),
    });
    const text = await res.text().catch(() => '');
    if (res.status < 200 || res.status >= 300) return { ok: false, kind: 'failed', reason: `LM Studio HTTP ${res.status}: ${text.slice(0, BODY_MAX)}` };
    let content: unknown;
    let finish: unknown;
    try {
      const choice = (JSON.parse(text) as { choices?: { finish_reason?: unknown; message?: { content?: unknown } }[] })?.choices?.[0];
      content = choice?.message?.content; finish = choice?.finish_reason;
    } catch { /* not JSON */ }
    if (finish === 'length' && typeof content === 'string' && !content.trim()) {
      return { ok: false, kind: 'failed', reason: 'The local model ran out of room before it answered.' };
    }
    return typeof content === 'string'
      ? { ok: true, text: content }
      : { ok: false, kind: 'failed', reason: 'LM Studio answered in an unexpected shape.' };
  } catch (e) {
    return { ok: false, kind: 'failed', reason: `LM Studio error: ${e instanceof Error && e.message ? e.message : String(e)}` };
  }
}
