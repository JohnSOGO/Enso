// SPEC §8.5d SR1–SR6 (🌅 sunrise and sunset reminders), §7.7 S4–S5, §8.5 UN1–UN4 (the Until box). Fakes only.
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { owner, tickAt } from './helpers';
import { addDays, addMinutes, utcToLocal } from '../src/shared/time';
import { sunUtcOf, sunriseUtc, sunsetUtc, type Place } from '../src/shared/sun';
import { alertMessage, planReminderFires, type ReminderEvent } from '../src/shared/engine';
import { hasEnded, untilError } from '../src/shared/recurrence';
import { sunReminderError } from '../src/shared/reminders';

const OCEANSIDE: Place = { lat: 33.2, lon: -117.29 };
const TZ = 'America/Los_Angeles';
const ALL = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const tz = async () => (await env.DB.prepare('SELECT timezone FROM settings WHERE id = 1').first<{ timezone: string }>())!.timezone;
const place = async () => {
  const p = (await env.DB.prepare('SELECT latitude AS lat, longitude AS lon FROM settings WHERE id = 1').first<Place>())!;
  return { lat: p.lat, lon: p.lon };
};
const today = async () => utcToLocal(new Date().toISOString(), await tz()).date;
const fires = (id: string) => env.DB.prepare('SELECT * FROM fires WHERE event_id = ? ORDER BY due_at').bind(id).all<any>().then((r) => r.results);

describe('§7.7 S4–S5', () => {
  it('S4 sunUtcOf picks sunrise or sunset', () => {
    expect(sunUtcOf('2026-11-24', OCEANSIDE, 'sunrise')).toBe(sunriseUtc('2026-11-24', OCEANSIDE));
    expect(sunUtcOf('2026-11-24', OCEANSIDE, 'sunset')).toBe(sunsetUtc('2026-11-24', OCEANSIDE));
    const rise = utcToLocal(sunriseUtc('2026-11-24', OCEANSIDE)!, TZ).time;
    expect(rise >= '06:20' && rise <= '06:35').toBe(true);
  });
  it('S5 the sunrise text, and its fallback', () => {
    expect(alertMessage('reminder', 'Goats out', 1, undefined, false, { at: 'sunrise', time: '06:29' })).toBe('Goats out — sunrise at 6:29am');
    expect(alertMessage('reminder', 'Goats out', 1, undefined, false, { at: 'sunrise', time: null })).toBe('Goats out — sunrise');
  });
});

describe('§8.5d SR1 planning', () => {
  const ev: ReminderEvent = {
    id: 'evt_g', start_date: '2026-11-24', start_time: null, start_sun: 'sunrise', remind_offset_min: -30,
    recurrence: { freq: 'WEEKLY', byDay: ALL as any }, exdates: [],
  };
  it('one fire a day at sunrise + 30 min; nothing after Until', () => {
    const got = planReminderFires(ev, TZ, '2026-11-24T00:00:00.000Z', '2026-11-27T12:00:00.000Z', OCEANSIDE);
    expect(got.map((f) => f.occurrence_date)).toEqual(['2026-11-24', '2026-11-25', '2026-11-26']);
    for (const f of got) expect(f.due_at).toBe(addMinutes(sunriseUtc(f.occurrence_date!, OCEANSIDE)!, 30));
    const ended = planReminderFires({ ...ev, recurrence: { freq: 'WEEKLY', byDay: ALL as any, until: '2026-11-25' } }, TZ,
      '2026-11-24T00:00:00.000Z', '2026-11-27T12:00:00.000Z', OCEANSIDE);
    expect(ended.map((f) => f.occurrence_date)).toEqual(['2026-11-24', '2026-11-25']);
  });
  it('no place → nothing (never a substitute time)', () => {
    expect(planReminderFires(ev, TZ, '2026-11-24T00:00:00.000Z', '2026-11-27T00:00:00.000Z', null)).toEqual([]);
  });
});

describe('§8.5 UN1 untilError', () => {
  it('null or a date from the start on', () => {
    expect(untilError('2026-11-29', '2026-11-23')).toBeNull();
    expect(untilError('2026-11-23', '2026-11-23')).toBeNull();
    expect(untilError('2026-11-22', '2026-11-23')).toBe('Pick an Until date from today on.');
    expect(untilError('Sunday', '2026-11-23')).toBe('Until must be YYYY-MM-DD.');
    expect(untilError(null, '2026-11-23')).toBeNull();
    expect(hasEnded({ freq: 'DAILY', until: '2026-11-22' }, '2026-11-23')).toBe(true);
    expect(hasEnded({ freq: 'DAILY', until: '2026-11-23' }, '2026-11-23')).toBe(false);
    expect(hasEnded(null, '2026-11-23')).toBe(false);
  });
});

it('SR2–SR4: a sunrise reminder is listed apart from alarms, rings at sunrise, and rings again the next day after Done', async () => {
  const o = await owner();
  const [t, p, z] = [await today(), await place(), await tz()];
  const until = addDays(t, 6);
  const r = await o.post('/reminders', { title: 'Goats out', sun: { at: 'sunrise', offsetMin: 0, days: ALL }, until, channels: ['push'], renotifyMin: 30 });
  expect(r.status).toBe(201);
  expect(r.json).toMatchObject({ state: 'due', sun: { at: 'sunrise', offsetMin: 0, days: ALL }, until, window: null });
  const d1 = addDays(t, 2), d2 = addDays(t, 3);
  expect((await o.get('/alarms')).json.map((x: any) => x.id)).not.toContain(r.json.id);

  const rise1 = sunriseUtc(d1, p)!;
  await tickAt(o, addMinutes(rise1, -60));
  await tickAt(o, rise1);
  const ring = (await fires(r.json.id)).find((f: any) => f.occurrence_date === d1);
  expect(ring).toMatchObject({ state: 'ringing', alert_count: 1, due_at: rise1 });
  const text = await env.DB.prepare('SELECT message FROM deliveries WHERE fire_id = ? ORDER BY created_at').bind(ring.id).first<{ message: string }>();
  expect(text!.message).toMatch(/^Goats out — sunrise at \d{1,2}:\d\d(am|pm)$|^Goats out — sunrise at \d\d:\d\d$/);
  await tickAt(o, addMinutes(rise1, 30));
  expect((await fires(r.json.id)).find((f: any) => f.id === ring.id).alert_count).toBe(2);

  expect((await o.post(`/fires/${ring.id}/actions`, { action: 'done' })).status).toBe(200);
  expect((await o.get('/reminders')).json.map((x: any) => x.id)).toContain(r.json.id); // ⚑ Q412: Done ends the day only
  const ev = (await env.DB.prepare('SELECT recurrence FROM events WHERE id = ?').bind(r.json.id).first<any>())!;
  expect(JSON.parse(ev.recurrence).until).toBe(until);
  const rise2 = sunriseUtc(d2, p)!;
  await tickAt(o, addMinutes(rise2, -60));
  await tickAt(o, rise2);
  expect((await fires(r.json.id)).find((f: any) => f.occurrence_date === d2)).toMatchObject({ state: 'ringing', due_at: rise2 });
  expect(z).toBeTruthy();
});

it('SR5–SR6: bad sun bodies are refused; a sun reminder can become a one-off', async () => {
  const o = await owner();
  const t = await today();
  const post = (sun: unknown) => o.post('/reminders', { title: 'x', sun, channels: ['push'] });
  expect((await post({ at: 'sunrise', offsetMin: 300, days: ALL })).status).toBe(400);
  expect((await post({ at: 'sunrise', offsetMin: 0, days: [] })).status).toBe(400);
  expect((await post({ at: 'noon', offsetMin: 0, days: ALL })).status).toBe(400);
  expect(sunReminderError({ at: 'sunset', offsetMin: -240, days: ['MO'] })).toBeNull();
  const r = await post({ at: 'sunset', offsetMin: 15, days: ALL });
  expect(r.status).toBe(201);
  expect(r.json.sun).toEqual({ at: 'sunset', offsetMin: 15, days: ALL });
  const date = addDays(t, 3);
  const one = await o.patch(`/reminders/${r.json.id}`, { sun: null, date, time: '10:00' });
  expect(one.status).toBe(200);
  expect(one.json).toMatchObject({ sun: null, window: null, date, time: '10:00', until: null });
  const row = await env.DB.prepare('SELECT start_sun, recurrence FROM events WHERE id = ?').bind(r.json.id).first<any>();
  expect(row).toEqual({ start_sun: null, recurrence: null });
  expect((await o.get('/alarms')).json.map((x: any) => x.id)).not.toContain(r.json.id);
});

it('UN2–UN4: alarms take an Until, end after it, and refuse a past one', async () => {
  const o = await owner();
  const [t, z] = [await today(), await tz()];
  const a = await o.post('/alarms', { title: 'Feed chicks', time: '07:00', days: ALL, channels: ['push'], until: addDays(t, 6) });
  expect(a.status).toBe(201);
  expect(a.json).toMatchObject({ until: addDays(t, 6), ended: false });
  const cleared = await o.patch(`/alarms/${a.json.id}`, { until: null });
  expect(cleared.json.until).toBeNull();
  expect((await o.post('/alarms', { title: 'x', time: '07:00', days: ALL, channels: ['push'], until: addDays(t, -1) })).json.message)
    .toBe('Pick an Until date from today on.');
  expect((await o.post('/reminders', { title: 'x', window: { days: ALL, from: '08:00', to: '11:00' }, until: addDays(t, -1), channels: ['push'] })).status).toBe(400);

  // UN3: Until = tomorrow → rings tomorrow, not the day after; then ended.
  const b = await o.post('/alarms', { title: 'Lock the coop', time: '07:00', days: ALL, channels: ['push'], until: addDays(t, 1) });
  const after = addDays(t, 2);
  const { localToUtc } = await import('../src/shared/time');
  await tickAt(o, localToUtc(addDays(t, 1), '06:00', z));
  await tickAt(o, localToUtc(addDays(t, 1), '07:00', z));
  await tickAt(o, localToUtc(after, '06:00', z));
  await tickAt(o, localToUtc(after, '07:00', z));
  const fs = await fires(b.json.id);
  expect(fs.some((f: any) => f.occurrence_date === addDays(t, 1))).toBe(true);
  expect(fs.some((f: any) => f.occurrence_date === after)).toBe(false);
});
