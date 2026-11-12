// MU1–MU7 (SPEC §9.4c) — the model_calls ledger: the estimate, Claude's usage block and the helper's usage read
// right; a Claude reading, a research look-up's re-sends, a Whisper clip and a SogoAI answer each leave their rows;
// GET /ops/model-usage sums them behind the ops token. Claude is a fake api.anthropic.com behind a fetch spy; the key
// and the token are the test ones vitest.config.ts pins.
import { createExecutionContext, env } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/worker/index';
import type { Env } from '../src/worker/env';
import { claudeCounts, estimateUsd, homeUseOf, noUse, type ModelUse } from '../src/shared/model-usage';
import { askClaudeResearch } from '../src/worker/claude';
import { HEAR_MODEL, hearClip, type SpeechAi } from '../src/worker/speech-to-text';
import { hearFromHome, noteMarksFromHome } from '../src/worker/home-captions';
import { chatCompletion, LM_STUDIO_URL } from '../home/lm-studio';
import { BASE, Client, owner } from './helpers';
import { claudeMessage, keyedEnv, warmClaude } from './recipe-fakes';

declare global { namespace Cloudflare { interface Env { OPS_NOTIFY_TOKEN: string } } }
const AUTH = { authorization: 'Bearer test-ops-token' };

let o: Client;
beforeAll(async () => { o = await owner(); await warmClaude(); }, 60_000);
beforeEach(async () => { await env.DB.exec('DELETE FROM model_calls; DELETE FROM photo_reads'); });
afterEach(() => { vi.restoreAllMocks(); });

const rows = async () => (await env.DB.prepare(`SELECT feature, provider, model, ok, input_tokens, output_tokens,
  cache_read_tokens, web_searches, audio_seconds, audio_bytes FROM model_calls ORDER BY id`).all()).results;
const collect = () => { const seen: ModelUse[] = []; return { seen, meter: async (u: ModelUse) => { seen.push(u); } }; };

describe('MU1 the pure pieces', () => {
  it('estimates from the price table; SogoAI is free; an unknown model or audio length is null', () => {
    const u = { ...noUse('anthropic', 'claude-opus-5-5', true, 0), inputTokens: 1_000_000, outputTokens: 100_000, cacheReadTokens: 1_000_000, webSearches: 3 };
    expect(estimateUsd(u)).toBeCloseTo(4 + 2 + 0.2 + 0.03, 6);
    expect(estimateUsd({ ...u, model: 'claude-mystery' })).toBeNull();
    expect(estimateUsd(noUse('sogoai', 'photo-polish', true, 0))).toBe(0);
    expect(estimateUsd({ ...noUse('workers-ai', HEAR_MODEL, true, 0), audioSeconds: 120 })).toBeCloseTo(0.001, 9);
    expect(estimateUsd(noUse('workers-ai', HEAR_MODEL, true, 0))).toBeNull();
  });
  it("reads Claude's usage block and the helper's usage", () => {
    expect(claudeCounts({ input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 2, cache_read_input_tokens: 7,
      server_tool_use: { web_search_requests: 2, web_fetch_requests: 1 } }))
      .toEqual({ inputTokens: 10, outputTokens: 5, cacheWriteTokens: 2, cacheReadTokens: 7, webSearches: 2, webFetches: 1 });
    expect(claudeCounts(null)).toEqual({ inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, webSearches: 0, webFetches: 0 });
    expect(homeUseOf({ model: ' photo-polish ', ms: 12.4, inputTokens: 30, outputTokens: -1 }))
      .toEqual({ model: 'photo-polish', ms: 12, inputTokens: 30, outputTokens: 0 });
    expect(homeUseOf(undefined)).toBeNull();
    expect(homeUseOf({ ms: 1 })).toBeNull();
  });
});

function fakeClaude(answers: object[]) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(new Request(input, init).url);
    if (url.host !== 'api.anthropic.com' || !answers.length) throw new Error(`a test tried to reach ${url.host}${url.pathname}`);
    return Response.json(answers.shift());
  });
}

describe('MU2–MU3 Claude', () => {
  it('MU2 POST /say leaves one anthropic row for "say" with its tokens', async () => {
    fakeClaude([claudeMessage({ want: '', steps: [], event: null, where: null, title: null, summary: null, size: null,
      heard: 'Remind me to book the car check.', kind: 'reminder', say: "I'll remind you to book the car check.",
      reminder: { title: 'Book car check', date: null, time: null, days: ['MO'], from: '08:00', to: '11:00', who: ['me'] } },
    { usage: { input_tokens: 900, output_tokens: 40, cache_read_input_tokens: 5 } })]);
    const res = await worker.fetch(new Request(`${BASE}/say`, {
      method: 'POST', body: JSON.stringify({ text: 'remind me to book the car check' }), headers: { 'content-type': 'application/json', cookie: o.cookie },
    }), keyedEnv() as Env, createExecutionContext());
    expect(res.status).toBe(200);
    expect(await rows()).toEqual([{ feature: 'say', provider: 'anthropic', model: 'claude-opus-5-5', ok: 1, input_tokens: 900,
      output_tokens: 40, cache_read_tokens: 5, web_searches: 0, audio_seconds: null, audio_bytes: 0 }]);
  });
  it('MU3 a research look-up meters each pause_turn re-send; a refusal is not ok; a throw is a row with nothing used', async () => {
    const m = collect();
    fakeClaude([
      claudeMessage(null, { stop_reason: 'pause_turn', content: [], usage: { input_tokens: 100, output_tokens: 10, server_tool_use: { web_search_requests: 2 } } }),
      claudeMessage(null, { content: [{ type: 'text', text: 'notes' }], usage: { input_tokens: 200, output_tokens: 20, server_tool_use: { web_fetch_requests: 1 } } }),
    ]);
    const r = await askClaudeResearch({ apiKey: 'k', prompt: 'p', tools: [], maxTurns: 3, meter: m.meter });
    expect(r).toEqual({ ok: true, value: 'notes' });
    expect(m.seen.map((u) => [u.ok, u.inputTokens, u.webSearches, u.webFetches])).toEqual([[true, 100, 2, 0], [true, 200, 0, 1]]);
    vi.restoreAllMocks();
    fakeClaude([claudeMessage(null, { stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'cyber', explanation: 'no' } })]);
    await askClaudeResearch({ apiKey: 'k', prompt: 'p', tools: [], maxTurns: 3, meter: m.meter });
    expect(m.seen[2]).toMatchObject({ ok: false, inputTokens: 1, provider: 'anthropic' });
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('connection refused'));
    await askClaudeResearch({ apiKey: 'k', prompt: 'p', tools: [], maxTurns: 3, meter: m.meter });
    expect(m.seen.at(-1)).toMatchObject({ ok: false, inputTokens: 0, model: 'claude-opus-5-5' });
  });
});

describe('MU4 Whisper', () => {
  it("meters the clip's size and Whisper's length; a failing AI is a row that isn't ok", async () => {
    const m = collect();
    const ai: SpeechAi = { run: async () => ({ text: 'hi', transcription_info: { duration: 4.5 } }) };
    await hearClip(ai, new Uint8Array(10).buffer, m.meter);
    await hearClip({ run: async () => { throw new Error('boom'); } }, new Uint8Array(3).buffer, m.meter);
    expect(m.seen.map((u) => [u.provider, u.model, u.ok, u.audioSeconds, u.audioBytes]))
      .toEqual([['workers-ai', HEAR_MODEL, true, 4.5, 10], ['workers-ai', HEAR_MODEL, false, null, 3]]);
  });
  it('POST /say/hear leaves a say-hear row', async () => {
    const ai: SpeechAi = { run: async () => ({ text: 'hi' }) };
    const res = await worker.fetch(new Request(`${BASE}/say/hear`, {
      method: 'POST', body: new Uint8Array([1, 2]), headers: { 'content-type': 'audio/mp4', cookie: o.cookie },
    }), { ...env, AI: ai } as Env, createExecutionContext());
    expect(res.status).toBe(200);
    expect(await rows()).toEqual([{ feature: 'say-hear', provider: 'workers-ai', model: HEAR_MODEL, ok: 1, input_tokens: 0,
      output_tokens: 0, cache_read_tokens: 0, web_searches: 0, audio_seconds: null, audio_bytes: 2 }]);
  });
});

describe('MU5–MU6 SogoAI', () => {
  it('MU5 the helper goes through the model manager\'s chat proxy and reports what LM Studio used', async () => {
    expect(LM_STUDIO_URL).toBe('http://127.0.0.1:8797/v1/chat/completions');
    let sent: Headers | undefined;
    const f: typeof fetch = async (_u, init) => { sent = new Headers(init?.headers);
      return Response.json({ choices: [{ message: { content: 'Milk' } }], usage: { prompt_tokens: 50, completion_tokens: 3 } }); };
    const r = await chatCompletion({ model: 'photo-polish' }, { timeoutMs: 1000, fetch: f });
    expect(sent?.get('x-sogo-app')).toBe('enso'); // the manager names the app on proxied calls
    expect(r).toMatchObject({ ok: true, content: 'Milk', usage: { model: 'photo-polish', inputTokens: 50, outputTokens: 3 } });
    const down = await chatCompletion({ model: 'photo-polish' }, { timeoutMs: 1000, fetch: async () => { throw new Error('refused'); } });
    expect(down).toEqual({ ok: false, reason: 'LM Studio error: refused' });
  });
  it("MU6 the Worker meters a helper answer's usage as one sogoai row; none without it", async () => {
    const m = collect();
    const cfg = { url: 'https://sogoai.test', accessId: 'i', accessSecret: 's', token: 't' };
    const answer = (body: object): typeof fetch => async () => Response.json(body);
    await noteMarksFromHome(cfg, 'x', { meter: m.meter, fetch: answer({ ok: true, marks: [], usage: { model: 'photo-polish', ms: 80, inputTokens: 40, outputTokens: 9 } }) });
    await noteMarksFromHome(cfg, 'x', { meter: m.meter, fetch: answer({ ok: false, kind: 'busy', reason: 'r' }) });
    expect(m.seen).toEqual([{ ...noUse('sogoai', 'photo-polish', true, 80), inputTokens: 40, outputTokens: 9 }]);
  });
  it('MU4 a clip heard at home is one sogoai row with its seconds and bytes; failing at home then Whisper is two', async () => {
    const m = collect();
    const cfg = { url: 'https://sogoai.test', accessId: 'i', accessSecret: 's', token: 't' };
    const answer = (body: object): typeof fetch => async () => Response.json(body);
    const usage = { model: 'whisper-large-v3-turbo@gamerpc', ms: 700, inputTokens: 0, outputTokens: 0, audioSeconds: 2.5 };
    await hearFromHome(cfg, new Uint8Array(6).buffer, 'audio/mp4', ['Roxy'], { meter: m.meter, fetch: answer({ ok: true, text: 'hi', usage }) });
    await hearFromHome(cfg, new Uint8Array(6).buffer, 'audio/mp4', [], { meter: m.meter, fetch: answer({ ok: false, reason: 'r', usage: { ...usage, model: 'whisper-large-v3-turbo@cpu' } }) });
    await hearClip({ run: async () => ({ text: 'hi', transcription_info: { duration: 2.5 } }) }, new Uint8Array(6).buffer, m.meter);
    expect(m.seen.map((u) => [u.provider, u.model, u.ok, u.audioSeconds, u.audioBytes])).toEqual([
      ['sogoai', 'whisper-large-v3-turbo@gamerpc', true, 2.5, 6], ['sogoai', 'whisper-large-v3-turbo@cpu', false, 2.5, 6],
      ['workers-ai', HEAR_MODEL, true, 2.5, 6]]);
    expect(homeUseOf({ model: 'w', audioSeconds: -1 })).toMatchObject({ audioSeconds: null });
    expect(homeUseOf({ model: 'w' })).not.toHaveProperty('audioSeconds');
  });
});

describe('MU7 GET /ops/model-usage', () => {
  const get = (q = '', headers: Record<string, string> = AUTH) =>
    worker.fetch(new Request(`${BASE}/ops/model-usage${q}`, { headers }), env as Env, createExecutionContext());
  it('sums by day, feature, provider and model with the estimate; the ops token; days checked', async () => {
    const today = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO model_calls (at, feature, provider, model, ok, input_tokens, output_tokens) VALUES
      (?1, 'say', 'anthropic', 'claude-opus-5-5', 1, 1000000, 0), (?1, 'say', 'anthropic', 'claude-opus-5-5', 0, 0, 100000),
      (?1, 'note-marks', 'sogoai', 'photo-polish', 1, 50, 5), ('2020-01-01T00:00:00.000Z', 'say', 'anthropic', 'claude-opus-5-5', 1, 5, 5)`)
      .bind(today).run();
    const res = await get('?days=7');
    expect(res.status).toBe(200);
    const j = await res.json<any>();
    expect(j.rows.map((r: any) => [r.feature, r.provider, r.calls, r.failed, r.inputTokens, r.estUsd]))
      .toEqual([['note-marks', 'sogoai', 1, 0, 50, 0], ['say', 'anthropic', 2, 1, 1000000, 6]]);
    expect(j.total).toEqual({ calls: 3, failed: 1, estUsd: 6, unpricedCalls: 0 });
    expect((await get('?days=0')).status).toBe(400);
    expect((await get('?days=1.5')).status).toBe(400);
    expect((await get('', {})).status).toBe(401);
  });
});
