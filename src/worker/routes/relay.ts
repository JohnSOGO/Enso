// SPEC §9.2 — the LAN relay pulls house deliveries and reports results.
import { Hono, type MiddlewareHandler } from 'hono';
import type { AppEnv } from '../env';
import { RELAY_REPORT_STATUS, isOneOf } from '../../shared/vocab';
import { all, nowIso, run } from '../db';
import { body, fail, str } from '../http';

const CLAIM_BATCH = 5;
const RECLAIM_AFTER_MS = 2 * 60_000;
const MAX_ATTEMPTS = 3;

const requireRelay: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = c.req.header('Authorization')?.replace(/^Bearer /, '');
  if (!c.env.RELAY_TOKEN || token !== c.env.RELAY_TOKEN) return fail(c, 401, 'unauthenticated', 'Relay token missing or wrong.');
  await next();
};

/** The server-side validator for relay reports — the contract test calls this directly. */
export function relayReportError(b: Record<string, unknown>): string | null {
  if (!str(b.id, 100)) return 'id is required.';
  if (!isOneOf(RELAY_REPORT_STATUS, b.status)) return `status must be one of: ${RELAY_REPORT_STATUS.join(', ')}.`;
  if (b.detail !== undefined && b.detail !== null && typeof b.detail !== 'string' && typeof b.detail !== 'object') return 'detail must be text or an object.';
  return null;
}

export const relay = new Hono<AppEnv>();

relay.post('/relay/claim', requireRelay, async (c) => {
  const db = c.env.DB;
  const now = nowIso();
  const stale = new Date(Date.now() - RECLAIM_AFTER_MS).toISOString();
  await db.batch([
    db.prepare('UPDATE settings SET relay_last_seen = ? WHERE id = 1').bind(now),
    db.prepare(
      `UPDATE deliveries SET status = 'failed', detail = COALESCE(detail, 'relay never reported after ${MAX_ATTEMPTS} attempts'), updated_at = ?
        WHERE channel = 'house' AND attempts >= ? AND (status = 'queued' OR (status = 'claimed' AND claimed_at < ?))`).bind(now, MAX_ATTEMPTS, stale),
  ]);
  const picked = await all<{ id: string; message: string }>(db,
    `SELECT id, message FROM deliveries
      WHERE channel = 'house' AND (status = 'queued' OR (status = 'claimed' AND claimed_at < ?))
      ORDER BY created_at LIMIT ?`, stale, CLAIM_BATCH);
  if (picked.length) {
    await db.batch(picked.map((d) => db.prepare(
      `UPDATE deliveries SET status = 'claimed', claimed_at = ?, attempts = attempts + 1, updated_at = ? WHERE id = ?`).bind(now, now, d.id)));
  }
  return c.json(picked);
});

relay.post('/relay/report', requireRelay, async (c) => {
  const b = await body(c);
  const err = relayReportError(b);
  if (err) return fail(c, 400, 'invalid_input', err);
  const detail = b.detail === undefined || b.detail === null ? null : typeof b.detail === 'string' ? b.detail : JSON.stringify(b.detail);
  const r = await run(c.env.DB,
    `UPDATE deliveries SET status = ?, detail = ?, updated_at = ? WHERE id = ? AND channel = 'house' AND status = 'claimed'`,
    b.status, detail, nowIso(), b.id);
  if (r.meta.changes !== 1) return fail(c, 404, 'not_found', 'No claimed house delivery with that id.');
  return c.json({ ok: true });
});
