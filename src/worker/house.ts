// SPEC §9.2 — House delivery: the Worker speaks `house` deliveries through Home Assistant, over a
// Cloudflare Tunnel guarded by Cloudflare Access. It never decides what is sent or on which speakers
// (tick and POST /announce write the rows, §9.2a); every row it takes ends sent / partial or visibly
// failed. It also asks HA for its speaker list (§9.2a), giving back the raw answer.
import type { Env } from './env';
import { all, first, parseJson } from './db';
import { callThroughAccess } from './access';
import { everySpeaker, speakerList, splitSpeakers } from '../shared/speakers';
import type { DeliveryStatus, HouseState } from '../shared/vocab';

export const HOUSE_NOT_CONFIGURED = 'house_not_configured';
export const MAX_ATTEMPTS = 3;
export const DRAIN_BATCH = 5;
export const RECLAIM_AFTER_MS = 2 * 60_000;
export const ECHO_TIMEOUT_MS = 15_000;
/** ⚑ Q37 — the relay waited 30 s; 25 s keeps one call inside the ~30 s waitUntil budget. */
export const SATELLITE_TIMEOUT_MS = 25_000;
export const EXHAUSTED = `house delivery never finished after ${MAX_ATTEMPTS} attempts`;

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

/** §9.2a — the default speakers as configured: the Echo names, then the Voice PE. */
export const defaultSpeakers = (cfg: HouseConfig): string[] => [...cfg.echoTargets, cfg.satelliteEntity];

export type HouseResult = Exclude<DeliveryStatus, 'queued' | 'claimed'>;

/** Over the surfaces that were called: all ok → sent; some → partial; none (or none called) → failed. */
export function classifyHouse(oks: readonly boolean[]): HouseResult {
  const n = oks.filter(Boolean).length;
  return n === 0 ? 'failed' : n === oks.length ? 'sent' : 'partial';
}

/** One POST to HA → its answer text on a 2xx, else access.ts's honest reason. Never names a token. */
function ha(cfg: HouseConfig, path: string, payload: unknown, timeoutMs: number) {
  return callThroughAccess(cfg, `${cfg.haUrl}${path}`, {
    method: 'POST', timeoutMs, body: JSON.stringify(payload),
    headers: { Authorization: `Bearer ${cfg.haToken}`, 'Content-Type': 'application/json; charset=utf-8' },
  });
}
const said = async (r: ReturnType<typeof ha>) => { const x = await r; return x.ok ? 'ok' : x.reason; };

/** §9.2 step 4: on the row's speakers (NULL → the defaults); a surface with no speaker is not called. */
async function speak(cfg: HouseConfig, message: string, speakers: string[] | null): Promise<{ status: HouseResult; detail: string }> {
  const { echo, satellite } = speakers === null ? { echo: cfg.echoTargets, satellite: [cfg.satelliteEntity] } : splitSpeakers(speakers);
  const [e, v] = await Promise.all([
    echo.length ? said(ha(cfg, '/api/services/notify/alexa_media', { target: echo, message, data: { type: cfg.echoType } }, ECHO_TIMEOUT_MS)) : null,
    satellite.length ? said(ha(cfg, '/api/services/assist_satellite/announce',
      { entity_id: speakers === null ? cfg.satelliteEntity : satellite, message }, SATELLITE_TIMEOUT_MS)) : null,
  ]);
  const called = { ...(e !== null && { echo: e }), ...(v !== null && { voice_pe: v }) };
  return { status: classifyHouse(Object.values(called).map((r) => r === 'ok')), detail: JSON.stringify(called) };
}

/** §9.2a — HA's speaker list, rendered by HA from this template; read by speakerList, never here. */
export const SPEAKER_TEMPLATE = `{%- set ns = namespace(out=[]) -%}
{%- for e in integration_entities('alexa_media') | select('match', 'media_player[.]') -%}
  {%- set ns.out = ns.out + [{'id': e, 'name': state_attr(e, 'friendly_name') or e}] -%}
{%- endfor -%}
{%- for s in states.assist_satellite -%}
  {%- set ns.out = ns.out + [{'id': s.entity_id, 'name': s.name}] -%}
{%- endfor -%}
{{ ns.out | tojson }}`;

/** One POST of SPEAKER_TEMPLATE to /api/template → HA's raw answer, or an honest reason. */
export const houseSpeakerList = (cfg: HouseConfig) => ha(cfg, '/api/template', { template: SPEAKER_TEMPLATE }, ECHO_TIMEOUT_MS);

/** §7D.3 — every speaker HA lists now; null (the default speakers) when House is off or the list can't be read. */
export async function allHouseSpeakers(env: Env): Promise<string[] | null> {
  const cfg = houseConfigOf(env);
  const r = cfg && await houseSpeakerList(cfg);
  const list = r?.ok ? speakerList(r.text) : null;
  return list?.length ? everySpeaker(list) : null;
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

  const picked = await all<{ id: string; message: string; speakers: string | null }>(db,
    `SELECT id, message, speakers FROM deliveries WHERE ${takeable}${only} ORDER BY created_at LIMIT ?`, stale, ...idArgs, DRAIN_BATCH);
  for (const d of picked) {
    const claim = await db.prepare(
      `UPDATE deliveries SET status = 'claimed', claimed_at = ?, attempts = attempts + 1, updated_at = ?
        WHERE id = ? AND channel = 'house' AND (status = 'queued' OR (status = 'claimed' AND claimed_at < ?))`)
      .bind(now, now, d.id, stale).run();
    if (claim.meta.changes !== 1) continue; // another drain took it
    const r = await speak(cfg, d.message, parseJson<string[] | null>(d.speakers, null));
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
