// SPEC §7A.3, §8.4a — the one LM Studio chat-completions call at home: POST a caller-built payload to LM Studio's
// OpenAI-compatible endpoint on SogoAI (127.0.0.1:1234) → choices[0].message.content, or an honest reason. Never throws,
// never builds a prompt, never decides what the answer means. Node globals only (§2.5); no node:http.

export const LM_STUDIO_URL = 'http://127.0.0.1:1234/v1/chat/completions';

const BODY_MAX = 200;

export type ChatCompletion = { ok: true; content: string } | { ok: false; reason: string };

/** One payload → the model's content as it came, or why not: HTTP n, an unexpected shape, out of room, or an error. */
export async function chatCompletion(payload: unknown, opts: { timeoutMs: number; fetch: typeof fetch }): Promise<ChatCompletion> {
  try {
    const res = await opts.fetch(LM_STUDIO_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(opts.timeoutMs),
    });
    const text = await res.text().catch(() => '');
    if (res.status < 200 || res.status >= 300) return { ok: false, reason: `LM Studio HTTP ${res.status}: ${text.slice(0, BODY_MAX)}` };
    let content: unknown;
    let finish: unknown;
    try {
      const choice = (JSON.parse(text) as { choices?: { finish_reason?: unknown; message?: { content?: unknown } }[] })?.choices?.[0];
      content = choice?.message?.content; finish = choice?.finish_reason;
    } catch { /* not JSON */ }
    if (finish === 'length' && typeof content === 'string' && !content.trim()) {
      return { ok: false, reason: 'The local model ran out of room before it answered.' };
    }
    return typeof content === 'string'
      ? { ok: true, content }
      : { ok: false, reason: 'LM Studio answered in an unexpected shape.' };
  } catch (e) {
    return { ok: false, reason: `LM Studio error: ${e instanceof Error && e.message ? e.message : String(e)}` };
  }
}
