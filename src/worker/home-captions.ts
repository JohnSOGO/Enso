// SPEC §7E.2c — captions from home: asking the SogoAI helper for one video's captions, in-line, through
// Cloudflare Access and the `sogoai` tunnel. One GET with Bearer CAPTIONS_TOKEN through access.ts (the Access
// headers, redirect 'manual', 2xx only, a timeout); the body is checked by parseCaptionsReport. Never throws,
// never names a secret, never decides whether to ask or what is saved (the from-video route does). No D1, no
// Hono. A leaf sibling of house.ts.
import type { Env } from './env';
import { parseCaptionsReport } from '../shared/recipe-reading';
import { callThroughAccess } from './access';

/** ⚑ Q96 — how long the Worker waits for SogoAI. */
export const HOME_CAPTIONS_TIMEOUT_MS = 20_000;

export interface HomeCaptionsConfig { url: string; accessId: string; accessSecret: string; token: string }

/** The four settings, each non-empty, or null — captions from home are then not set up. */
export function homeCaptionsConfigOf(env: Env): HomeCaptionsConfig | null {
  const { HOME_CAPTIONS_URL, CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET, CAPTIONS_TOKEN } = env;
  if (!HOME_CAPTIONS_URL || !CF_ACCESS_CLIENT_ID || !CF_ACCESS_CLIENT_SECRET || !CAPTIONS_TOKEN) return null;
  return {
    url: HOME_CAPTIONS_URL.replace(/\/+$/, ''), accessId: CF_ACCESS_CLIENT_ID, accessSecret: CF_ACCESS_CLIENT_SECRET,
    token: CAPTIONS_TOKEN,
  };
}

export type HomeCaptions = { ok: true; text: string } | { ok: false; reason: string };

/** One GET to `{url}/captions?v=` → the captions' text, or an honest reason: "HTTP n: body", "error: message",
 *  the parse message, or the home's own reason. */
export async function readCaptionsFromHome(cfg: HomeCaptionsConfig, videoId: string,
  opts: { fetch?: typeof fetch } = {}): Promise<HomeCaptions> {
  const res = await callThroughAccess(cfg, `${cfg.url}/captions?v=${encodeURIComponent(videoId)}`, {
    method: 'GET', timeoutMs: HOME_CAPTIONS_TIMEOUT_MS, headers: { Authorization: `Bearer ${cfg.token}` }, fetch: opts.fetch,
  });
  if (!res.ok) return res;
  let body: unknown;
  try { body = JSON.parse(res.text); } catch { return { ok: false, reason: 'The helper answered something that is not JSON.' }; }
  const report = parseCaptionsReport(body);
  if (typeof report === 'string') return { ok: false, reason: report };
  return report.ok ? { ok: true, text: report.text } : { ok: false, reason: report.reason };
}
