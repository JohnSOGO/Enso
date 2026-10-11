// SPEC §9.4a (FP4–FP6) — the FunHouse poller's pure parts and one poll over a fake Ensō and a fake bridge (no
// network, no filesystem): Claude's pings only, at most one bridge POST a poll, 503 retried, 4xx not.
import { expect, it } from 'vitest';
import { BRIDGE_URL, ENSO_API, forFunhouse, funhouseNotice, pollOnce, type Ping } from '../home/funhouse-poller';

const TOKEN = 'poller-test-token';
const ping = (id: string, title: string, at: string): Ping => ({ id, title, text: `text ${id}`, at });
const OZY = ping('dlv_o', '🏛️ Ozymandias', '2026-10-11T01:00:00.000Z');
const A = ping('dlv_a', '🧵 Thread needs you', '2026-10-11T01:01:00.000Z');
const B = ping('dlv_b', '🤖 Claude', '2026-10-11T01:02:00.000Z');

/** A fake Ensō holding `pings` (answering those after `after`) and a bridge answering `bridge` in turn. */
function world(pings: Ping[], bridge: number[]) {
  const sent: unknown[] = [];
  const asked: string[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === BRIDGE_URL) {
      sent.push(JSON.parse(new TextDecoder().decode(init!.body as Uint8Array)));
      return new Response('{}', { status: bridge.shift() ?? 200 });
    }
    expect(url.startsWith(`${ENSO_API}/ops/pings?after=`)).toBe(true);
    expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${TOKEN}`);
    const after = decodeURIComponent(url.split('after=')[1]);
    asked.push(after);
    return Response.json({ pings: pings.filter((p) => p.at > after) });
  }) as typeof fetch;
  return { sent, asked, deps: { fetch: f, token: TOKEN, log: () => {} } };
}

it('FP4: forFunhouse and funhouseNotice', () => {
  expect(forFunhouse('🧵 Thread needs you')).toBe(true);
  expect(forFunhouse('🤖 Claude ⭕🔁🏠')).toBe(true);
  expect(forFunhouse('🏛️ Ozymandias')).toBe(false);
  expect(funhouseNotice(A)).toEqual({
    source: 'Claude', level: 'attention', text: '🧵 Thread needs you: text dlv_a', sig: '⭕🔁🏠', beep: 'look', id: 'dlv_a',
  });
});

it('FP5: an Ozymandias ping is skipped; one bridge POST a poll, the next poll sends the next', async () => {
  const w = world([OZY, A, B], []);
  const start = '2026-10-11T00:50:00.000Z';
  const one = await pollOnce(start, w.deps);
  expect(one).toBe(A.at);
  expect(w.sent).toEqual([funhouseNotice(A)]);
  const two = await pollOnce(one, w.deps);
  expect(two).toBe(B.at);
  expect(w.sent).toEqual([funhouseNotice(A), funhouseNotice(B)]);
  expect(await pollOnce(two, w.deps)).toBe(B.at);
  expect(w.sent).toHaveLength(2);
});

it('FP6: the bridge answering 503 → after unchanged, sent again; 400 → handled, not retried; Ensō down → unchanged', async () => {
  const w = world([A], [503, 400]);
  const start = '2026-10-11T00:50:00.000Z';
  expect(await pollOnce(start, w.deps)).toBe(start);
  expect(await pollOnce(start, w.deps)).toBe(A.at);
  expect(w.sent).toEqual([funhouseNotice(A), funhouseNotice(A)]);
  const down = { fetch: (async () => new Response('', { status: 502 })) as typeof fetch, token: TOKEN, log: () => {} };
  expect(await pollOnce(start, down)).toBe(start);
  const offline = { fetch: (async () => { throw new Error('ECONNREFUSED'); }) as typeof fetch, token: TOKEN, log: () => {} };
  expect(await pollOnce(start, offline)).toBe(start);
});
