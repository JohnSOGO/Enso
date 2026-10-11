// M4u acceptance (SPEC §9.5, MA1–MA6, MA8) — My alerts: each member's own pushes, newest first, hidden one by one or
// all at once; the rows are kept. MA7 (alertId in the payload) is in push.test.ts, ops.test.ts and
// phone-login-api.test.ts; MA-M in migration-0041.test.ts. Nobody here has a phone, so no push leaves the isolate.
import { env } from 'cloudflare:test';
import { expect, it } from 'vitest';
import {
  ALERT_HISTORY_MAX, ALERTS_PATH, PUSH_TITLE, alertIdFrom, alertSource, pushTitle,
} from '../src/shared/alert-history';
import { ANNOUNCE_TITLE } from '../src/shared/announce';
import { member, owner, tickAt, type Client } from './helpers';

declare global {
  namespace Cloudflare {
    interface Env { SW_JS: string }
  }
}

const none = { hasFire: false, kind: null, isAlarm: false, notice: null, messId: null, title: null };

it('MA1: pushTitle, alertSource and alertIdFrom', () => {
  expect(pushTitle({ hasFire: true, title: 'x' })).toBe(PUSH_TITLE);
  expect(pushTitle({ hasFire: false, title: '🏛️ Ozymandias' })).toBe('🏛️ Ozymandias');
  expect(pushTitle({ hasFire: false, title: null })).toBe(ANNOUNCE_TITLE);
  expect(alertSource({ ...none, hasFire: true, kind: 'reminder', title: 'x' })).toBe('Reminder');
  expect(alertSource({ ...none, hasFire: true, kind: 'reminder', isAlarm: true })).toBe('Alarm');
  expect(alertSource({ ...none, hasFire: true, kind: 'timer' })).toBe('Rolling timer');
  expect(alertSource({ ...none, hasFire: true, kind: 'machine' })).toBe('Machine');
  expect(alertSource({ ...none, notice: 'login', messId: 'mess_1', title: 'Sign-in' })).toBe('Sign-in');
  expect(alertSource({ ...none, messId: 'mess_1', title: 'Whose mess?' })).toBe('Whose mess?');
  expect(alertSource({ ...none, title: '🏛️ Ozymandias' })).toBe('🏛️ Ozymandias');
  expect(alertSource(none)).toBe('Announcement');
  expect(alertIdFrom(ALERTS_PATH, '?alert=dlv_1')).toBe('dlv_1');
  expect(alertIdFrom('/', '?alert=dlv_1')).toBeNull();
  expect(alertIdFrom(ALERTS_PATH, '')).toBeNull();
});

const alertsOf = async (c: Client) => (await c.get('/me/alerts')).json.alerts as any[];
let at = Date.parse('2026-12-01T00:00:00Z');
/** A fire-less push row for `memberId` (an announcement, or a ping with `title`), each a second after the last. */
async function pushRow(memberId: string, message: string, title: string | null = null) {
  const id = `dlv_t${at}`;
  const t = new Date(at += 1000).toISOString();
  await env.DB.prepare(`INSERT INTO deliveries (id, fire_id, alert_number, channel, member_id, message, title, status, created_at, updated_at)
    VALUES (?, NULL, 1, 'push', ?, ?, ?, 'sent', ?, ?)`).bind(id, memberId, message, title, t, t).run();
  return id;
}

it('MA2: a ping shows in the founder\'s list, whole, and in nobody else\'s', async () => {
  const o = await owner();
  const a = await member(o);
  const text = 'Ozymandias: the nightly build finished and every check passed — '.padEnd(200, '.');
  const r = await o.post('/ops/notify', { text, title: '🏛️ Ozymandias' }, { authorization: 'Bearer test-ops-token' });
  expect(r.status).toBe(201);
  const id = r.json.deliveries[0].id;
  expect((await alertsOf(o)).find((x) => x.id === id)).toMatchObject({
    title: '🏛️ Ozymandias', message: text, source: '🏛️ Ozymandias', kind: null, alertNumber: null, status: 'failed', detail: 'no_subscription',
  });
  expect(await alertsOf(a.client)).toEqual([]);
});

it('MA3: a reminder\'s push says Ensō / Reminder / alert 1; newest first', async () => {
  const o = await owner();
  const a = await member(o);
  const ev = await o.post('/events', { title: 'Bins', startDate: '2026-11-20', startTime: '12:00', assignedTo: [a.id], reminder: { offsetMin: 0, channels: ['push'] } });
  expect(ev.status).toBe(201);
  await tickAt(o, '2026-11-20T00:00:00Z');
  const fire = await env.DB.prepare('SELECT due_at FROM fires WHERE event_id = ?').bind(ev.json.id).first<{ due_at: string }>();
  await tickAt(o, fire!.due_at);
  const later = await pushRow(a.id, 'Dinner');
  const list = await alertsOf(a.client);
  expect(list.map((x) => x.id)[0]).toBe(later);
  expect(list[0]).toMatchObject({ title: ANNOUNCE_TITLE, source: 'Announcement', kind: null, alertNumber: null });
  expect(list[1]).toMatchObject({ title: 'Ensō', message: 'Reminder: Bins', source: 'Reminder', kind: 'reminder', alertNumber: 1 });
});

it('MA4 + MA5: ❌ hides one (only mine), Clear all hides the rest; rows are kept', async () => {
  const o = await owner();
  const a = await member(o), b = await member(o);
  const [x, y, z] = [await pushRow(a.id, 'one'), await pushRow(a.id, 'two'), await pushRow(a.id, 'three')];
  const theirs = await pushRow(b.id, 'theirs');
  const house = `dlv_house${at}`;
  await env.DB.prepare(`INSERT INTO deliveries (id, fire_id, alert_number, channel, member_id, message, status, created_at, updated_at)
    VALUES (?, NULL, 1, 'house', NULL, 'spoken', 'sent', ?, ?)`).bind(house, '2026-12-02T00:00:00Z', '2026-12-02T00:00:00Z').run();

  expect((await a.client.del(`/me/alerts/${x}`)).status).toBe(204);
  expect((await a.client.del(`/me/alerts/${x}`)).status).toBe(404);
  expect((await a.client.del(`/me/alerts/${theirs}`)).status).toBe(404);
  expect((await a.client.del(`/me/alerts/${house}`)).status).toBe(404);
  expect((await alertsOf(a.client)).map((r) => r.id)).toEqual([z, y]);

  expect((await a.client.del('/me/alerts')).json).toEqual({ cleared: 2 });
  expect(await alertsOf(a.client)).toEqual([]);
  expect((await alertsOf(b.client)).map((r) => r.id)).toEqual([theirs]);
  const kept = await env.DB.prepare(`SELECT COUNT(*) AS n FROM deliveries WHERE id IN (?, ?, ?, ?)`).bind(x, y, z, theirs).first<{ n: number }>();
  expect(kept!.n).toBe(4);
  const status = (await o.get('/status')).json.recentDeliveries.map((d: any) => d.id);
  expect(status).toEqual(expect.arrayContaining([x, y, z, theirs]));
});

it('MA6: only the newest ALERT_HISTORY_MAX are listed', async () => {
  const o = await owner();
  const a = await member(o);
  const ids: string[] = [];
  for (let i = 0; i <= ALERT_HISTORY_MAX; i++) ids.push(await pushRow(a.id, `n${i}`));
  const list = await alertsOf(a.client);
  expect(list).toHaveLength(ALERT_HISTORY_MAX);
  expect(list[0].id).toBe(ids.at(-1));
  expect(list.map((r) => r.id)).not.toContain(ids[0]);
});

it('MA8: the service worker opens ALERTS_PATH?alert={alertId}', () => {
  expect(env.SW_JS).toContain(`'${ALERTS_PATH}'`);
  expect(env.SW_JS).toContain('${ALERTS_PATH}?alert=${encodeURIComponent(data.alertId)}');
});
