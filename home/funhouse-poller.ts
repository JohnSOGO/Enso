// SPEC §9.4a — the FunHouse poller. Runs on the dev PC (Node 24), never in the Worker: every FUNHOUSE_POLL_MS it
// asks Ensō's GET /ops/pings (Bearer OPS_NOTIFY_TOKEN, read from %USERPROFILE%\.enso\ops-notify-token) for founder
// pings and FunHouse alerts (§9.4b) after the last one handled, and hands Claude's pings (🤖 / 🧵) and every FunHouse
// alert to the FunHouse bridge on 127.0.0.1:8765, at most one a poll. The bridge is local only, so the PC pulls; nothing inbound. Node globals and node:fs only —
// `npm run build:home` bundles it into home/dist/funhouse-poller.mjs. The token is never logged.
import { readFileSync, writeFileSync } from 'node:fs';

export const ENSO_API = 'https://enso.sogodojo.com/api/v1';
export const BRIDGE_URL = 'http://127.0.0.1:8765/notify';
/** ⚑ How often Ensō is asked. */
export const FUNHOUSE_POLL_MS = 15_000;
/** ⚑ Older than this is stale: never shown. Also how far back the first poll reaches when no saved `after` is newer
 *  (the bridge does not drop a repeated id). */
export const FUNHOUSE_STALE_MS = 10 * 60_000;

/** Mirrors OpsPing in src/worker/deliveries.ts (the HTTP contract). */
export interface Ping { id: string; channel: 'push' | 'funhouse'; title: string; text: string; at: string }

/** §9.4b every FunHouse alert; ⚑ Q228 of the pings, Claude's only — Ozymandias (🏛️) reaches the FunHouse itself. */
export function forFunhouse(p: Pick<Ping, 'channel' | 'title'>): boolean {
  return p.channel === 'funhouse' || p.title.startsWith('🤖') || p.title.startsWith('🧵');
}

/** ⚑ Q229 / Q233 — the bridge body for one ping or FunHouse alert; a 🧵 thread ping's text already names project and thread. */
export function funhouseNotice(p: Ping) {
  const text = p.channel === 'push' && p.title.startsWith('🧵') ? p.text : `${p.title}: ${p.text}`;
  return { source: p.channel === 'funhouse' ? 'Ensō' : 'Claude', level: 'attention', text: text.slice(0, 500), sig: '⭕🔁🏠', beep: 'look', id: p.id };
}

export interface PollDeps { fetch: typeof fetch; token: string; log: (line: string) => void; now: () => number }

/** One poll: the `after` to use next. At most one bridge POST; 200 / 4xx → handled, 503 / a network error /
 *  anything wrong from Ensō → unchanged (tried again next poll). A ping older than FUNHOUSE_STALE_MS is skipped, so
 *  a backlog left by a bridge outage is dropped, not replayed. */
export async function pollOnce(after: string, deps: PollDeps): Promise<string> {
  let pings: Ping[];
  try {
    const r = await deps.fetch(`${ENSO_API}/ops/pings?after=${encodeURIComponent(after)}`,
      { headers: { authorization: `Bearer ${deps.token}` } });
    if (r.status !== 200) { deps.log(`enso → ${r.status}`); return after; }
    pings = ((await r.json()) as { pings: Ping[] }).pings;
  } catch (err) {
    deps.log(`enso → ${err instanceof Error ? err.message : String(err)}`);
    return after;
  }
  let next = after;
  for (const p of pings) {
    if (!forFunhouse(p)) { next = p.at; continue; }
    if (deps.now() - Date.parse(p.at) > FUNHOUSE_STALE_MS) { deps.log(`${p.id} → stale, skipped`); next = p.at; continue; }
    try {
      const r = await deps.fetch(BRIDGE_URL, {
        method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' },
        body: new TextEncoder().encode(JSON.stringify(funhouseNotice(p))),
      });
      deps.log(`${p.id} → bridge ${r.status}`);
      return r.status === 200 || (r.status >= 400 && r.status < 500) ? p.at : next;
    } catch (err) {
      deps.log(`${p.id} → bridge ${err instanceof Error ? err.message : String(err)}`);
      return next;
    }
  }
  return next;
}

/** §9.4a — the first `after`: the saved one when it is a valid instant within FUNHOUSE_STALE_MS, else that far back. */
export function startAfter(saved: string | null, nowMs: number): string {
  const back = nowMs - FUNHOUSE_STALE_MS;
  const t = saved ? Date.parse(saved.trim()) : NaN;
  return Number.isFinite(t) && t > back && t <= nowMs ? new Date(t).toISOString() : new Date(back).toISOString();
}

const stamp = (line: string) => `${new Date().toISOString()} ${line}`;

/** The loop: the only node:fs and clock user. */
export function main(home: string | undefined): number {
  let token = '';
  try { token = readFileSync(`${home}\\.enso\\ops-notify-token`, 'utf8').trim(); } catch { /* reported below */ }
  if (!token) { console.error(stamp('no token in %USERPROFILE%\\.enso\\ops-notify-token')); return 1; }
  const afterFile = `${home}\\.enso\\funhouse-poller-after`; // so a restart never re-sends what was handled
  let saved: string | null = null;
  try { saved = readFileSync(afterFile, 'utf8'); } catch { /* none yet */ }
  let after = startAfter(saved, Date.now());
  let busy = false;
  const deps: PollDeps = { fetch, token, log: (line) => console.log(stamp(line)), now: Date.now };
  const tick = () => {
    if (busy) return;
    busy = true;
    pollOnce(after, deps).then((a) => {
      if (a === after) return;
      after = a;
      try { writeFileSync(afterFile, after); } catch (err) { deps.log(`after file → ${err instanceof Error ? err.message : String(err)}`); }
    }).finally(() => { busy = false; });
  };
  console.log(stamp(`funhouse poller: ${ENSO_API} → ${BRIDGE_URL} every ${FUNHOUSE_POLL_MS / 1000}s`));
  tick();
  setInterval(tick, FUNHOUSE_POLL_MS);
  return 0;
}

// Run only as the bundled script (node funhouse-poller.mjs), never when a test imports this file.
const proc = (globalThis as { process?: { argv?: string[]; env?: Record<string, string | undefined>; exitCode?: number } }).process;
if (proc?.argv?.[1]?.endsWith('funhouse-poller.mjs')) proc.exitCode = main(proc.env?.USERPROFILE);
