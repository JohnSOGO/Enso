// SPEC §8.18 part 6, ⚑ Q344, §2.4 — Build now: one POST to the build routine's fire address (Bearer BUILD_FIRE_TOKEN)
// naming the request, so the build session starts at once instead of at 5:52. Never throws, never names the token,
// never decides who may build (the route asks shared/feature-requests). No D1, no Hono. A leaf like home-captions.ts.
import type { Env } from './env';

const FIRE_TIMEOUT_MS = 15_000;
const FIRE_HEADERS = { 'anthropic-beta': 'experimental-cc-routine-2026-04-01', 'anthropic-version': '2023-06-01' };

export interface BuildFireConfig { url: string; token: string }

/** Both settings, each non-empty, or null — Build now is then not set up. */
export function buildFireConfigOf(env: Env): BuildFireConfig | null {
  return env.BUILD_FIRE_URL && env.BUILD_FIRE_TOKEN ? { url: env.BUILD_FIRE_URL, token: env.BUILD_FIRE_TOKEN } : null;
}

/** The fire's text: the routine reads it as which request to build now. */
export const fireText = (r: { id: string; title: string }) => `Build now: feature request ${r.id} — ${r.title}`;

/** One POST → ok on a 2xx, else the HTTP status or the error's message (never the token, never the body). */
export async function fireBuild(cfg: BuildFireConfig, r: { id: string; title: string },
  opts: { fetch?: typeof fetch } = {}): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const res = await (opts.fetch ?? fetch)(cfg.url, {
      method: 'POST', signal: AbortSignal.timeout(FIRE_TIMEOUT_MS),
      headers: { Authorization: `Bearer ${cfg.token}`, 'content-type': 'application/json', ...FIRE_HEADERS },
      body: JSON.stringify({ text: fireText(r) }),
    });
    return res.ok ? { ok: true } : { ok: false, reason: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, reason: `error: ${e instanceof Error ? e.name : 'unknown'}` };
  }
}
