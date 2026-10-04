// SPEC §9.2, §7E.2c, §7A.3 — calling home through Cloudflare Access: one request with the two CF-Access
// service-token headers (plus whatever the caller adds), redirect 'manual' (Access answers a bad service token
// with a 302 to its login page — a failure, never followed), AbortSignal.timeout, 2xx only. Gives the body text
// or an honest reason: "HTTP n: body ≤ 200" or "error: message". Never throws, never names a secret, never
// decides what is asked or what an answer means (the callers do). No D1, no Hono.

const BODY_MAX = 200;

export interface AccessCreds { accessId: string; accessSecret: string }

export interface AccessRequest {
  method: 'GET' | 'POST';
  timeoutMs: number;
  /** Extra headers beside the two CF-Access ones (a Bearer token, a Content-Type). */
  headers?: Record<string, string>;
  body?: string | ArrayBuffer;
  fetch?: typeof fetch;
}

export type AccessResult = { ok: true; text: string } | { ok: false; reason: string };

/** One request to `url` through Access → { ok: true, text } on a 2xx, else an honest reason. */
export async function callThroughAccess(creds: AccessCreds, url: string, req: AccessRequest): Promise<AccessResult> {
  const send = req.fetch ?? fetch;
  try {
    const res = await send(url, {
      method: req.method,
      redirect: 'manual',
      headers: {
        'CF-Access-Client-Id': creds.accessId,
        'CF-Access-Client-Secret': creds.accessSecret,
        ...req.headers,
      },
      ...(req.body === undefined ? {} : { body: req.body }),
      signal: AbortSignal.timeout(req.timeoutMs),
    });
    const text = await res.text().catch(() => '');
    return res.status >= 200 && res.status < 300 ? { ok: true, text } : { ok: false, reason: `HTTP ${res.status}: ${text.slice(0, BODY_MAX)}` };
  } catch (e) {
    return { ok: false, reason: `error: ${e instanceof Error && e.message ? e.message : String(e)}` };
  }
}
