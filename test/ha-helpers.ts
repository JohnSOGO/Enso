// SPEC §9.2 — a fake Home Assistant at https://ha.test (the HA_URL vitest.config.ts pins). Nothing
// here ever leaves the isolate: a fetch to any other host fails the test instead of going out.
import { env } from 'cloudflare:test';
import { vi } from 'vitest';
import type { Env } from '../src/worker/env';

export const ECHO_PATH = '/api/services/notify/alexa_media';
export const SATELLITE_PATH = '/api/services/assist_satellite/announce';

/** The pinned env with non-empty FAKE House secrets — House is configured, and still speaks only to ha.test. */
export const houseEnv = (): Env => ({
  ...(env as unknown as Env),
  HA_TOKEN: 'fake-ha-token', CF_ACCESS_CLIENT_ID: 'fake-access-id', CF_ACCESS_CLIENT_SECRET: 'fake-access-secret',
});

export interface Heard { method: string; path: string; headers: Headers; redirect: string; raw: Uint8Array; json: any }
type Answer = { status: number; body?: string; headers?: Record<string, string> } | 'throw';

/** Starts the fake HA (call in beforeEach; vi.restoreAllMocks() in afterEach). `answers` is keyed by path; default 200. */
export function fakeHa() {
  const heard: Heard[] = [];
  const answers = new Map<string, Answer>();
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    if (url.hostname !== 'ha.test') throw new Error(`a test tried to reach ${url.host} — only https://ha.test is allowed`);
    const raw = new Uint8Array(await req.arrayBuffer());
    heard.push({ method: req.method, path: decodeURIComponent(url.pathname), headers: req.headers, redirect: req.redirect, raw, json: raw.length ? JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(raw)) : null });
    const a = answers.get(url.pathname) ?? { status: 200, body: '[]' };
    if (a === 'throw') throw new Error('connection refused');
    return new Response(a.body ?? '', { status: a.status, headers: a.headers });
  });
  return { heard, answers };
}

/** §9.2e — the Midea AC as HA answers `/api/states/{id}` (MojoSOGO's room, 2026-10-27). */
export const AC = 'climate.midea_ac_151732605523107';
export const AC_STATE = JSON.stringify({
  entity_id: AC, state: 'fan_only',
  attributes: { friendly_name: 'Midea AC 151732605523107', hvac_modes: ['fan_only', 'dry', 'cool', 'auto', 'off'],
    current_temperature: 54.5, temperature: 70, min_temp: 60, max_temp: 86, fan_mode: 'auto' },
});
