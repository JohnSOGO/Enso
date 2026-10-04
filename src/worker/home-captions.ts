// SPEC §7E.2c — captions from home: asking the SogoAI helper for one video's captions, in-line, through
// Cloudflare Access and the `sogoai` tunnel. One GET with the Access service token and Bearer CAPTIONS_TOKEN,
// redirect 'manual' (Access answers a bad token with a 302 to its login page), 2xx only, a timeout; the body
// is checked by parseCaptionsReport. Never throws, never names a secret, never decides whether to ask or
// what is saved (the from-video route does). No D1, no Hono. A leaf sibling of house.ts.
import type { Env } from './env';
import { parseCaptionsReport } from '../shared/recipe-reading';

/** ⚑ Q96 — how long the Worker waits for SogoAI. */
export const HOME_CAPTIONS_TIMEOUT_MS = 20_000;
const BODY_MAX = 200;

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
  const get = opts.fetch ?? fetch;
  try {
    const res = await get(`${cfg.url}/captions?v=${encodeURIComponent(videoId)}`, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'CF-Access-Client-Id': cfg.accessId,
        'CF-Access-Client-Secret': cfg.accessSecret,
        Authorization: `Bearer ${cfg.token}`,
      },
      signal: AbortSignal.timeout(HOME_CAPTIONS_TIMEOUT_MS),
    });
    const text = await res.text();
    if (res.status < 200 || res.status >= 300) return { ok: false, reason: `HTTP ${res.status}: ${text.slice(0, BODY_MAX)}` };
    let body: unknown;
    try { body = JSON.parse(text); } catch { return { ok: false, reason: 'The helper answered something that is not JSON.' }; }
    const report = parseCaptionsReport(body);
    if (typeof report === 'string') return { ok: false, reason: report };
    return report.ok ? { ok: true, text: report.text } : { ok: false, reason: report.reason };
  } catch (e) {
    return { ok: false, reason: `error: ${e instanceof Error && e.message ? e.message : String(e)}` };
  }
}
