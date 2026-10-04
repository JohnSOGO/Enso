// SPEC §9.2 — House delivery: the Worker speaks `house` deliveries through Home Assistant, over a
// Cloudflare Tunnel guarded by Cloudflare Access. It never decides what is sent (tick and
// POST /announce write the rows); every row it takes ends sent / partial or visibly failed.
import type { Env } from './env';
import { all, first } from './db';
import type { DeliveryStatus, HouseState } from '../shared/vocab';

export const HOUSE_NOT_CONFIGURED = 'house_not_configured';
export const MAX_ATTEMPTS = 3;
export const DRAIN_BATCH = 5;
export const RECLAIM_AFTER_MS = 2 * 60_000;
export const ECHO_TIMEOUT_MS = 15_000;
/** ⚑ Q37 — the relay waited 30 s; 25 s keeps one call inside the ~30 s waitUntil budget. */
export const SATELLITE_TIMEOUT_MS = 25_000;
export const EXHAUSTED = `house delivery never finished after ${MAX_ATTEMPTS} attempts`;
const BODY_MAX = 200;

export interface HouseConfig {
  haUrl: string; echoTargets: string[]; echoType: string; satelliteEntity: string;
  haToken: string; accessId: string; accessSecret: string;
}

/** All seven House settings, or null when any is missing — then nothing is spoken, visibly. */
export function houseConfigOf(env: Env): HouseConfig | null {
  const { HA_URL, ECHO_TARGETS, ECHO_TYPE, SATELLITE_ENTITY, HA_TOKEN, CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET } = env;
  const targetsOk = Array.isArray(ECHO_TARGETS) && ECHO_TARGETS.length > 0 && ECHO_TARGETS.every((t) => typeof t === 'string' && t);
  if (!HA_URL || !targetsOk || !ECHO_TYPE || !SATELLITE_ENTITY || !HA_TOKEN || !CF_ACCESS_CLIENT_ID || !CF_ACCESS_CLIENT_SECRET) return null;
  return {
    haUrl: HA_URL.replace(/\/+$/, ''), echoTargets: ECHO_TARGETS, echoType: ECHO_TYPE, satelliteEntity: SATELLITE_ENTITY,
    haToken: HA_TOKEN, accessId: CF_ACCESS_CLIENT_ID, accessSecret: CF_ACCESS_CLIENT_SECRET,
  };
}

export type HouseResult = Exclude<DeliveryStatus, 'queued' | 'claimed'>;

/** Both surfaces ok → sent; one → partial; neither → failed. */
export function classifyHouse(echoOk: boolean, satOk: boolean): HouseResult {
  if (echoOk && satOk) return 'sent';
  if (echoOk || satOk) return 'partial';
  return 'failed';
}

/** One POST to HA → "ok" (a 2xx only), "HTTP <status>: <body>" or "error: <message>". Never names a token. */
async function ha(cfg: HouseConfig, path: string, payload: unknown, timeoutMs: number): Promise<string> {
  try {
    const res = await fetch(`${cfg.haUrl}${path}`, {
      method: 'POST',
      redirect: 'manual', // Access answers a bad service token with a 302 to its login page — a failure
      headers: {
        'CF-Access-Client-Id': cfg.accessId,
        'CF-Access-Client-Secret': cfg.accessSecret,
        Authorization: `Bearer ${cfg.haToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text().catch(() => '');
    return res.status >= 200 && res.status < 300 ? 'ok' : `HTTP ${res.status}: ${text.slice(0, BODY_MAX)}`;
  } catch (e) {
    return `error: ${(e as Error).message}`;
  }
}

async function speak(cfg: HouseConfig, message: string): Promise<{ status: HouseResult; detail: string }> {
  const [echo, voicePe] = await Promise.all([
    ha(cfg, '/api/services/notify/alexa_media', { target: cfg.echoTargets, message, data: { type: cfg.echoType } }, ECHO_TIMEOUT_MS),
    ha(cfg, '/api/services/assist_satellite/announce', { entity_id: cfg.satelliteEntity, message }, SATELLITE_TIMEOUT_MS),
  ]);
  return { status: classifyHouse(echo === 'ok', voicePe === 'ok'), detail: JSON.stringify({ echo, voice_pe: voicePe }) };
}

/**
 * Tick step 4 (all house rows) and POST /announce (`ids`: its one row): fail the exhausted rows, then
 * claim and speak up to DRAIN_BATCH queued or stale-claimed rows, one after another. Each claim is
 * conditional and made just before speaking, so two drains never speak one row twice.
 */
export async function sendHouseDeliveries(env: Env, now: string, ids?: string[]): Promise<void> {
  if (ids && ids.length === 0) return;
  const db = env.DB;
  const stale = new Date(Date.parse(now) - RECLAIM_AFTER_MS).toISOString();
  const takeable = `channel = 'house' AND (status = 'queued' OR (status = 'claimed' AND claimed_at < ?))`;
  const only = ids ? ` AND id IN (${ids.map(() => '?').join(',')})` : '';
  const idArgs = ids ?? [];

  await db.prepare(`UPDATE deliveries SET status = 'failed', detail = COALESCE(detail, ?), updated_at = ?
                     WHERE ${takeable} AND attempts >= ?${only}`).bind(EXHAUSTED, now, stale, MAX_ATTEMPTS, ...idArgs).run();

  const cfg = houseConfigOf(env);
  if (!cfg) {
    await db.prepare(`UPDATE deliveries SET status = 'failed', detail = ?, updated_at = ? WHERE ${takeable}${only}`)
      .bind(HOUSE_NOT_CONFIGURED, now, stale, ...idArgs).run();
    return;
  }

  const picked = await all<{ id: string; message: string }>(db,
    `SELECT id, message FROM deliveries WHERE ${takeable}${only} ORDER BY created_at LIMIT ?`, stale, ...idArgs, DRAIN_BATCH);
  for (const d of picked) {
    const claim = await db.prepare(
      `UPDATE deliveries SET status = 'claimed', claimed_at = ?, attempts = attempts + 1, updated_at = ?
        WHERE id = ? AND channel = 'house' AND (status = 'queued' OR (status = 'claimed' AND claimed_at < ?))`)
      .bind(now, now, d.id, stale).run();
    if (claim.meta.changes !== 1) continue; // another drain took it
    const r = await speak(cfg, d.message);
    await db.prepare(`UPDATE deliveries SET status = ?, detail = ?, updated_at = ? WHERE id = ? AND status = 'claimed' AND claimed_at = ?`)
      .bind(r.status, r.detail, now, d.id, now).run();
  }
}

/** /status `house` (§9.2): derived from the newest finished house delivery, never stored. */
export async function houseState(env: Env): Promise<{ state: HouseState; lastOkAt: string | null; lastFailedAt: string | null; lastError: string | null }> {
  const db = env.DB;
  const newest = await first<{ status: DeliveryStatus }>(db,
    `SELECT status FROM deliveries WHERE channel = 'house' AND status IN ('sent', 'partial', 'failed')
      ORDER BY updated_at DESC, created_at DESC LIMIT 1`);
  const ok = await first<{ at: string | null }>(db,
    `SELECT MAX(updated_at) AS at FROM deliveries WHERE channel = 'house' AND status IN ('sent', 'partial')`);
  const bad = await first<{ updated_at: string; detail: string | null }>(db,
    `SELECT updated_at, detail FROM deliveries WHERE channel = 'house' AND status = 'failed' ORDER BY updated_at DESC, created_at DESC LIMIT 1`);
  const state: HouseState = !houseConfigOf(env) ? 'not_configured' : !newest ? 'untried' : newest.status === 'failed' ? 'failing' : 'ok';
  return { state, lastOkAt: ok?.at ?? null, lastFailedAt: bad?.updated_at ?? null, lastError: bad?.detail ?? null };
}
