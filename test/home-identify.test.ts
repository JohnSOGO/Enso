// SN14 (SPEC §7A.3) — home/identify.ts over a fake LM Studio (never a real network): the one request's shape, and
// every failure honest — a timeout, a non-2xx, an unexpected shape, IDENTIFY_MODEL unset (off, nothing called).
import { describe, expect, it } from 'vitest';
import { IDENTIFY_TIMEOUT_MS, LM_STUDIO_URL, NO_THINK, identify } from '../home/identify';
import { IDENTIFY_PROMPT } from '../src/shared/item-reading';

const PHOTO = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3, 250]);
const B64 = btoa(String.fromCharCode(...PHOTO));

/** A fake LM Studio answering `answer` (or throwing it), recording each request. */
function lmStudio(answer: (() => Response) | Error) {
  const seen: { req: Request; body: any; signal: AbortSignal | null | undefined }[] = [];
  const f: typeof fetch = async (input, init) => {
    const req = new Request(input, init);
    seen.push({ req, body: await req.clone().json().catch(() => null), signal: init?.signal });
    if (answer instanceof Error) throw answer;
    return answer();
  };
  return { f, seen };
}

const chat = (content: unknown, status = 200) => () => new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }), { status });

describe('SN14 identify', () => {
  it('one POST to LM Studio: the model, the prompt + " /no_think", the image as a data URL, temperature 0 → the text as it came', async () => {
    const { f, seen } = lmStudio(chat('<think>\n\n</think>\n\nHeinz Tomato Ketchup 32 oz'));
    const r = await identify(PHOTO, 'image/jpeg', { model: 'qwen-uncensored', fetch: f });
    expect(r).toEqual({ ok: true, text: '<think>\n\n</think>\n\nHeinz Tomato Ketchup 32 oz' });
    expect(seen).toHaveLength(1);
    const { req, body, signal } = seen[0];
    expect(req.method).toBe('POST');
    expect(req.url).toBe(LM_STUDIO_URL);
    expect(LM_STUDIO_URL).toBe('http://127.0.0.1:1234/v1/chat/completions');
    expect(req.headers.get('content-type')).toBe('application/json');
    expect(body).toEqual({
      model: 'qwen-uncensored',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: `${IDENTIFY_PROMPT} /no_think` },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${B64}` } },
        ],
      }],
      temperature: 0,
      max_tokens: 100,
      stream: false,
    });
    expect(NO_THINK).toBe(' /no_think');
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(IDENTIFY_TIMEOUT_MS).toBe(15_000);
  });

  it('IDENTIFY_MODEL unset or empty → off, and LM Studio is never called', async () => {
    for (const model of [undefined, '']) {
      const { f, seen } = lmStudio(chat('x'));
      expect(await identify(PHOTO, 'image/jpeg', { model, fetch: f })).toEqual({ ok: false, kind: 'off', reason: "IDENTIFY_MODEL isn't set on SogoAI." });
      expect(seen).toEqual([]);
    }
  });

  const failures: [string, (() => Response) | Error, RegExp][] = [
    ['the timeout', new DOMException('The operation was aborted due to timeout', 'TimeoutError'), /^LM Studio error: .*timeout/],
    ['nothing listening', new Error('connect ECONNREFUSED 127.0.0.1:1234'), /^LM Studio error: connect ECONNREFUSED/],
    ['a 404 (no such model)', () => new Response('{"error":"model not found"}', { status: 404 }), /^LM Studio HTTP 404: \{"error":"model not found"\}$/],
    ['a 500 with a long body', () => new Response('e'.repeat(500), { status: 500 }), new RegExp(`^LM Studio HTTP 500: e{200}$`)],
    ['not JSON', () => new Response('<html>'), /^LM Studio answered in an unexpected shape\.$/],
    ['no choices', () => new Response('{"choices":[]}'), /^LM Studio answered in an unexpected shape\.$/],
    ['content not text', chat(null), /^LM Studio answered in an unexpected shape\.$/],
  ];
  for (const [what, answer, reason] of failures) {
    it(`${what} → failed, honestly, never a throw`, async () => {
      const r = await identify(PHOTO, 'image/png', { model: 'qwen-uncensored', fetch: lmStudio(answer).f });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.kind).toBe('failed');
      expect(r.reason).toMatch(reason);
    });
  }
});
