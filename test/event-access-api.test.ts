// SPEC §6.3 "Who opens an event" (EO4–EO6) and "Private events" (PV2–PV6) — through the real Worker.
import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { Client, member, owner } from './helpers';
import { cannotOpenText, privateNeedsGoingText } from '../src/shared/event-access';

let o: Client, a: Client, k: Client, A: string, K: string;
beforeAll(async () => {
  o = await owner();
  ({ client: a, id: A } = await member(o));
  ({ client: k, id: K } = await member(o));
});

const ev = (c: Client, assignedTo: string[]) => c.post('/events', { title: 'Dinner out', notes: 'Table for 3', startDate: '2030-03-07', startTime: '19:00', assignedTo });

describe('§6.3 who opens an event', () => {
  it('EO4 someone not going gets 403 on the details but still sees the summary', async () => {
    const e = (await ev(o, [A])).json;
    const r = await k.get(`/events/${e.id}`);
    expect(r.status).toBe(403);
    expect(r.json).toEqual({ error: 'forbidden', message: cannotOpenText });
    const occ = (await k.get('/calendar?from=2030-03-07&to=2030-03-07')).json.occurrences.find((x: any) => x.eventId === e.id);
    expect(occ).toMatchObject({ title: 'Dinner out', startTime: '19:00', assignedTo: [A] });
    expect(occ.notes).toBeUndefined();
  });

  it('EO5 the people going, the creator and an admin open it', async () => {
    const byOwner = (await ev(o, [A])).json;
    expect((await a.get(`/events/${byOwner.id}`)).json.notes).toBe('Table for 3');
    expect((await o.get(`/events/${byOwner.id}`)).status).toBe(200);
    const byA = (await ev(a, [K])).json; // A made it for K only: A still opens it, and so does the admin
    expect((await a.get(`/events/${byA.id}`)).status).toBe(200);
    expect((await o.get(`/events/${byA.id}`)).status).toBe(200);
  });

  it('EO6 an event with nobody assigned is everyone\'s', async () => {
    const e = (await ev(o, [])).json;
    expect((await k.get(`/events/${e.id}`)).status).toBe(200);
  });

  it('NS1 (§8.4a) hasNotes only for an event with notes the member may open', async () => {
    const mine = (await ev(o, [K])).json, locked = (await ev(o, [A])).json;
    const bare = (await o.post('/events', { title: 'No notes', startDate: '2030-03-07', startTime: '08:00', assignedTo: [K] })).json;
    const occ = (await k.get('/calendar?from=2030-03-07&to=2030-03-07')).json.occurrences;
    const has = (id: string) => occ.find((x: any) => x.eventId === id).hasNotes;
    expect([has(mine.id), has(bare.id), has(locked.id)]).toEqual([true, false, false]);
  });
});

describe('§6.3 private events', () => {
  const night = (c: Client, assignedTo: string[], extra: object = {}) => c.post('/events', { title: 'Date night', emoji: '🍷', notes: 'Shh', startDate: '2030-03-08',
    startTime: '19:00', endTime: '22:00', assignedTo, private: true, reminder: { offsetMin: 30, channels: ['push'] }, ...extra });
  const occOf = async (c: Client, id: string) => (await c.get('/calendar?from=2030-03-08&to=2030-03-08')).json.occurrences.find((x: any) => x.eventId === id);

  it('PV2 someone not going sees only the time, titled Private', async () => {
    const e = (await night(o, [A])).json;
    expect(e.private).toBe(true);
    expect(await occOf(k, e.id)).toMatchObject({ date: '2030-03-08', startTime: '19:00', endTime: '22:00', title: 'Private', emoji: null, assignedTo: [],
      createdBy: null, creatorName: '', hasReminder: false, recurring: false, hasNotes: false, masked: true });
  });

  it('PV3 the people going and an admin see it whole', async () => {
    const e = (await night(a, [A])).json;
    for (const c of [a, o]) expect(await occOf(c, e.id)).toMatchObject({ title: 'Date night', emoji: '🍷', assignedTo: [A], private: true, masked: false });
  });

  it('PV4 private with nobody going is refused', async () => {
    const r = await night(o, []);
    expect(r.status).toBe(400);
    expect(r.json.message).toBe(privateNeedsGoingText);
    const e = (await night(o, [A])).json;
    expect((await o.patch(`/events/${e.id}`, { assignedTo: [] })).status).toBe(400);
    expect((await o.patch(`/events/${e.id}`, { assignedTo: [], private: false })).status).toBe(200);
  });

  it('PV5 a private optional event is titled Private in /optional-events for someone not going', async () => {
    const e = (await night(o, [A], { optional: true })).json;
    const row = async (c: Client) => (await c.get('/optional-events')).json.find((x: any) => x.id === e.id);
    expect(await row(k)).toMatchObject({ title: 'Private', emoji: null });
    expect(await row(a)).toMatchObject({ title: 'Date night', emoji: '🍷' });
  });

  it('PV6 a private event\'s reminder push shows in Status only to its member', async () => {
    const e = (await night(o, [A])).json, now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO fires (id, kind, event_id, occurrence_date, due_at, state, alert_count) VALUES ('fire_pv6', 'reminder', ?, '2030-03-08', ?, 'ringing', 1)`)
      .bind(e.id, now).run();
    await env.DB.prepare(`INSERT INTO deliveries (id, fire_id, alert_number, channel, member_id, message, status, created_at, updated_at)
      VALUES ('dlv_pv6', 'fire_pv6', 1, 'push', ?, 'Date night at 7:00 PM', 'sent', ?, ?)`).bind(A, now, now).run();
    const has = async (c: Client) => (await c.get('/status')).json.recentDeliveries.some((d: any) => d.id === 'dlv_pv6');
    expect(await has(a)).toBe(true);
    expect(await has(k)).toBe(false);
  });
});
