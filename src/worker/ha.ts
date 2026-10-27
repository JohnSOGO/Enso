// SPEC §9.2 — calling Home Assistant: HA_URL, HA_TOKEN and the Access pair (or null when any is missing),
// and one GET or POST with Bearer HA_TOKEN through access.ts → HA's answer text on a 2xx, else access.ts's
// honest reason. Never parses an answer, never decides what is asked, never names a token. No D1, no Hono.
import type { Env } from './env';
import { callThroughAccess } from './access';

/** The 503 code when HA isn't set up (`haConfigOf` null), for House and the devices alike. */
export const HOUSE_NOT_CONFIGURED = 'house_not_configured';

export interface HaConfig { haUrl: string; haToken: string; accessId: string; accessSecret: string }

/** The four settings every HA call needs, or null when any is missing. */
export function haConfigOf(env: Env): HaConfig | null {
  const { HA_URL, HA_TOKEN, CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET } = env;
  if (!HA_URL || !HA_TOKEN || !CF_ACCESS_CLIENT_ID || !CF_ACCESS_CLIENT_SECRET) return null;
  return { haUrl: HA_URL.replace(/\/+$/, ''), haToken: HA_TOKEN, accessId: CF_ACCESS_CLIENT_ID, accessSecret: CF_ACCESS_CLIENT_SECRET };
}

/** One call to HA → its answer text on a 2xx, else access.ts's honest reason. Never names a token. */
export function haCall(cfg: HaConfig, method: 'GET' | 'POST', path: string, payload: unknown | undefined, timeoutMs: number) {
  return callThroughAccess(cfg, `${cfg.haUrl}${path}`, {
    method, timeoutMs,
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    headers: {
      Authorization: `Bearer ${cfg.haToken}`,
      ...(payload === undefined ? {} : { 'Content-Type': 'application/json; charset=utf-8' }),
    },
  });
}
