// The Claude API calls. The ONLY importer of `@anthropic-ai/sdk` and zod, and only lazily (inside each call),
// so the cron tick and every route that never asks Claude never load them. It holds no prompts, chooses no
// tools and never decides what is saved: the caller gives the content, the prompt and the schema (or the
// server tools), and gets back the parsed value (or the text) or an honest failure.
import type { BetaContentBlockParam, BetaMessage, BetaMessageParam, BetaToolUnion } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { ZodType, z as Zod } from 'zod';

export const CLAUDE_MODEL = 'claude-opus-5-5';

export type ClaudeBlock = BetaContentBlockParam;
export type ClaudeServerTool = BetaToolUnion;

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

export type ClaudeFailure = { ok: false; kind: 'refused' | 'failed'; reason: string };
export type AskClaudeResult<T> = { ok: true; value: T } | ClaudeFailure;

const loadSdk = () => import('@anthropic-ai/sdk');
/** The server-side refusal fallback (beta) every request carries. */
const fallback = () => ({ betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const });

/** A finished answer's stop: a refusal or a cut-off is a failure; anything else is null. */
function stopFailure(res: Pick<BetaMessage, 'stop_reason' | 'stop_details'>): ClaudeFailure | null {
  if (res.stop_reason === 'refusal') {
    return { ok: false, kind: 'refused', reason: res.stop_details?.explanation || res.stop_details?.category || 'refused' };
  }
  if (res.stop_reason === 'max_tokens') return { ok: false, kind: 'failed', reason: 'The reading was cut off before it finished.' };
  return null;
}

/** A thrown error as an honest failure: the API's status and message, or the error's own message. */
async function thrownFailure(err: unknown): Promise<ClaudeFailure> {
  const { default: Anthropic } = await loadSdk();
  if (err instanceof Anthropic.APIError) {
    return { ok: false, kind: 'failed', reason: `Claude API error${err.status ? ` ${err.status}` : ''}: ${err.message}` };
  }
  return { ok: false, kind: 'failed', reason: err instanceof Error && err.message ? err.message : String(err) };
}

/**
 * One structured-output request: `client.beta.messages.parse` (the beta path, because the server-side
 * refusal fallback is a beta parameter) with `output_config.format` from the SDK's zod helper.
 */
export async function askClaude<S extends ZodType>(input: AskClaudeInput<S>): Promise<AskClaudeResult<Zod.infer<S>>> {
  const [{ default: Anthropic }, { betaZodOutputFormat }, { z }] = await Promise.all([
    loadSdk(), import('@anthropic-ai/sdk/helpers/beta/zod'), import('zod'),
  ]);
  // A parse failure becomes null instead of throwing, so stop_reason (a refusal's partial text) is checked first.
  const strict = betaZodOutputFormat(input.schema(z));
  const format = { ...strict, parse: (text: string) => { try { return strict.parse(text); } catch { return null; } } };
  const client = new Anthropic({ apiKey: input.apiKey, ...(input.fetch ? { fetch: input.fetch } : {}) });
  try {
    const res = await client.beta.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      ...fallback(),
      output_config: { effort: 'medium', format },
      messages: [{ role: 'user', content: [...input.content, { type: 'text', text: input.prompt }] }],
    });
    const stopped = stopFailure(res);
    if (stopped) return stopped;
    if (!res.parsed_output) return { ok: false, kind: 'failed', reason: 'The reading came back in an unexpected shape.' };
    return { ok: true, value: res.parsed_output };
  } catch (err) {
    return thrownFailure(err);
  }
}

export interface AskClaudeResearchInput {
  apiKey: string;
  prompt: string;
  /** Blocks sent before the prompt, in order (e.g. a picture, §7F.2). */
  content?: ClaudeBlock[];
  /** Server tools the caller chooses (e.g. web search and web fetch, with their max_uses). */
  tools: ClaudeServerTool[];
  /** How many requests in all, counting each `pause_turn` continuation; past it → an honest failure. */
  maxTurns: number;
  /** For tests only. */
  fetch?: typeof fetch;
}

/**
 * §7C.4b — a plain-text answer from a request with server tools. A `pause_turn` is continued by sending the
 * paused answer back unchanged, at most `maxTurns` requests in all; the answer is the final turn's text.
 */
export async function askClaudeResearch(input: AskClaudeResearchInput): Promise<AskClaudeResult<string>> {
  const { default: Anthropic } = await loadSdk();
  const client = new Anthropic({ apiKey: input.apiKey, ...(input.fetch ? { fetch: input.fetch } : {}) });
  const messages: BetaMessageParam[] = [{ role: 'user', content: [...(input.content ?? []), { type: 'text', text: input.prompt }] }];
  try {
    for (let turn = 1; turn <= input.maxTurns; turn++) {
      const res = await client.beta.messages.create({
        model: CLAUDE_MODEL, max_tokens: 16000, ...fallback(), output_config: { effort: 'medium' }, tools: input.tools, messages,
      });
      const stopped = stopFailure(res);
      if (stopped) return stopped;
      if (res.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: res.content as BetaContentBlockParam[] });
        continue;
      }
      // The text after the last tool result is the answer (earlier text is Claude narrating its searches).
      let from = res.content.length;
      while (from > 0 && (res.content[from - 1].type === 'text' || res.content[from - 1].type === 'thinking')) from--;
      const text = res.content.slice(from).flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('').trim();
      return { ok: true, value: text };
    }
    return { ok: false, kind: 'failed', reason: `The look-up didn't finish in ${input.maxTurns} rounds.` };
  } catch (err) {
    return thrownFailure(err);
  }
}
