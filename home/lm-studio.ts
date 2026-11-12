// SPEC §7A.3, §8.4a, §9.4c — the one LM Studio chat-completions call at home: POST a caller-built payload through the
// PC model manager's chat proxy on SogoAI (127.0.0.1:8797, LM Studio's OpenAI-compatible API, so the manager sees and
// logs every call) → choices[0].message.content, or an honest reason, with what was used (model, ms, tokens) once the
// proxy answered. Never throws, never builds a prompt, never decides what the answer means. Node globals and
// src/shared/model-usage.ts's type only (§2.5); no node:http.
import type { HomeUse } from '../src/shared/model-usage';

export const LM_STUDIO_URL = 'http://127.0.0.1:8797/v1/chat/completions';
/** The manager's app header: names Ensō on every proxied call (§9.4c; asked by SogoAI on Crossroads XR-0017). */
export const SOGO_APP_HEADERS = { 'x-sogo-app': 'enso' } as const;

const BODY_MAX = 200;

export type ChatCompletion = { ok: true; content: string; usage: HomeUse } | { ok: false; reason: string; usage?: HomeUse };

const tokens = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);

/** One payload → the model's content as it came, or why not: HTTP n, an unexpected shape, out of room, or an error. */
export async function chatCompletion(payload: { model: string }, opts: { timeoutMs: number; fetch: typeof fetch }): Promise<ChatCompletion> {
  const started = Date.now();
  try {
    const res = await opts.fetch(LM_STUDIO_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...SOGO_APP_HEADERS },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(opts.timeoutMs),
    });
    const text = await res.text().catch(() => '');
    const usage: HomeUse = { model: payload.model, ms: Date.now() - started, inputTokens: 0, outputTokens: 0 };
    if (res.status < 200 || res.status >= 300) return { ok: false, reason: `LM Studio HTTP ${res.status}: ${text.slice(0, BODY_MAX)}`, usage };
    let content: unknown;
    let finish: unknown;
    try {
      const answer = JSON.parse(text) as { usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
        choices?: { finish_reason?: unknown; message?: { content?: unknown } }[] };
      const choice = answer?.choices?.[0];
      content = choice?.message?.content; finish = choice?.finish_reason;
      usage.inputTokens = tokens(answer?.usage?.prompt_tokens); usage.outputTokens = tokens(answer?.usage?.completion_tokens);
    } catch { /* not JSON */ }
    if (finish === 'length' && typeof content === 'string' && !content.trim()) {
      return { ok: false, reason: 'The local model ran out of room before it answered.', usage };
    }
    return typeof content === 'string'
      ? { ok: true, content, usage }
      : { ok: false, reason: 'LM Studio answered in an unexpected shape.', usage };
  } catch (e) {
    return { ok: false, reason: `LM Studio error: ${e instanceof Error && e.message ? e.message : String(e)}` };
  }
}
