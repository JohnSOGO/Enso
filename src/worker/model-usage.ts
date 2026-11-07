// SPEC §9.4c — the model_calls ledger (§4.2zzo): meterFor gives a route the Meter its readings record through (one row
// per call, a failed write only logged), and modelUsageTotals answers GET /ops/model-usage, by day, feature, provider
// and model, with the estimate from the shared price table. Counts only: no prompt, no answer, no member. No Hono.
import { estimateUsd, type Meter, type ModelUse } from '../shared/model-usage';
import type { ModelFeature, ModelProvider } from '../shared/vocab';
import { all, nowIso, run } from './db';

export async function recordModelCall(db: D1Database, feature: ModelFeature, u: ModelUse, at: string): Promise<void> {
  await run(db, `INSERT INTO model_calls (at, feature, provider, model, ok, ms, input_tokens, output_tokens,
      cache_write_tokens, cache_read_tokens, web_searches, web_fetches, audio_seconds, audio_bytes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  at, feature, u.provider, u.model, u.ok ? 1 : 0, Math.max(0, Math.round(u.ms)), u.inputTokens, u.outputTokens,
  u.cacheWriteTokens, u.cacheReadTokens, u.webSearches, u.webFetches, u.audioSeconds, u.audioBytes);
}

/** One feature's Meter: each call becomes a row stamped when it ended; a failed write never fails the reading. */
export const meterFor = (db: D1Database, feature: ModelFeature): Meter => async (u) => {
  try { await recordModelCall(db, feature, u, nowIso()); } catch (e) { console.error('model_calls write failed', e); }
};

export interface ModelUsageRow {
  day: string; feature: ModelFeature; provider: ModelProvider; model: string; calls: number; failed: number; ms: number;
  inputTokens: number; outputTokens: number; cacheWriteTokens: number; cacheReadTokens: number;
  webSearches: number; webFetches: number; audioSeconds: number | null; audioBytes: number; estUsd: number | null;
}

/** The calls at or after `since`, summed by UTC day, feature, provider and model (newest day first), and their total. */
export async function modelUsageTotals(db: D1Database, since: string) {
  const raw = await all<Omit<ModelUsageRow, 'estUsd'>>(db, `SELECT substr(at, 1, 10) AS day, feature, provider, model,
      COUNT(*) AS calls, SUM(1 - ok) AS failed, SUM(ms) AS ms, SUM(input_tokens) AS inputTokens,
      SUM(output_tokens) AS outputTokens, SUM(cache_write_tokens) AS cacheWriteTokens,
      SUM(cache_read_tokens) AS cacheReadTokens, SUM(web_searches) AS webSearches, SUM(web_fetches) AS webFetches,
      SUM(audio_seconds) AS audioSeconds, SUM(audio_bytes) AS audioBytes
    FROM model_calls WHERE at >= ? GROUP BY day, feature, provider, model ORDER BY day DESC, feature, provider, model`, since);
  const rows: ModelUsageRow[] = raw.map((r) => ({ ...r, estUsd: estimateUsd(r) }));
  const priced = rows.filter((r) => r.estUsd !== null);
  return {
    since,
    rows,
    total: {
      calls: rows.reduce((n, r) => n + r.calls, 0),
      failed: rows.reduce((n, r) => n + r.failed, 0),
      estUsd: priced.reduce((n, r) => n + (r.estUsd as number), 0),
      unpricedCalls: rows.filter((r) => r.estUsd === null).reduce((n, r) => n + r.calls, 0),
    },
  };
}
