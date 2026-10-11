// SPEC §7.7 G3–G7 — the goat alert through the API and /dev/tick. The event is inserted by SQL,
// exactly as the coordinator does in production (§14): no route can create a sun event.
import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { Client, member, owner, tickAt } from './helpers';
import { sunsetUtc } from '../src/shared/sun';
import { addMinutes, utcToLocal } from '../src/shared/time';

const OCEANSIDE = { lat: 33.2, lon: -117.29 };
const GOAT = 'evt_goat0000000000000';
let A: Client, aId: string, B: Client, bId: string;

beforeAll(async () => {
  A = await owner();
  aId = (await A.get('/me')).json.id;
  const m = await member(A);
  B = m.client; bId = m.id;
  const now = '2026-10-03T12:00:00.000Z';
  await env.DB.prepare(
    `INSERT INTO events (id, title, notes, start_date, start_time, end_date, end_time, recurrence, assigned_to,
       remind_offset_min, remind_channels, renotify_min, max_alerts, created_by, created_at, updated_at,
       is_alarm, optional, emoji, start_sun)
     VALUES (?, 'Put the goats away', NULL, '2026-10-03', NULL, '2026-10-03', NULL, '{"freq":"DAILY"}', '[]',
       30, '["push","house"]', 15, 3, (SELECT id FROM members WHERE role = 'owner' ORDER BY created_at LIMIT 1),
       ?, ?, 0, 1, '🐐', 'sunset')`).bind(GOAT, now, now).run();
});

const dueOn = (date: string) => addMinutes(sunsetUtc(date, OCEANSIDE)!, -30);
const fireOn = (date: string) =>
  env.DB.prepare('SELECT * FROM fires WHERE event_id = ? AND occurrence_date = ?').bind(GOAT, date).first<any>();
const deliveriesOf = async (fireId: string) =>
  (await env.DB.prepare('SELECT channel, member_id, message FROM deliveries WHERE fire_id = ? ORDER BY channel').bind(fireId).all<any>()).results;
const h12 = (hhmm: string) => `${Number(hhmm.slice(0, 2)) % 12 || 12}:${hhmm.slice(3)}`;

describe('M4n the goat alert (G3–G7)', () => {
  it('the migration set the household place', async () => {
    expect(await env.DB.prepare('SELECT latitude, longitude FROM settings WHERE id = 1').first()).toEqual({ latitude: 33.2, longitude: -117.29 });
  });

  it('G4 /optional-events lists it, off for whoever has not turned it on', async () => {
    const row = (await A.get('/optional-events')).json.find((e: any) => e.id === GOAT);
    expect(row).toEqual({ id: GOAT, title: 'Put the goats away', recurrence: { freq: 'DAILY' }, startDate: '2026-10-03', emoji: '🐐', on: false });
  });

  it('G6 nobody opted in → the fire steps at sunset − 30, nothing is delivered', async () => {
    await tickAt(A, dueOn('2026-10-04'));
    const f = await fireOn('2026-10-04');
    expect(f).toMatchObject({ state: 'ringing', due_at: dueOn('2026-10-04'), alert_count: 1 });
    expect(await deliveriesOf(f.id)).toEqual([]);
  });

  it('G5 one member opted in → pushes to them, and one house row from the second alert (§9.2d): "Put the goats away — sunset at h:mm"', async () => {
    expect((await B.put(`/events/${GOAT}/optin`, {})).status).toBe(204);
    await tickAt(A, dueOn('2026-10-05'));
    const f = await fireOn('2026-10-05');
    expect(f).toMatchObject({ state: 'ringing', due_at: dueOn('2026-10-05') });
    const text = `Put the goats away — sunset at ${h12(utcToLocal(sunsetUtc('2026-10-05', OCEANSIDE)!, 'America/Los_Angeles').time)}`;
    expect(text).toMatch(/^Put the goats away — sunset at 6:\d\d$/);
    // §9.2d: it repeats, so its first alert is phone only; the house joins at the second, 15 min later.
    expect(await deliveriesOf(f.id)).toEqual([{ channel: 'push', member_id: bId, message: text }]);
    await tickAt(A, addMinutes(dueOn('2026-10-05'), 15));
    const after = await deliveriesOf(f.id);
    expect(after.map((d: any) => [d.channel, d.member_id])).toEqual([['house', null], ['push', bId], ['push', bId]]);
    expect(after[0].message).toMatch(/^Put the goats away — sunset at 6:\d\d/);
    expect(aId).not.toBe(bId);
  });

  it('G3 never on the calendar, even for a member who has it on', async () => {
    const occ = (await B.get('/calendar?from=2026-10-01&to=2026-10-31')).json.occurrences;
    expect(occ.filter((o: any) => o.eventId === GOAT)).toEqual([]);
  });

  it('G7 /fires carries startSun; the event routes give 404', async () => {
    const fires = (await B.get('/fires?state=ringing')).json;
    const f = fires.find((x: any) => x.eventId === GOAT);
    expect(f).toMatchObject({ kind: 'reminder', startSun: 'sunset', title: 'Put the goats away', startTime: null });
    expect((await A.get('/fires?state=ringing')).json.find((x: any) => x.eventId === GOAT)).toBeUndefined(); // A has it off
    expect((await B.get(`/events/${GOAT}`)).status).toBe(404);
    expect((await A.patch(`/events/${GOAT}`, { title: 'x' })).status).toBe(404);
    expect((await A.post(`/events/${GOAT}/exdates`, { date: '2026-10-06' })).status).toBe(404);
    expect((await A.del(`/events/${GOAT}`)).status).toBe(404);
  });
});
