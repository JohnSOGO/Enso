// The one Claude API call. The ONLY importer of `@anthropic-ai/sdk` and zod, and only lazily (inside
// askClaude), so the cron tick and every route that never asks Claude never load them. It holds no
// prompts and never decides what is saved: the caller gives the content, the prompt and the schema, and
// gets back the parsed value or an honest failure.
import type { BetaContentBlockParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { ZodType, z as Zod } from 'zod';

export const CLAUDE_MODEL = 'claude-opus-5-5';

export type ClaudeBlock = BetaContentBlockParam;

export interface AskClaudeInput<S extends ZodType> {
  apiKey: string;
  /** Blocks sent before the prompt, in order (e.g. an image). */
  content: ClaudeBlock[];
  /** The instruction, sent as the last text block of the one user message. */
  prompt: string;
  /** Builds the output schema from the lazily loaded zod. */
  schema: (z: typeof Zod) => S;
  /** For tests only, so no test ever reaches the real API. */
  fetch?: typeof fetch;
}

export type AskClaudeResult<T> =
  | { ok: true; value: T }
  | { ok: false; kind: 'refused' | 'failed'; reason: string };

/**
 * One structured-output request: `client.beta.messages.parse` (the beta path, because the server-side
 * refusal fallback is a beta parameter) with `output_config.format` from the SDK's zod helper.
 */
export async function askClaude<S extends ZodType>(input: AskClaudeInput<S>): Promise<AskClaudeResult<Zod.infer<S>>> {
  const [{ default: Anthropic }, { betaZodOutputFormat }, { z }] = await Promise.all([
    import('@anthropic-ai/sdk'), import('@anthropic-ai/sdk/helpers/beta/zod'), import('zod'),
  ]);
  // A parse failure becomes null instead of throwing, so stop_reason (a refusal's partial text) is checked first.
  const strict = betaZodOutputFormat(input.schema(z));
  const format = { ...strict, parse: (text: string) => { try { return strict.parse(text); } catch { return null; } } };
  const client = new Anthropic({ apiKey: input.apiKey, ...(input.fetch ? { fetch: input.fetch } : {}) });
  try {
    const res = await client.beta.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format },
      messages: [{ role: 'user', content: [...input.content, { type: 'text', text: input.prompt }] }],
    });
    if (res.stop_reason === 'refusal') {
      return { ok: false, kind: 'refused', reason: res.stop_details?.explanation || res.stop_details?.category || 'refused' };
    }
    if (res.stop_reason === 'max_tokens') return { ok: false, kind: 'failed', reason: 'The reading was cut off before it finished.' };
    if (!res.parsed_output) return { ok: false, kind: 'failed', reason: 'The reading came back in an unexpected shape.' };
    return { ok: true, value: res.parsed_output };
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      return { ok: false, kind: 'failed', reason: `Claude API error${err.status ? ` ${err.status}` : ''}: ${err.message}` };
    }
    return { ok: false, kind: 'failed', reason: err instanceof Error && err.message ? err.message : String(err) };
  }
}
