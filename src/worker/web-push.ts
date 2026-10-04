// SPEC §9.1 — the Web Push protocol (RFC 8291 encryption, RFC 8292 VAPID): one POST to one
// subscription. The ONLY importer of `@block65/webcrypto-web-push`. No D1, no policy: what is
// sent and what a result means belong to push.ts.
import { encryptNotification, vapidHeaders } from '@block65/webcrypto-web-push';

export interface VapidKeys { subject: string; publicKey: string; privateKey: string }
export interface PushTarget { endpoint: string; p256dh: string; auth: string }
/** The push service's answer; `status: null` when no answer came (network/encryption error, in `body`). */
export interface PushResult { status: number | null; body: string }

/** How long one signed VAPID header is reused per push-service origin (Apple: not more often than hourly). */
export const VAPID_HEADER_TTL_MS = 60 * 60_000;
export const PUSH_TTL_S = 3600;
const TOPIC = /^[A-Za-z0-9_-]{1,32}$/; // RFC 8030 §5.4: ≤ 32 base64url characters

/**
 * Per isolate: `${origin} ${publicKey}` → the signed Authorization header (a promise, so parallel
 * sends to one origin share one signing) and when it stops being reused.
 */
const vapidCache = new Map<string, { authorization: Promise<string>; until: number }>();

function authorizationFor(target: PushTarget, vapid: VapidKeys, now: string): Promise<string> {
  const key = `${new URL(target.endpoint).origin} ${vapid.publicKey}`;
  const t = Date.parse(now);
  const hit = vapidCache.get(key);
  if (hit && t < hit.until) return hit.authorization;
  const authorization = vapidHeaders(subscriptionOf(target), vapid).then((r) => r.headers.authorization);
  const entry = { authorization, until: t + VAPID_HEADER_TTL_MS };
  vapidCache.set(key, entry);
  authorization.catch(() => { if (vapidCache.get(key) === entry) vapidCache.delete(key); }); // a failed signing is not reused
  return authorization;
}

const subscriptionOf = (t: PushTarget) => ({ endpoint: t.endpoint, expirationTime: null, keys: { p256dh: t.p256dh, auth: t.auth } });

/** Encrypts `payload` for one subscription and POSTs it. Never throws: a failure comes back as a result. */
export async function sendWebPush(vapid: VapidKeys, target: PushTarget, payload: string, opts: { topic?: string; now: string }): Promise<PushResult> {
  try {
    const authorization = await authorizationFor(target, vapid, opts.now);
    const body = await encryptNotification(subscriptionOf(target), new TextEncoder().encode(payload));
    const res = await fetch(target.endpoint, {
      method: 'POST',
      headers: {
        authorization, ttl: String(PUSH_TTL_S), urgency: 'high',
        ...(opts.topic && TOPIC.test(opts.topic) ? { topic: opts.topic } : {}),
        'content-encoding': 'aes128gcm', 'content-type': 'application/octet-stream',
      },
      body,
    });
    return { status: res.status, body: await res.text().catch(() => '') };
  } catch (e) {
    return { status: null, body: e instanceof Error ? e.message : String(e) };
  }
}
