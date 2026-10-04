// M4h acceptance — optional events (SPEC §7.5 O1–O9) through the API and /dev/tick, plus the rule's unit rows.
import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { Client, member, owner, tickAt } from './helpers';
import { audience, isOnFor } from '../src/shared/optins';

let A: Client, aId: string, B: Client, bId: string;

beforeAll(async () => {
  A = await owner();
  aId = (await A.get('/me')).json.id;
  const m = await member(A);
  B = m.client; bId = m.id;
});

const sweeping = {
  title: 'Street sweeping', startDate: '2026-10-01', endDate: '2026-10-01', startTime: null, optional: true,
  recurrence: { freq: 'MONTHLY', byDay: ['TH'], setPos: [1, 3] },
  reminder: { offsetMin: 780, channels: ['push', 'house'] }, // the evening before, 8 pm
};
const datesOf = async (c: Client, eventId: string, from = '2026-10-01', to = '2026-10-31') =>
  (await c.get(`/calendar?from=${from}&to=${to}`)).json.occurrences.filter((o: any) => o.eventId === eventId).map((o: any) => o.date);
const fireOn = (eventId: string, date: string) =>
  env.DB.prepare('SELECT * FROM fires WHERE event_id = ? AND occurrence_date = ?').bind(eventId, date).first<any>();
const deliveriesOf = async (fireId: string) =>
  (await env.DB.prepare('SELECT channel, member_id FROM deliveries WHERE fire_id = ?').bind(fireId).all<any>()).results;
const pushTo = (d: { channel: string; member_id: string }[]) => d.filter((x) => x.channel === 'push').map((x) => x.member_id).sort();
const houseCount = (d: { channel: string }[]) => d.filter((x) => x.channel === 'house').length;
const ringingIds = async (c: Client) => (await c.get('/fires?state=ringing')).json.map((f: any) => f.id);

describe('M4h optional events (O1–O9)', () => {
  it('O1–O8: on for its creator, each member turns it on/off for themselves, reminders follow who has it on', async () => {
    // O1
    const ev = await A.post('/events', sweeping);
    expect(ev.status, JSON.stringify(ev.json)).toBe(201);
    expect(ev.json.optional).toBe(true);
    const id = ev.json.id;
    expect((await A.get(`/events/${id}`)).json).toMatchObject({ optional: true, on: true });
    expect(await datesOf(A, id)).toEqual(['2026-10-01', '2026-10-15']);
    // O2
    expect(await datesOf(B, id)).toEqual([]);
    expect((await B.get(`/events/${id}`)).json.on).toBe(false);
    // O3
    expect((await B.put(`/events/${id}/optin`, {})).status).toBe(204);
    expect((await B.put(`/events/${id}/optin`, {})).status).toBe(204); // twice is the same as once
    expect(await datesOf(B, id)).toEqual(['2026-10-01', '2026-10-15']);

    // O4 — 2026-10-14 20:00 PDT, the evening before the 3rd Thursday.
    await tickAt(A, '2026-10-15T03:00:00.000Z');
    const f1 = await fireOn(id, '2026-10-15');
    expect(f1).toMatchObject({ state: 'ringing', due_at: '2026-10-15T03:00:00.000Z' });
    const d1 = await deliveriesOf(f1.id);
    expect(pushTo(d1)).toEqual([aId, bId].sort());
    expect(houseCount(d1)).toBe(1);
    expect(await ringingIds(B)).toContain(f1.id);

    // O5 — B turns it off; the next occurrence (1st Thursday of November) reminds A only.
    expect((await B.del(`/events/${id}/optin`)).status).toBe(204);
    expect(await datesOf(B, id)).toEqual([]);
    await tickAt(A, '2026-11-05T04:00:00.000Z'); // 2026-11-04 20:00 PST
    const f2 = await fireOn(id, '2026-11-05');
    const d2 = await deliveriesOf(f2.id);
    expect(pushTo(d2)).toEqual([aId]);
    expect(houseCount(d2)).toBe(1);
    expect(await ringingIds(A)).toContain(f2.id);
    expect(await ringingIds(B)).not.toContain(f2.id);

    // O6 — nobody has it on: the fire steps, nothing is delivered (not even the House), nobody sees it ring.
    expect((await A.del(`/events/${id}/optin`)).status).toBe(204);
    await tickAt(A, '2026-11-19T04:00:00.000Z');
    const f3 = await fireOn(id, '2026-11-19');
    expect(f3.state).toBe('ringing');
    expect(await deliveriesOf(f3.id)).toEqual([]);
    expect(await ringingIds(A)).not.toContain(f3.id);
    expect(await ringingIds(B)).not.toContain(f3.id);

    // O7
    const list = (await B.get('/optional-events')).json;
    expect(list).toEqual([{ id, title: 'Street sweeping', recurrence: sweeping.recurrence, startDate: '2026-10-01', emoji: null, on: false }]);

    // O8 — only the creator or an admin changes whether it is optional.
    expect((await B.patch(`/events/${id}`, { optional: false })).status).toBe(403);
  });

  it('O9: a non-optional event is unchanged for everyone', async () => {
    const ev = await A.post('/events', { ...sweeping, title: 'Bins', optional: undefined, recurrence: null, startDate: '2026-12-10', endDate: '2026-12-10' });
    expect(ev.json.optional).toBe(false);
    expect(await datesOf(B, ev.json.id, '2026-12-01', '2026-12-31')).toEqual(['2026-12-10']);
    expect(await datesOf(A, ev.json.id, '2026-12-01', '2026-12-31')).toEqual(['2026-12-10']);
    await tickAt(A, '2026-12-10T04:00:00.000Z'); // 2026-12-09 20:00 PST
    const f = await fireOn(ev.json.id, '2026-12-10');
    const d = await deliveriesOf(f.id);
    expect(pushTo(d)).toEqual([aId, bId].sort());
    expect(houseCount(d)).toBe(1);
    expect(await ringingIds(B)).toContain(f.id);
    expect((await B.put(`/events/${ev.json.id}/optin`, {})).status).toBe(400); // not optional: on for everyone
    expect((await B.get('/optional-events')).json.map((e: any) => e.id)).not.toContain(ev.json.id);
  });

  it('editing an event into optional turns the editor on (⚑), not the creator; back to not optional shows it to all', async () => {
    const ev = await B.post('/events', { title: 'Club', startDate: '2026-10-20' });
    const p = await A.patch(`/events/${ev.json.id}`, { optional: true }); // A is an admin
    expect(p.status).toBe(200);
    expect(p.json.optional).toBe(true);
    expect(await datesOf(A, ev.json.id)).toEqual(['2026-10-20']);
    expect(await datesOf(B, ev.json.id)).toEqual([]);
    expect((await A.patch(`/events/${ev.json.id}`, { optional: false })).status).toBe(200);
    expect(await datesOf(B, ev.json.id)).toEqual(['2026-10-20']);
    expect((await A.patch(`/events/${ev.json.id}`, { optional: 'yes' })).status).toBe(400);
  });

  it('the switch: 404 for a missing event, 400 for an alarm', async () => {
    expect((await B.put('/events/evt_nope/optin', {})).status).toBe(404);
    expect((await B.del('/events/evt_nope/optin')).status).toBe(404);
    const alarm = await A.post('/alarms', { title: 'Meds', time: '08:00', days: ['MO'], channels: ['push'] });
    expect((await B.put(`/events/${alarm.json.id}/optin`, {})).status).toBe(400);
  });
});

describe('the optional-event rule (§7.5) — isOnFor and audience', () => {
  const base = { assignedTo: [] as string[], activeIds: ['a', 'b', 'c'], onIds: [] as string[], channels: ['push', 'house'] as ('push' | 'house')[] };

  it('isOnFor: a non-optional event exists for everyone; an optional one only for who has it on', () => {
    expect(isOnFor({ optional: false }, 'a', [])).toBe(true);
    expect(isOnFor({ optional: 0 }, 'a', [])).toBe(true);
    expect(isOnFor({ optional: true }, 'a', [])).toBe(false);
    expect(isOnFor({ optional: 1 }, 'a', ['a'])).toBe(true);
    expect(isOnFor({ optional: 1 }, 'b', ['a'])).toBe(false);
  });

  it('not optional: exactly the old recipients (active, or the active assigned ones, in assigned order)', () => {
    expect(audience({ ...base, optional: false })).toEqual({ push: ['a', 'b', 'c'], house: true });
    expect(audience({ ...base, optional: false, assignedTo: ['c', 'x', 'a'] })).toEqual({ push: ['c', 'a'], house: true });
    expect(audience({ ...base, optional: false, assignedTo: ['x'] })).toEqual({ push: [], house: true }); // House still speaks, as before
    expect(audience({ ...base, optional: false, channels: ['push'] })).toEqual({ push: ['a', 'b', 'c'], house: false });
  });

  it('optional: active ∩ assigned-or-everyone ∩ on; House only when that audience is not empty', () => {
    expect(audience({ ...base, optional: true, onIds: ['b', 'c'] })).toEqual({ push: ['b', 'c'], house: true });
    expect(audience({ ...base, optional: true, onIds: ['b', 'c'], assignedTo: ['c'] })).toEqual({ push: ['c'], house: true });
    expect(audience({ ...base, optional: true, onIds: ['b'], assignedTo: ['c'] })).toEqual({ push: [], house: false });
    expect(audience({ ...base, optional: true, onIds: ['x'] })).toEqual({ push: [], house: false }); // on, but disabled
    expect(audience({ ...base, optional: true })).toEqual({ push: [], house: false });
  });
});
