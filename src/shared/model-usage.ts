// SPEC §9.4c — one record per model call (pure): what a call used (ModelUse), the one price table and the estimate
// worked out from it when the ledger is read, Claude's usage block and the SogoAI helper's usage as a ModelUse. Imports
// vocab only. Shared by the Worker and home/ (§2.5).
import type { ModelProvider } from './vocab';

/** What one model call used. Counts the provider did not report are 0; `audioSeconds` null when unknown. */
export interface ModelUse {
  provider: ModelProvider;
  model: string;
  ok: boolean;
  ms: number;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  webSearches: number;
  webFetches: number;
  audioSeconds: number | null;
  audioBytes: number;
}

/** Records one call; never throws (a failed write never fails the reading). */
export type Meter = (use: ModelUse) => Promise<void>;

export const noUse = (provider: ModelProvider, model: string, ok: boolean, ms: number): ModelUse => ({
  provider, model, ok, ms, inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0,
  webSearches: 0, webFetches: 0, audioSeconds: null, audioBytes: 0,
});

/** ⚑ Q406 — USD per million tokens, from the published rates (2026-11-07). Cache writes at the 5-minute rate. */
export const TOKEN_PRICES: Record<string, { input: number; output: number; cacheWrite: number; cacheRead: number }> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  'claude-opus-5': { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  'claude-opus-4-8': { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  'claude-fable-5-1': { input: 10, output: 50, cacheWrite: 12.5, cacheRead: 0.25 },
};
/** ⚑ Q406 — USD per web search (web fetch costs tokens only). */
export const WEB_SEARCH_USD = 0.01;
/** ⚑ Q406 — USD per audio minute, before Workers AI's free daily neurons. */
export const AUDIO_MINUTE_USD: Record<string, number> = { '@cf/openai/whisper-large-v3-turbo': 0.0005 };

type Priced = Pick<ModelUse, 'provider' | 'model' | 'inputTokens' | 'outputTokens' | 'cacheWriteTokens'
  | 'cacheReadTokens' | 'webSearches' | 'audioSeconds'>;

/** The estimate in USD: SogoAI is free; a model or an audio length the table doesn't know → null. */
export function estimateUsd(u: Priced): number | null {
  if (u.provider === 'sogoai') return 0;
  if (u.provider === 'workers-ai') {
    const perMinute = AUDIO_MINUTE_USD[u.model];
    return perMinute === undefined || u.audioSeconds === null ? null : (u.audioSeconds / 60) * perMinute;
  }
  const p = TOKEN_PRICES[u.model];
  if (!p) return null;
  return (u.inputTokens * p.input + u.outputTokens * p.output + u.cacheWriteTokens * p.cacheWrite
    + u.cacheReadTokens * p.cacheRead) / 1e6 + u.webSearches * WEB_SEARCH_USD;
}

const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);

/** A Messages answer's `usage` block → the token and server-tool counts (anything missing is 0). */
export function claudeCounts(usage: unknown): Pick<ModelUse, 'inputTokens' | 'outputTokens' | 'cacheWriteTokens'
  | 'cacheReadTokens' | 'webSearches' | 'webFetches'> {
  const u = (usage && typeof usage === 'object' ? usage : {}) as Record<string, unknown>;
  const tools = (u.server_tool_use && typeof u.server_tool_use === 'object' ? u.server_tool_use : {}) as Record<string, unknown>;
  return {
    inputTokens: count(u.input_tokens), outputTokens: count(u.output_tokens),
    cacheWriteTokens: count(u.cache_creation_input_tokens), cacheReadTokens: count(u.cache_read_input_tokens),
    webSearches: count(tools.web_search_requests), webFetches: count(tools.web_fetch_requests),
  };
}

/** The SogoAI helper's `usage` on an /identify, /note-marks or /hear answer (§9.4c): what LM Studio or the manager's
 *  Whisper was asked; `audioSeconds` the clip's length on /hear (null when unknown), absent otherwise. */
export interface HomeUse { model: string; ms: number; inputTokens: number; outputTokens: number; audioSeconds?: number | null }

/** A helper answer's `usage` field → a HomeUse, or null when it carries none (an older helper) or a bad one. */
export function homeUseOf(v: unknown): HomeUse | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const r = v as Record<string, unknown>;
  if (typeof r.model !== 'string' || !r.model.trim()) return null;
  const audio = typeof r.audioSeconds === 'number' && Number.isFinite(r.audioSeconds) && r.audioSeconds >= 0 ? r.audioSeconds : null;
  return {
    model: r.model.trim().slice(0, 100), ms: count(r.ms), inputTokens: count(r.inputTokens), outputTokens: count(r.outputTokens),
    ...('audioSeconds' in r ? { audioSeconds: audio } : {}),
  };
}
