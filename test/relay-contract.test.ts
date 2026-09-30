// M6 contract test (SPEC §9.2): every status the relay can emit — enumerated by CALLING
// classifyResult — is accepted by the server's validator; queued/claimed are rejected.
import { env } from 'cloudflare:test';
import { expect, it } from 'vitest';
import { classifyResult } from '../relay/classify';
import { relayReportError } from '../src/worker/routes/relay';
import { owner, tickAt, BASE } from './helpers';
import { SELF } from 'cloudflare:test';

it('the server accepts every status the relay can produce', () => {
  const emitted = new Set([true, false].flatMap((a) => [true, false].map((b) => classifyResult(a, b))));
  expect([...emitted].sort()).toEqual(['failed', 'partial', 'sent']);
  for (const status of emitted) expect(relayReportError({ id: 'dlv_x', status })).toBeNull();
  for (const status of ['queued', 'claimed', 'delivered']) expect(relayReportError({ id: 'dlv_x', status })).not.toBeNull();
});

const relayPost = (path: string, body: unknown = {}, token = env.RELAY_TOKEN) =>
  SELF.fetch(`${BASE}${path}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });

it('claim → report round trip, heartbeat, and auth', async () => {
  expect((await relayPost('/relay/claim', {}, 'wrong')).status).toBe(401);
  const o = await owner();
  const t = await o.post('/timers', { title: 'Relay test', intervalMin: 1, channels: ['house'], renotifyMin: null });
  await o.post(`/timers/${t.json.id}/commands`, { cmd: 'start' });
  await tickAt(o, new Date(Date.now() + 2 * 60_000).toISOString());

  const claimed: any[] = await (await relayPost('/relay/claim')).json();
  const mine = claimed.find((d) => d.message === 'Timer: Relay test');
  expect(mine).toBeDefined();
  expect((await o.get('/status')).json.relayOnline).toBe(true);

  const again: any[] = await (await relayPost('/relay/claim')).json();
  expect(again.find((d) => d.id === mine.id)).toBeUndefined(); // claimed rows are not handed out twice

  const rep = await relayPost('/relay/report', { id: mine.id, status: classifyResult(true, false), detail: { echo: 'ok', voice_pe: 'error: timeout' } });
  expect(rep.status).toBe(200);
  const row = await env.DB.prepare('SELECT status, detail FROM deliveries WHERE id = ?').bind(mine.id).first<any>();
  expect(row.status).toBe('partial');
  expect(JSON.parse(row.detail).voice_pe).toBe('error: timeout');
});
