// M6 acceptance (SPEC §9.2, H1–H8) — House delivery, direct from the Worker. Home Assistant is a
// fake at https://ha.test (test/ha-helpers.ts); the House secrets are fake and set per call, over the
// pinned empty ones. H9 (migration 0013) is in migration-0013.test.ts.
import { createExecutionContext, env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/worker/index';
import type { Env } from '../src/worker/env';
import {
  EXHAUSTED, HOUSE_NOT_CONFIGURED, MAX_ATTEMPTS, classifyHouse, houseConfigOf, sendHouseDeliveries,
} from '../src/worker/house';
import { DELIVERY_STATUS, HOUSE_STATE } from '../src/shared/vocab';
import { BASE, owner, type Client } from './helpers';
import { ECHO_PATH, SATELLITE_PATH, fakeHa, houseEnv } from './ha-helpers';

let ha: ReturnType<typeof fakeHa>;
beforeEach(async () => {
  ha = fakeHa();
  await env.DB.prepare(`DELETE FROM deliveries WHERE channel = 'house'`).run();
});
afterEach(() => { vi.restoreAllMocks(); });

const NOW = '2026-10-10T12:00:00.000Z';
const minsBefore = (iso: string, m: number) => new Date(Date.parse(iso) - m * 60_000).toISOString();

/** A house delivery written straight to D1 (fire-less, like an announcement). */
async function houseRow(message: string, o: { status?: string; attempts?: number; claimedAt?: string | null; createdAt?: string } = {}) {
  const id = `dlv_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const at = o.createdAt ?? minsBefore(NOW, 1);
  await env.DB.prepare(
    `INSERT INTO deliveries (id, fire_id, alert_number, channel, member_id, message, status, attempts, claimed_at, created_at, updated_at)
     VALUES (?, NULL, 1, 'house', NULL, ?, ?, ?, ?, ?, ?)`).bind(id, message, o.status ?? 'queued', o.attempts ?? 0, o.claimedAt ?? null, at, at).run();
  return id;
}
const rowOf = (id: string) => env.DB.prepare('SELECT status, detail, attempts FROM deliveries WHERE id = ?').bind(id).first<{ status: string; detail: string | null; attempts: number }>();

describe('M6 House delivery (§9.2)', () => {
  it('H1: classifyHouse gives exactly sent / partial / failed, each a DELIVERY_STATUS', () => {
    const emitted = new Set([true, false].flatMap((a) => [true, false].map((b) => classifyHouse(a, b))));
    expect([...emitted].sort()).toEqual(['failed', 'partial', 'sent']);
    for (const s of emitted) expect(DELIVERY_STATUS).toContain(s);
    expect(classifyHouse(true, true)).toBe('sent');
    expect(classifyHouse(false, true)).toBe('partial');
  });

  it('H2: both HA calls — paths, UTF-8 bodies, the three auth headers, no redirects followed → sent', async () => {
    const cfg = houseConfigOf(houseEnv())!;
    expect(cfg.echoTargets).toContain("Kid's Room - Echo"); // from wrangler.toml [vars]
    const id = await houseRow('Ensō says: Kid’s bath');
    await sendHouseDeliveries(houseEnv(), NOW, [id]);

    expect(ha.heard.map((h) => h.path).sort()).toEqual([ECHO_PATH, SATELLITE_PATH].sort());
    const echo = ha.heard.find((h) => h.path === ECHO_PATH)!;
    const sat = ha.heard.find((h) => h.path === SATELLITE_PATH)!;
    expect(echo.json).toEqual({ target: cfg.echoTargets, message: 'Ensō says: Kid’s bath', data: { type: cfg.echoType } });
    expect(echo.json.data.type).toBe('announce');
    expect(sat.json).toEqual({ entity_id: cfg.satelliteEntity, message: 'Ensō says: Kid’s bath' });
    // UTF-8 on the wire: "ō" is C5 8D, and "Kid's" keeps its apostrophe.
    const bytes = [...echo.raw].map((b) => b.toString(16).padStart(2, '0')).join('');
    expect(bytes).toContain('c58d');
    expect(new TextDecoder().decode(echo.raw)).toContain(`"Kid's Room - Echo"`);
    for (const h of [echo, sat]) {
      expect(h.headers.get('CF-Access-Client-Id')).toBe('fake-access-id');
      expect(h.headers.get('CF-Access-Client-Secret')).toBe('fake-access-secret');
      expect(h.headers.get('Authorization')).toBe('Bearer fake-ha-token');
      expect(h.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
      expect(h.redirect).toBe('manual');
    }
    expect(await rowOf(id)).toEqual({ status: 'sent', detail: JSON.stringify({ echo: 'ok', voice_pe: 'ok' }), attempts: 1 });
  });

  it('H2: tick step 4 speaks a House timer through the Worker', async () => {
    const o = await owner();
    const t = await o.post('/timers', { title: 'Tea', intervalMin: 1, channels: ['house'], renotifyMin: null });
    await o.post(`/timers/${t.json.id}/commands`, { cmd: 'start' });
    const at = new Date(Date.now() + 2 * 60_000).toISOString();
    const r = await worker.fetch(new Request(`${BASE}/dev/tick?now=${encodeURIComponent(at)}`, { method: 'POST', headers: { cookie: o.cookie } }),
      houseEnv(), createExecutionContext());
    expect(r.status).toBe(200);
    expect(ha.heard.map((h) => h.json.message)).toEqual(['Timer: Tea', 'Timer: Tea']);
    const row = await env.DB.prepare(`SELECT status FROM deliveries WHERE channel = 'house' AND message = 'Timer: Tea'`).first<{ status: string }>();
    expect(row!.status).toBe('sent');
  });

  it('H3: an Access 302 is failed with its status; one surface down is partial; a throw is "error: …"', async () => {
    const login = { status: 302, body: '', headers: { Location: 'https://sogodojo.cloudflareaccess.com/cdn-cgi/access/login' } };
    ha.answers.set(ECHO_PATH, login);
    ha.answers.set(SATELLITE_PATH, login);
    const a = await houseRow('A');
    await sendHouseDeliveries(houseEnv(), NOW, [a]);
    const ra = await rowOf(a);
    expect(ra!.status).toBe('failed');
    expect(JSON.parse(ra!.detail!)).toEqual({ echo: 'HTTP 302: ', voice_pe: 'HTTP 302: ' });

    ha.answers.set(ECHO_PATH, { status: 500, body: 'x'.repeat(300) });
    ha.answers.set(SATELLITE_PATH, { status: 200, body: '[]' });
    const b = await houseRow('B');
    await sendHouseDeliveries(houseEnv(), NOW, [b]);
    const rb = await rowOf(b);
    expect(rb!.status).toBe('partial');
    expect(JSON.parse(rb!.detail!)).toEqual({ echo: `HTTP 500: ${'x'.repeat(200)}`, voice_pe: 'ok' });

    ha.answers.set(ECHO_PATH, 'throw');
    const c = await houseRow('C');
    await sendHouseDeliveries(houseEnv(), NOW, [c]);
    const rc = await rowOf(c);
    expect(rc!.status).toBe('partial');
    expect(JSON.parse(rc!.detail!).echo).toMatch(/^error: /);
    // A classified failure is final: the next drain does not retry it.
    const before = ha.heard.length;
    await sendHouseDeliveries(houseEnv(), NOW);
    expect(ha.heard.length).toBe(before);
    expect((await rowOf(a))!.status).toBe('failed');
    // No token anywhere in what was stored.
    for (const id of [a, b, c]) expect((await rowOf(id))!.detail).not.toMatch(/fake-/);
  });

  it('H4: any House setting missing → house_not_configured, and nothing is fetched', async () => {
    expect(houseConfigOf(env as unknown as Env)).toBeNull(); // the pinned test config: secrets empty
    const id = await houseRow('Unheard');
    await sendHouseDeliveries(env as unknown as Env, NOW);
    expect(await rowOf(id)).toMatchObject({ status: 'failed', detail: HOUSE_NOT_CONFIGURED });
    for (const key of ['HA_URL', 'ECHO_TARGETS', 'ECHO_TYPE', 'SATELLITE_ENTITY', 'HA_TOKEN', 'CF_ACCESS_CLIENT_ID', 'CF_ACCESS_CLIENT_SECRET'] as const) {
      expect(houseConfigOf({ ...houseEnv(), [key]: undefined }), key).toBeNull();
    }
    expect(houseConfigOf({ ...houseEnv(), ECHO_TARGETS: [] })).toBeNull();
    expect(ha.heard).toHaveLength(0);
  });

  it('H5 + H6: a stale claim is retried; a fresh claim is left alone; an exhausted row fails unspoken', async () => {
    const stale = await houseRow('Stale', { status: 'claimed', attempts: 1, claimedAt: minsBefore(NOW, 3) });
    const fresh = await houseRow('Fresh', { status: 'claimed', attempts: 1, claimedAt: minsBefore(NOW, 1) });
    const spent = await houseRow('Spent', { status: 'claimed', attempts: MAX_ATTEMPTS, claimedAt: minsBefore(NOW, 3) });
    const spentQueued = await houseRow('Spent queued', { attempts: MAX_ATTEMPTS });
    await sendHouseDeliveries(houseEnv(), NOW);
    expect(await rowOf(stale)).toMatchObject({ status: 'sent', attempts: 2 });
    expect(await rowOf(fresh)).toMatchObject({ status: 'claimed', attempts: 1 });
    expect(await rowOf(spent)).toEqual({ status: 'failed', detail: EXHAUSTED, attempts: MAX_ATTEMPTS });
    expect(await rowOf(spentQueued)).toMatchObject({ status: 'failed', detail: EXHAUSTED });
    expect(EXHAUSTED).toBe('house delivery never finished after 3 attempts');
    expect(ha.heard.map((h) => h.json.message)).toEqual(['Stale', 'Stale']);
  });

  it('H7: two drains at once over one queued row speak it once', async () => {
    const id = await houseRow('Once');
    await Promise.all([sendHouseDeliveries(houseEnv(), NOW, [id]), sendHouseDeliveries(houseEnv(), NOW), sendHouseDeliveries(houseEnv(), NOW)]);
    expect(ha.heard.map((h) => h.path).sort()).toEqual([ECHO_PATH, SATELLITE_PATH].sort());
    expect(await rowOf(id)).toMatchObject({ status: 'sent', attempts: 1 });
  });

  it('H8: /status house.state — untried → ok → failing; not_configured without the settings', async () => {
    const o = await owner();
    const status = async (c: Client, e: Env) => {
      const r = await worker.fetch(new Request(`${BASE}/status`, { headers: { cookie: c.cookie } }), e, createExecutionContext());
      return ((await r.json()) as any).house;
    };
    expect(await status(o, houseEnv())).toEqual({ state: 'untried', lastOkAt: null, lastFailedAt: null, lastError: null });

    const t1 = '2026-10-10T12:00:00.000Z', t2 = '2026-10-10T12:05:00.000Z';
    await sendHouseDeliveries(houseEnv(), t1, [await houseRow('One')]);
    expect(await status(o, houseEnv())).toEqual({ state: 'ok', lastOkAt: t1, lastFailedAt: null, lastError: null });

    ha.answers.set(ECHO_PATH, { status: 302 });
    ha.answers.set(SATELLITE_PATH, { status: 502, body: 'Bad gateway' });
    await sendHouseDeliveries(houseEnv(), t2, [await houseRow('Two')]);
    const failing = await status(o, houseEnv());
    expect(failing).toMatchObject({ state: 'failing', lastOkAt: t1, lastFailedAt: t2 });
    expect(JSON.parse(failing.lastError)).toEqual({ echo: 'HTTP 302: ', voice_pe: 'HTTP 502: Bad gateway' });

    expect((await o.get('/status')).json.house.state).toBe('not_configured'); // SELF: the pinned, unconfigured env
    expect([...HOUSE_STATE].sort()).toEqual(['failing', 'not_configured', 'ok', 'untried']);
  });
});
