// SPEC §8.5c RW1–RW4 — a reminder at random times in a window on chosen days, once a day, until Done.
import { env } from 'cloudflare:test';
import { expect, it } from 'vitest';
import { owner, tickAt } from './helpers';
import { addDays, addMinutes, localToUtc, ms, utcToLocal, weekdayOf } from '../src/shared/time';
import { randomTimeIn } from '../src/shared/random-time';
import { windowEnd, windowError } from '../src/shared/reminders';

const tz = async () => (await env.DB.prepare('SELECT timezone FROM settings WHERE id = 1').first<{ timezone: string }>())!.timezone;
const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR'];
/** The first Monday at least two days from today (local). */
const nextMonday = async () => {
  let d = addDays(utcToLocal(new Date().toISOString(), await tz()).date, 2);
  while (weekdayOf(d) !== 1) d = addDays(d, 1);
  return d;
};
const fires = (id: string) => env.DB.prepare('SELECT * FROM fires WHERE event_id = ? ORDER BY due_at').bind(id).all<any>().then((r) => r.results);

it('RW1–RW2: listed apart from alarms; rings once a day inside the window; the next day supersedes', async () => {
  const o = await owner();
  const r = await o.post('/reminders', { title: 'Book car check', window: { days: ['FR', 'MO', 'TU', 'WE', 'TH'], from: '08:00', to: '11:00' }, channels: ['push'] });
  expect(r.status).toBe(201);
  expect(r.json).toMatchObject({ state: 'due', window: { days: WEEKDAYS, from: '08:00', to: '11:00' }, renotifyMin: null });
  const local = utcToLocal(r.json.dueAt, await tz());
  expect(local.time >= '08:00' && local.time < '11:00').toBe(true);
  expect(weekdayOf(local.date) >= 1 && weekdayOf(local.date) <= 5).toBe(true);
  expect((await o.get('/alarms')).json.map((x: any) => x.id)).not.toContain(r.json.id);
  expect((await o.get('/reminders')).json.map((x: any) => x.id)).toContain(r.json.id);

  const mon = await nextMonday(), tue = addDays(mon, 1);
  const monAt = localToUtc(mon, randomTimeIn(`${r.json.id}|${mon}`, '08:00', '11:00'), await tz());
  const tueAt = localToUtc(tue, randomTimeIn(`${r.json.id}|${tue}`, '08:00', '11:00'), await tz());
  await tickAt(o, addMinutes(monAt, -60));
  await tickAt(o, monAt);
  await tickAt(o, addMinutes(monAt, 90)); // no repeat within the day
  const mine = (await fires(r.json.id)).filter((f: any) => f.occurrence_date === mon);
  expect(mine).toHaveLength(1);
  expect(mine[0]).toMatchObject({ state: 'ringing', alert_count: 1, due_at: monAt });
  await tickAt(o, addMinutes(tueAt, -60));
  await tickAt(o, tueAt);
  const all = await fires(r.json.id);
  expect(all.find((f: any) => f.occurrence_date === mon)).toMatchObject({ state: 'closed', close_reason: 'superseded' });
  expect(all.find((f: any) => f.occurrence_date === tue)).toMatchObject({ state: 'ringing', due_at: tueAt });
});

it('RW3: Done on a ring ends it: until that day, later fires removed, gone from the list', async () => {
  const o = await owner();
  const r = await o.post('/reminders', { title: 'Call the garage', window: { days: ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'], from: '08:00', to: '11:00' }, channels: ['push'] });
  const mon = await nextMonday(), tue = addDays(mon, 1);
  const monAt = localToUtc(mon, randomTimeIn(`${r.json.id}|${mon}`, '08:00', '11:00'), await tz());
  await tickAt(o, addMinutes(monAt, -60));
  await tickAt(o, monAt);
  // Tuesday's fire is already planned (36 h ahead) before Done.
  const tueFire = (await fires(r.json.id)).find((f: any) => f.occurrence_date === tue);
  expect(tueFire.state).toBe('scheduled');
  const ringing = (await fires(r.json.id)).find((f: any) => f.state === 'ringing');
  expect((await o.post(`/fires/${ringing.id}/actions`, { action: 'done' })).status).toBe(200);
  const ev = (await env.DB.prepare('SELECT recurrence FROM events WHERE id = ?').bind(r.json.id).first<any>())!;
  expect(JSON.parse(ev.recurrence).until).toBe(mon);
  expect((await fires(r.json.id)).find((f: any) => f.id === tueFire.id)).toMatchObject({ state: 'closed', close_reason: 'removed' });
  expect((await o.get('/reminders')).json.map((x: any) => x.id)).not.toContain(r.json.id);
  await tickAt(o, localToUtc(addDays(mon, 2), '12:00', await tz()));
  expect((await fires(r.json.id)).filter((f: any) => f.state !== 'closed')).toHaveLength(0);
});

it('RW4: no days, From after To, and a bad time are refused; PATCH switches between shapes', async () => {
  const o = await owner();
  expect((await o.post('/reminders', { title: 'x', window: { days: [], from: '08:00', to: '11:00' }, channels: ['push'] })).status).toBe(400);
  expect((await o.post('/reminders', { title: 'x', window: { days: ['MO'], from: '11:00', to: '08:00' }, channels: ['push'] })).status).toBe(400);
  expect(windowError({ days: ['MO'], from: '8am', to: '11:00' })).toBeTruthy();
  expect(windowError({ days: ['MO'], from: '08:00', to: '11:00' })).toBeNull();
  const r = await o.post('/reminders', { title: 'Oil change', window: { days: ['SA'], from: '09:00', to: '12:00' }, channels: ['push'] });
  const date = addDays(utcToLocal(new Date().toISOString(), await tz()).date, 3);
  const one = await o.patch(`/reminders/${r.json.id}`, { window: null, date, time: '10:00' });
  expect(one.status).toBe(200);
  expect(one.json).toMatchObject({ window: null, date, time: '10:00', state: 'due' });
  const back = await o.patch(`/reminders/${one.json.id}`, { window: { days: ['SU'], from: '13:00', to: '14:00' } });
  expect(back.json.window).toEqual({ days: ['SU'], from: '13:00', to: '14:00' });
  expect(ms(back.json.dueAt)).toBeGreaterThan(Date.now());
  expect((await o.get('/alarms')).json.map((x: any) => x.id)).not.toContain(r.json.id);
});

it('windowEnd: only Done or Ack on a window reminder ring', () => {
  const ev = { is_alarm: 1, remind_random_from: '08:00', recurrence: { freq: 'WEEKLY' as const, byDay: ['MO' as const] } };
  const fire = { kind: 'reminder', occurrence_date: '2026-10-26' };
  expect(windowEnd(ev, fire, 'done')).toEqual({ freq: 'WEEKLY', byDay: ['MO'], until: '2026-10-26' });
  expect(windowEnd(ev, fire, 'snooze')).toBeNull();
  expect(windowEnd({ ...ev, remind_random_from: null }, fire, 'done')).toBeNull();
  expect(windowEnd({ ...ev, is_alarm: 0 }, fire, 'done')).toBeNull();
});
