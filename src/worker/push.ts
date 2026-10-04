// SPEC §9.1 — Web Push delivery: what is sent to whom, and what each result means. The protocol
// itself (encryption, VAPID) is web-push.ts. Every push delivery ends `sent` or visibly `failed`.
import type { Env } from './env';
import { all } from './db';
import { pushActions } from '../shared/engine';
import { ANNOUNCE_TITLE } from '../shared/announce';
import type { Action, AlertKind } from '../shared/vocab';
import { sendWebPush, type VapidKeys } from './web-push';

export const NO_SUBSCRIPTION = 'no_subscription';
export const PUSH_NOT_CONFIGURED = 'push_not_configured';
export const PUSH_TITLE = 'Ensō';
export const TEST_BODY = 'Ensō test — phone alerts work';
export const TEST_TAG = 'enso-test';
const DETAIL_MAX = 500;

/**
 * The notification the service worker shows (sw.js). A test push, an announcement (§9.3) and a ping (§9.4) have no
 * fire, no kind, no actions. `tag` is what the phone collapses by (never sent as a Topic — Apple refuses it): a fire's push →
 * its fireId; a delivery with no fire → its delivery id; the test push → TEST_TAG. `url` is where a tap goes: the
 * delivery's `deliveries.url` (only a sign-in request has one, §6.6), else null.
 */
export interface PushPayload { fireId: string | null; kind: AlertKind | null; tag: string; title: string; body: string; actions: Action[]; url: string | null }

interface Sub { id: string; endpoint: string; p256dh: string; auth: string }

/** The VAPID keys, or null when any is missing (§2.4) — then nothing is sent and the caller says so. */
export function vapidOf(env: Env): VapidKeys | null {
  const { VAPID_SUBJECT: subject, VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey } = env;
  return subject && publicKey && privateKey ? { subject, publicKey, privateKey } : null;
}

const subsOf = (db: D1Database, memberId: string) =>
  all<Sub>(db, 'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE member_id = ?', memberId);

/**
 * Sends one payload to each subscription and records each result on the subscription (§9.1):
 * 201 → last_ok_at; 404/410 → the subscription is gone, deleted; anything else → last_error.
 * Returns how many succeeded and the failures, one line each.
 */
async function sendToAll(db: D1Database, vapid: VapidKeys, subs: Sub[], payload: PushPayload, now: string) {
  const results = await Promise.all(subs.map((s) =>
    sendWebPush(vapid, s, JSON.stringify(payload), { now }))); // no Topic: Apple refuses it (§9.1)
  const stmts: D1PreparedStatement[] = [];
  const failures: string[] = [];
  results.forEach((r, i) => {
    const sub = subs[i];
    if (r.status === 201) {
      stmts.push(db.prepare('UPDATE push_subscriptions SET last_ok_at = ? WHERE id = ?').bind(now, sub.id));
    } else if (r.status === 404 || r.status === 410) {
      failures.push(`push ${r.status}: subscription gone, removed`);
      stmts.push(db.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(sub.id));
    } else {
      const line = `push ${r.status ?? 'error'}: ${r.body || '(empty body)'}`.slice(0, DETAIL_MAX);
      failures.push(line);
      stmts.push(db.prepare('UPDATE push_subscriptions SET last_error = ? WHERE id = ?').bind(line, sub.id));
    }
  });
  if (stmts.length) await db.batch(stmts);
  return { sent: results.filter((r) => r.status === 201).length, failures };
}

/**
 * Tick step 3 (and POST /announce, POST /ops/notify): send each queued push delivery to every subscription
 * of its member, and record the outcome. A delivery with no fire is an announcement (§9.3), a ping with
 * its own title (§9.4), or a sign-in notice with its own title and maybe a url (§6.6).
 */
export async function sendPushDeliveries(env: Env, deliveryIds: string[], now: string): Promise<void> {
  const db = env.DB;
  const vapid = vapidOf(env);
  const rows = await all<{ id: string; member_id: string; message: string; title: string | null; url: string | null; fire_id: string | null; kind: AlertKind | null }>(db,
    `SELECT d.id, d.member_id, d.message, d.title, d.url, d.fire_id, f.kind FROM deliveries d LEFT JOIN fires f ON f.id = d.fire_id
      WHERE d.id IN (${deliveryIds.map(() => '?').join(',')})`, ...deliveryIds);
  for (const d of rows) {
    let status: 'sent' | 'failed' = 'failed';
    let detail: string | null;
    if (!vapid) detail = PUSH_NOT_CONFIGURED;
    else {
      const subs = await subsOf(db, d.member_id);
      if (subs.length === 0) detail = NO_SUBSCRIPTION;
      else {
        const payload: PushPayload = d.fire_id === null || d.kind === null
          ? { fireId: null, kind: null, tag: d.id, title: d.title ?? ANNOUNCE_TITLE, body: d.message, actions: [], url: d.url }
          : { fireId: d.fire_id, kind: d.kind, tag: d.fire_id, title: PUSH_TITLE, body: d.message, actions: pushActions(d.kind), url: null };
        const r = await sendToAll(db, vapid, subs, payload, now);
        if (r.sent > 0) status = 'sent';
        detail = r.failures.length ? r.failures.join('; ').slice(0, DETAIL_MAX) : null;
      }
    }
    await db.prepare(`UPDATE deliveries SET status = ?, detail = ?, attempts = attempts + 1, updated_at = ? WHERE id = ?`)
      .bind(status, detail, now, d.id).run();
  }
}

/** `POST /push/test` (§9.1): one push to each of my subscriptions now. */
export async function sendTestPush(env: Env, memberId: string, now: string):
  Promise<{ sent: number } | { error: typeof NO_SUBSCRIPTION | typeof PUSH_NOT_CONFIGURED | 'push_failed'; message: string }> {
  const subs = await subsOf(env.DB, memberId);
  if (subs.length === 0) return { error: NO_SUBSCRIPTION, message: 'No phone is subscribed for you yet — turn phone alerts on first.' };
  const vapid = vapidOf(env);
  if (!vapid) return { error: PUSH_NOT_CONFIGURED, message: 'Phone alerts are not set up on this server (no push keys).' };
  const r = await sendToAll(env.DB, vapid, subs, { fireId: null, kind: null, tag: TEST_TAG, title: PUSH_TITLE, body: TEST_BODY, actions: [], url: null }, now);
  return r.sent > 0 ? { sent: r.sent } : { error: 'push_failed', message: `The test push did not go through: ${r.failures.join('; ')}` };
}
