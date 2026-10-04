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

export interface Heard { path: string; headers: Headers; redirect: string; raw: Uint8Array; json: any }
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
    heard.push({ path: url.pathname, headers: req.headers, redirect: req.redirect, raw, json: JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(raw)) });
    const a = answers.get(url.pathname) ?? { status: 200, body: '[]' };
    if (a === 'throw') throw new Error('connection refused');
    return new Response(a.body ?? '', { status: a.status, headers: a.headers });
  });
  return { heard, answers };
}
