// SPEC §8.4 RT1–RT5 — an event reminder's Random time: the pick, the planner, the API and the form.
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { owner, tickAt } from './helpers';
import { planReminderFires, type ReminderEvent } from '../src/shared/engine';
import { randomTimeIn, randomWindowError } from '../src/shared/random-time';
import { localToUtc, utcToLocal } from '../src/shared/time';

const TZ = 'America/Los_Angeles';
const daily: ReminderEvent = {
  id: 'evt_car', start_date: '2026-10-16', start_time: '08:00', recurrence: { freq: 'DAILY' }, exdates: [],
  remind_offset_min: 0, remind_random_from: '09:00', remind_random_to: '17:00',
};
const window = ['2026-10-16T07:00:00.000Z', '2026-10-23T07:00:00.000Z'] as const; // a week of local days

describe('§8.4 Random time', () => {
  it('RT1 the pick stays in [from, to) and is the same every time; the window check', () => {
    for (let i = 0; i < 200; i++) {
      const t = randomTimeIn(`evt_${i}|2026-10-16`, '09:00', '17:00');
      expect(t >= '09:00' && t < '17:00').toBe(true);
    }
    expect(randomTimeIn('evt_car|2026-10-16', '09:00', '09:01')).toBe('09:00');
    expect(randomTimeIn('evt_car|2026-10-16', '09:00', '17:00')).toBe(randomTimeIn('evt_car|2026-10-16', '09:00', '17:00'));
    expect(randomWindowError(null, undefined)).toBeNull();
    expect(randomWindowError('09:00', '17:00')).toBeNull();
    expect(randomWindowError('09:00', null)).toBe('Random time needs a From and a To time (HH:MM).');
    expect(randomWindowError('9am', '17:00')).toBe('Random time needs a From and a To time (HH:MM).');
    expect(randomWindowError('17:00', '09:00')).toBe('Random time: From must be before To.');
    expect(randomWindowError('09:00', '09:00')).toBe('Random time: From must be before To.');
  });

  it('RT2 the planner: one fire a day inside the window, on the day of start − offset, idempotent', () => {
    const fires = planReminderFires(daily, TZ, ...window);
    expect(fires.map((f) => f.occurrence_date)).toEqual(['2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22']);
    for (const f of fires) {
      const local = utcToLocal(f.due_at, TZ);
      expect(local.date).toBe(f.occurrence_date);
      expect(local.time >= '09:00' && local.time < '17:00').toBe(true);
    }
    expect(new Set(fires.map((f) => utcToLocal(f.due_at, TZ).time)).size).toBeGreaterThan(1); // not one fixed time
    expect(planReminderFires(daily, TZ, ...window)).toEqual(fires);
    // 1 day before → the day before; the evening before an all-day event (780) → the day before too.
    const dayBefore = planReminderFires({ ...daily, recurrence: null, start_date: '2026-10-20', remind_offset_min: 1440 }, TZ, ...window);
    expect(utcToLocal(dayBefore[0].due_at, TZ).date).toBe('2026-10-19');
    const allDay = planReminderFires({ ...daily, recurrence: null, start_date: '2026-10-20', start_time: null, remind_offset_min: 780 }, TZ, ...window);
    expect(utcToLocal(allDay[0].due_at, TZ).date).toBe('2026-10-19');
    // No window → the plain time.
    const plain = planReminderFires({ ...daily, recurrence: null, remind_random_from: null, remind_random_to: null }, TZ, ...window);
    expect(plain[0].due_at).toBe(localToUtc('2026-10-16', '08:00', TZ));
  });

  it('RT3 the API stores, returns, keeps and clears the window; a bad window → 400', async () => {
    const o = await owner();
    const reminder = { offsetMin: 0, channels: ['push'], randomFrom: '09:00', randomTo: '17:00' };
    const ev = await o.post('/events', { title: 'Car repair', startDate: '2031-05-14', startTime: '08:00', reminder });
    expect(ev.status, JSON.stringify(ev.json)).toBe(201);
    expect(ev.json.reminder).toMatchObject({ randomFrom: '09:00', randomTo: '17:00' });
    expect((await o.patch(`/events/${ev.json.id}`, { title: 'Car repair!' })).json.reminder).toMatchObject({ randomFrom: '09:00', randomTo: '17:00' });
    const cleared = await o.patch(`/events/${ev.json.id}`, { reminder: { offsetMin: 0, channels: ['push'] } });
    expect(cleared.json.reminder).toMatchObject({ randomFrom: null, randomTo: null });
    for (const bad of [{ randomFrom: '17:00', randomTo: '09:00' }, { randomFrom: '09:00' }]) {
      const r = await o.post('/events', { title: 'Car repair', startDate: '2031-05-14', startTime: '08:00', reminder: { offsetMin: 0, channels: ['push'], ...bad } });
      expect(r.status).toBe(400);
      expect(r.json.error).toBe('invalid_input');
    }
  });

  it('RT4 the tick plans the fire inside the window', async () => {
    const o = await owner();
    const ev = await o.post('/events', {
      title: 'Car repair', startDate: '2031-05-14', startTime: '08:00',
      reminder: { offsetMin: 0, channels: ['push'], randomFrom: '13:00', randomTo: '15:00' },
    });
    await tickAt(o, '2031-05-14T07:30Z'); // 00:30 local
    const f = await env.DB.prepare('SELECT due_at FROM fires WHERE event_id = ?').bind(ev.json.id).first<any>();
    const local = utcToLocal(f.due_at, TZ);
    expect(local.date).toBe('2031-05-14');
    expect(local.time >= '13:00' && local.time < '15:00').toBe(true);
  });
});
