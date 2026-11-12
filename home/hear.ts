// SPEC §8.18 part 2 ⚑ Q408 — writing a recorded clip down at home: one POST to the PC model manager's speech-to-text
// (`/v1/audio/transcriptions`, Whisper large-v3-turbo on the gaming PC's GPU or SogoAI's CPU; the manager picks) with
// the clip as base64, `language` HEAR_LANGUAGE and the hotwords, named `X-Sogo-App: enso` → a HearReport, plus what was
// used (§9.4c) once the manager answered. Never throws, never logs or keeps the clip or the words. Node globals,
// src/shared/hearing.ts, model-usage.ts's type and its siblings only (§2.5); no node:http.
import { HEAR_LANGUAGE, HEAR_REASON_MAX, type HearReport } from '../src/shared/hearing';
import type { HomeUse } from '../src/shared/model-usage';
import { MODEL_MANAGER_URL } from './model-manager';
import { SOGO_APP_HEADERS } from './lm-studio';

export const TRANSCRIBE_URL = `${MODEL_MANAGER_URL}/v1/audio/transcriptions`;
/** ⚑ Q409 — how long the helper waits for the manager: under the Worker's 15 s, so the Worker hears why. */
export const HEAR_TIMEOUT_MS = 14_000;
/** The manager's Whisper; the ledger names it with where it ran (`@gamerpc` / `@cpu`). */
export const HEAR_MANAGER_MODEL = 'whisper-large-v3-turbo';

function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const seconds = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
const failed = (reason: string, usage?: HomeUse): HearReport & { usage?: HomeUse } =>
  ({ ok: false, reason: reason.slice(0, HEAR_REASON_MAX), ...(usage ? { usage } : {}) });

/** One clip → its words, or an honest reason: "manager HTTP n: …", no words, or the error. */
export async function hear(clip: Uint8Array, hotwords: string[], deps: { fetch: typeof fetch }): Promise<HearReport & { usage?: HomeUse }> {
  const started = Date.now();
  try {
    const res = await deps.fetch(TRANSCRIBE_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...SOGO_APP_HEADERS },
      body: JSON.stringify({ audio: base64(clip), language: HEAR_LANGUAGE, hotwords }),
      signal: AbortSignal.timeout(HEAR_TIMEOUT_MS),
    });
    const text = await res.text().catch(() => '');
    let out: { text?: unknown; duration?: unknown; where?: unknown } | null = null;
    try { out = JSON.parse(text); } catch { /* not JSON */ }
    const where = typeof out?.where === 'string' && /^[a-z0-9-]{1,20}$/.test(out.where) ? `@${out.where}` : '';
    const usage: HomeUse = {
      model: HEAR_MANAGER_MODEL + where, ms: Date.now() - started, inputTokens: 0, outputTokens: 0, audioSeconds: seconds(out?.duration),
    };
    if (res.status < 200 || res.status >= 300) return failed(`manager HTTP ${res.status}: ${text.slice(0, 200)}`, usage);
    const words = typeof out?.text === 'string' ? out.text.replace(/\s+/g, ' ').trim() : '';
    return words ? { ok: true, text: words, usage } : failed('The manager heard no words.', usage);
  } catch (e) {
    return failed(`manager error: ${e instanceof Error && e.message ? e.message : String(e)}`);
  }
}
