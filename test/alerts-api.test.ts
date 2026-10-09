// M3/M4 acceptance — calendar API and the engine replayed through the database via /dev/tick.
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { member, owner, tickAt } from './helpers';
import { HOUSE_NOT_CONFIGURED } from '../src/worker/house';
import { nextTimerDue, timerWindow } from '../src/shared/engine';
import { localToUtc } from '../src/shared/time';

const iso = (s: string) => new Date(s).toISOString();

describe('calendar', () => {
  it('a weekly event returns the right occurrences across the DST change, with holidays', async () => {
    const o = await owner();
    const ev = await o.post('/events', { title: 'Trash', startDate: '2026-10-06', startTime: '19:00', recurrence: { freq: 'WEEKLY' } });
    expect(ev.status).toBe(201);
    const cal = await o.get('/calendar?from=2026-10-25&to=2026-11-14');
    expect(cal.json.occurrences.filter((x: any) => x.eventId === ev.json.id).map((x: any) => x.date))
      .toEqual(['2026-10-27', '2026-11-03', '2026-11-10']);
    expect(cal.json.publicHolidays.map((h: any) => h.date)).toEqual([]); // Veterans Day is not a default day off
  });

  it('the owner chooses the household days off; the calendar follows', async () => {
    const o = await owner();
    const s = await o.patch('/settings', { daysOff: ['veterans_day', 'christmas_eve'] });
    expect(s.json.daysOff).toEqual(['veterans_day', 'christmas_eve']);
    const cal = await o.get('/calendar?from=2026-11-01&to=2026-12-31');
    expect(cal.json.publicHolidays.map((h: any) => h.date)).toEqual(['2026-11-11', '2026-12-24']);
    expect((await o.patch('/settings', { daysOff: ['not_a_holiday'] })).status).toBe(400);
    await o.patch('/settings', { daysOff: s.json.holidays.filter((h: any) => ['thanksgiving'].includes(h.key)).map((h: any) => h.key) });
  });

  it('rejects ranges over 120 days and bad input with a message', async () => {
    const o = await owner();
    expect((await o.get('/calendar?from=2026-01-01&to=2026-12-31')).status).toBe(400);
    const bad = await o.post('/events', { title: '', startDate: '2026-10-06' });
    expect(bad.status).toBe(400);
    expect(bad.json.message).toMatch(/Title/);
  });

  it('only the creator or owner can edit an event', async () => {
    const o = await owner();
    const a = await member(o), b = await member(o);
    const ev = await a.client.post('/events', { title: 'Mine', startDate: '2026-10-06' });
    expect((await b.client.patch(`/events/${ev.json.id}`, { title: 'Theirs' })).status).toBe(403);
    expect((await o.patch(`/events/${ev.json.id}`, { title: 'Owner edit' })).json.title).toBe('Owner edit');
  });
});

describe('timer replayed through the database (T1–T10)', () => {
  it('rings, re-alerts, goes silent at max, restarts on ack, stops', async () => {
    const o = await owner();
    const t = await o.post('/timers', { title: 'Check on the dog', intervalMin: 60, channels: ['push', 'house'], renotifyMin: 15, maxAlerts: 4 });
    expect(t.status).toBe(201);
    // Start "at 12:00" by starting now, then rewriting the fire's due time for a deterministic clock.
    await o.post(`/timers/${t.json.id}/commands`, { cmd: 'start' });
    await env.DB.prepare(`UPDATE fires SET due_at = ? WHERE timer_id = ?`).bind(iso('2026-10-06T13:00Z'), t.json.id).run();

    const ringing = async () => (await o.get('/fires?state=ringing')).json.filter((f: any) => f.timerId === t.json.id);

    expect((await tickAt(o, '2026-10-06T12:59Z')).json.alerts).toBe(0);
    expect((await tickAt(o, '2026-10-06T13:00Z')).json.alerts).toBe(1);
    expect((await ringing())[0].alertCount).toBe(1);
    expect((await tickAt(o, '2026-10-06T13:14Z')).json.alerts).toBe(0);
    for (const at of ['13:15', '13:30', '13:45']) expect((await tickAt(o, `2026-10-06T${at}Z`)).json.alerts).toBe(1);
    expect((await tickAt(o, '2026-10-06T14:00Z')).json.alerts).toBe(0);
    const [fire] = await ringing();
    expect(fire.alertCount).toBe(4);

    // Deliveries: one push per member (visibly failed — no subscription in this test) + one house per alert
    // (visibly failed too — vitest.config.ts pins the House secrets empty, so House is not configured, §9.2).
    const d = await env.DB.prepare(`SELECT channel, status, detail FROM deliveries WHERE fire_id = ?`).bind(fire.id).all<any>();
    expect(d.results.filter((x) => x.channel === 'house')).toHaveLength(4);
    expect(d.results.filter((x) => x.channel === 'house').every((x) => x.status === 'failed' && x.detail === HOUSE_NOT_CONFIGURED)).toBe(true);
    expect(d.results.filter((x) => x.channel === 'push').every((x) => x.status === 'failed' && x.detail === 'no_subscription')).toBe(true);

    const ack = await o.post(`/fires/${fire.id}/actions`, { action: 'ack' });
    expect(ack.json.fire.close_reason).toBe('acked');
    const dueGap = Date.parse(ack.json.next.due_at) - Date.now();
    expect(Math.abs(dueGap - 60 * 60_000)).toBeLessThan(5_000); // next = ack time + 60 min
    expect(await ringing()).toHaveLength(0);

    const snooze = await o.post(`/fires/${fire.id}/actions`, { action: 'snooze' });
    expect(snooze.status).toBe(409);

    const stop = await o.post(`/timers/${t.json.id}/commands`, { cmd: 'stop' });
    expect(stop.json.running).toBe(false);
    expect(stop.json.openFire).toBeNull();
  });
});

describe('reminder replayed through the database', () => {
  it('materializes, rings, supersedes, and done closes it', async () => {
    const o = await owner();
    const ev = await o.post('/events', {
      title: 'Meds', startDate: '2026-10-06', startTime: '08:00', recurrence: { freq: 'DAILY' },
      reminder: { offsetMin: 0, channels: ['push'], renotifyMin: null },
    });
    // 08:00 PDT = 15:00Z
    expect((await tickAt(o, '2026-10-06T14:00Z')).json.materialized).toBeGreaterThanOrEqual(2);
    await tickAt(o, '2026-10-06T15:00Z');
    const first = await env.DB.prepare(`SELECT state, alert_count FROM fires WHERE event_id = ? AND occurrence_date = '2026-10-06'`).bind(ev.json.id).first<any>();
    expect(first).toMatchObject({ state: 'ringing', alert_count: 1 });
    // Next day rings while the first still rings → the first is superseded.
    await tickAt(o, '2026-10-07T15:00Z');
    const fires = await env.DB.prepare(`SELECT occurrence_date, state, close_reason FROM fires WHERE event_id = ? ORDER BY occurrence_date`).bind(ev.json.id).all<any>();
    expect(fires.results[0]).toMatchObject({ occurrence_date: '2026-10-06', state: 'closed', close_reason: 'superseded' });
    expect(fires.results[1]).toMatchObject({ occurrence_date: '2026-10-07', state: 'ringing' });

    const ringing = (await o.get('/fires?state=ringing')).json.find((f: any) => f.eventId === ev.json.id);
    const done = await o.post(`/fires/${ringing.id}/actions`, { action: 'done' });
    expect(done.json.fire.close_reason).toBe('done');
  });

  it('an edited event re-materializes its future fires (closed fires do not block)', async () => {
    const o = await owner();
    const ev = await o.post('/events', {
      title: 'Walk', startDate: '2030-10-08', startTime: '18:00', reminder: { offsetMin: 0, channels: ['push'] },
    });
    await tickAt(o, '2030-10-08T12:00Z');
    await o.patch(`/events/${ev.json.id}`, { startTime: '19:00' });
    // The PATCH closed the old 18:00 fire as 'removed'; that closed row must not block the new 19:00 one.
    await tickAt(o, '2030-10-08T12:01Z');
    const open = await env.DB.prepare(`SELECT due_at FROM fires WHERE event_id = ? AND state = 'scheduled'`).bind(ev.json.id).all<any>();
    expect(open.results.map((r) => r.due_at)).toEqual(['2030-10-09T02:00:00.000Z']);
  });

  it('a reminder overdue by more than an hour is missed, not rung', async () => {
    const o = await owner();
    const ev = await o.post('/events', { title: 'Old', startDate: '2026-10-10', startTime: '10:00', reminder: { offsetMin: 0, channels: ['push'] } });
    await tickAt(o, '2026-10-10T12:00Z'); // materialize (due 17:00Z)
    const r = await tickAt(o, '2026-10-10T18:30Z');
    expect(r.json.alerts).toBe(0);
    const f = await env.DB.prepare(`SELECT close_reason FROM fires WHERE event_id = ?`).bind(ev.json.id).first<any>();
    expect(f.close_reason).toBe('missed');
  });
});

describe('timer active time range (§4.2n, TW)', () => {
  const base = { title: 'Water the plants', intervalMin: 60, channels: ['push'] };
  const TZ = 'America/Los_Angeles';
  const L = (time: string, date = '2026-10-06') => localToUtc(date, time, TZ);

  it('create, patch and clear the window; a PATCH merges and keeps it', async () => {
    const o = await owner();
    const plain = await o.post('/timers', base);
    expect(plain.status).toBe(201);
    expect(plain.json).toMatchObject({ activeFrom: null, activeTo: null });

    const t = await o.post('/timers', { ...base, activeFrom: '08:00', activeTo: '21:00' });
    expect(t.status).toBe(201);
    expect(t.json).toMatchObject({ activeFrom: '08:00', activeTo: '21:00' });
    expect((await o.get('/timers')).json.find((x: any) => x.id === t.json.id)).toMatchObject({ activeFrom: '08:00', activeTo: '21:00' });

    const renamed = await o.patch(`/timers/${t.json.id}`, { title: 'Water' });
    expect(renamed.json).toMatchObject({ title: 'Water', activeFrom: '08:00', activeTo: '21:00' });
    const night = await o.patch(`/timers/${t.json.id}`, { activeFrom: '22:00', activeTo: '06:00' });
    expect(night.json).toMatchObject({ activeFrom: '22:00', activeTo: '06:00' });
    const cleared = await o.patch(`/timers/${t.json.id}`, { activeFrom: null, activeTo: null });
    expect(cleared.status).toBe(200);
    expect(cleared.json).toMatchObject({ activeFrom: null, activeTo: null });
    const row = await env.DB.prepare('SELECT active_from, active_to FROM timers WHERE id = ?').bind(t.json.id).first<any>();
    expect(row).toEqual({ active_from: null, active_to: null });
  });

  it('refuses half a window, a bad time, from = to, and an interval not shorter than the window', async () => {
    const o = await owner();
    const cases: [Record<string, unknown>, RegExp][] = [
      [{ activeFrom: '08:00' }, /both/],
      [{ activeFrom: '08:00', activeTo: null }, /both/],
      [{ activeFrom: '8am', activeTo: '21:00' }, /HH:MM/],
      [{ activeFrom: '08:00', activeTo: '08:00' }, /different/],
      [{ activeFrom: '08:00', activeTo: '09:00' }, /shorter/],
    ];
    for (const [w, msg] of cases) {
      const r = await o.post('/timers', { ...base, ...w });
      expect(r.status).toBe(400);
      expect(r.json.error).toBe('invalid_input');
      expect(r.json.message).toMatch(msg);
    }
    // A PATCH that lengthens the interval past the stored window is refused too.
    const t = await o.post('/timers', { ...base, activeFrom: '08:00', activeTo: '10:00' });
    const r = await o.patch(`/timers/${t.json.id}`, { intervalMin: 120 });
    expect(r.status).toBe(400);
    expect(r.json.message).toMatch(/shorter/);
  });

  it('start plans the first fire with the window (nextTimerDue)', async () => {
    const o = await owner();
    const t = await o.post('/timers', { ...base, activeFrom: '08:00', activeTo: '21:00' });
    const win = timerWindow('08:00', '21:00', TZ);
    const before = new Date().toISOString();
    const s = await o.post(`/timers/${t.json.id}/commands`, { cmd: 'start' });
    const after = new Date().toISOString();
    expect(s.json.running).toBe(true);
    // Inside the window: now + 60, between the two bounds; outside: the next opening + 60 (both bounds equal).
    const due = Date.parse(s.json.openFire.due_at);
    const lo = Date.parse(nextTimerDue(before, 60, win)), hi = Date.parse(nextTimerDue(after, 60, win));
    expect(due === lo || due === hi || (due > lo && due < hi)).toBe(true);
    await o.post(`/timers/${t.json.id}/commands`, { cmd: 'stop' });
  });

  it('a tick across the window close goes quiet; the same fire rings again after the window opens', async () => {
    const o = await owner();
    const t = await o.post('/timers', { ...base, title: 'Night quiet', activeFrom: '08:00', activeTo: '21:00', renotifyMin: 15 });
    await o.post(`/timers/${t.json.id}/commands`, { cmd: 'start' });
    await env.DB.prepare('UPDATE fires SET due_at = ? WHERE timer_id = ?').bind(L('20:50'), t.json.id).run();
    const ringing = async () => (await o.get('/fires?state=ringing')).json.filter((f: any) => f.timerId === t.json.id);
    const view = async () => (await o.get('/timers')).json.find((x: any) => x.id === t.json.id);

    // Other tests' fires may ring at these instants too, so this checks the timer's own fire and deliveries.
    const fire = async () => (await env.DB.prepare('SELECT * FROM fires WHERE timer_id = ?').bind(t.json.id).all<any>()).results;
    const alerts = async () => (await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM deliveries d JOIN fires f ON f.id = d.fire_id WHERE f.timer_id = ?').bind(t.json.id).first<any>()).n;

    await tickAt(o, L('20:50'));
    expect(await ringing()).toHaveLength(1);
    const once = await alerts(); // one push row per active member
    expect(once).toBeGreaterThan(0);
    // The 15-min renotify would be 21:05 — past the close: no alert, the fire goes back to scheduled.
    await tickAt(o, L('21:05'));
    expect(await ringing()).toHaveLength(0);
    expect(await alerts()).toBe(once);
    const v = await view();
    expect(v.running).toBe(true);
    expect(v.openFire).toMatchObject({ state: 'scheduled', due_at: L('09:00', '2026-10-07'), alert_count: 0 });
    // Overnight and right up to 09:00: nothing. The window opened at 08:00 and the countdown restarted.
    for (const at of [L('03:00', '2026-10-07'), L('08:00', '2026-10-07'), L('08:59', '2026-10-07')]) {
      await tickAt(o, at);
      expect(await alerts()).toBe(once);
    }
    await tickAt(o, L('09:00', '2026-10-07'));
    expect(await ringing()).toHaveLength(1);
    expect(await alerts()).toBe(2 * once);
    const fires = await fire();
    expect(fires).toHaveLength(1); // the same fire, never closed — the snooze shape
    expect(fires[0]).toMatchObject({ state: 'ringing', alert_count: 1, close_reason: null });
    await o.post(`/timers/${t.json.id}/commands`, { cmd: 'stop' });
  });
});
