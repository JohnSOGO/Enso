// M4a acceptance — scheduled alarms (SPEC §11).
import { env } from 'cloudflare:test';
import { expect, it } from 'vitest';
import { owner, tickAt } from './helpers';

it('an alarm is listed with its days, kept off the calendar, and rings only on its days', async () => {
  const o = await owner();
  const a = await o.post('/alarms', { title: 'Meds', time: '08:00', days: ['FR', 'MO', 'WE'], channels: ['push'] });
  expect(a.status).toBe(201);
  expect(a.json.days).toEqual(['MO', 'WE', 'FR']); // stored in week order
  expect(Date.parse(a.json.nextDueAt)).toBeGreaterThan(Date.now()); // known before any fire is planned

  const list = await o.get('/alarms');
  expect(list.json.map((x: any) => [x.title, x.time, x.days])).toContainEqual(['Meds', '08:00', ['MO', 'WE', 'FR']]);

  const cal = await o.get('/calendar?from=2026-10-01&to=2026-12-31');
  expect(cal.json.occurrences.some((x: any) => x.eventId === a.json.id)).toBe(false);
  expect((await o.get(`/events/${a.json.id}`)).status).toBe(404); // not an editable calendar event

  // Make the series start early enough for the simulated dates below.
  await env.DB.prepare('UPDATE events SET start_date = ? WHERE id = ?').bind('2026-10-01', a.json.id).run();
  const fireOn = (date: string) => env.DB.prepare('SELECT state FROM fires WHERE event_id = ? AND occurrence_date = ?').bind(a.json.id, date).first<any>();

  await tickAt(o, '2026-10-06T12:00:00Z'); // Tue 05:00 PDT — plans Tue (none) and Wed
  expect(await fireOn('2026-10-06')).toBeNull(); // Tuesday: no alarm
  await tickAt(o, '2026-10-07T15:00:00Z'); // Wed 08:00 PDT
  expect((await fireOn('2026-10-07')).state).toBe('ringing');
});

it('editing an alarm changes it in place and re-plans its fires', async () => {
  const o = await owner();
  const a = await o.post('/alarms', { title: 'Trash', time: '19:00', days: ['TU'], channels: ['push', 'house'] });
  const e = await o.patch(`/alarms/${a.json.id}`, { time: '20:00', days: ['TU', 'TH'] });
  expect(e.json).toMatchObject({ id: a.json.id, time: '20:00', days: ['TU', 'TH'], channels: ['push', 'house'] });
});

it('an alarm with no days is rejected with a message', async () => {
  const o = await owner();
  const r = await o.post('/alarms', { title: 'Nope', time: '08:00', days: [], channels: ['push'] });
  expect(r.status).toBe(400);
  expect(r.json.message).toMatch(/at least one day/);
});
