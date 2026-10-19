// SPEC §8.5b RM1–RM5 — one-off reminders: an alarm with no repeat that rings until Done.
import { env } from 'cloudflare:test';
import { expect, it } from 'vitest';
import { member, owner, tickAt } from './helpers';
import { addDays, addMinutes, localToUtc, utcToLocal } from '../src/shared/time';

const tz = async () => (await env.DB.prepare('SELECT timezone FROM settings WHERE id = 1').first<{ timezone: string }>())!.timezone;
/** A local date a few days ahead, so "later than now" holds whatever the real clock says. */
const ahead = async (days = 3) => addDays(utcToLocal(new Date().toISOString(), await tz()).date, days);
const pushes = (fireId: string) => env.DB.prepare(`SELECT member_id, message FROM deliveries WHERE fire_id = ? AND channel = 'push' ORDER BY created_at`).bind(fireId).all<any>();

it('RM1–RM3: listed apart from alarms, rings the reminded member again, and Done clears it', async () => {
  const o = await owner();
  const m = await member(o);
  const date = await ahead();
  const r = await o.post('/reminders', { title: 'Get bird food', date, time: '17:30', channels: ['push'], renotifyMin: 30, assignedTo: [m.id] });
  expect(r.status).toBe(201);
  const due = localToUtc(date, '17:30', await tz());
  expect(r.json).toMatchObject({ title: 'Get bird food', date, time: '17:30', state: 'due', dueAt: due, assignedTo: [m.id], renotifyMin: 30 });
  expect((await o.get('/reminders')).json.map((x: any) => x.id)).toContain(r.json.id);
  expect((await o.get('/alarms')).json.map((x: any) => x.id)).not.toContain(r.json.id);
  expect((await o.patch(`/alarms/${r.json.id}`, { title: 'x' })).status).toBe(404);

  await tickAt(o, addMinutes(due, -36 * 60 + 1)); // plans it
  await tickAt(o, due);
  const fire = (await env.DB.prepare('SELECT * FROM fires WHERE event_id = ?').bind(r.json.id).first<any>())!;
  expect(fire).toMatchObject({ state: 'ringing', alert_count: 1, kind: 'reminder' });
  expect((await o.get('/reminders')).json.find((x: any) => x.id === r.json.id).state).toBe('ringing');
  await tickAt(o, addMinutes(due, 30));
  const sent = (await pushes(fire.id)).results;
  expect(sent.map((d: any) => d.member_id)).toEqual([m.id, m.id]);
  expect(sent[0].message).toBe('Reminder: Get bird food');

  expect((await m.client.post(`/fires/${fire.id}/actions`, { action: 'done' })).status).toBe(200);
  expect((await o.get('/reminders')).json.map((x: any) => x.id)).not.toContain(r.json.id);
  await tickAt(o, addMinutes(due, 24 * 60));
  expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM fires WHERE event_id = ? AND state != 'closed'`).bind(r.json.id).first<any>())!.n).toBe(0);
  expect((await o.patch(`/reminders/${r.json.id}`, { title: 'again' })).status).toBe(404);
});

it('RM4: a past time, a blank title and another member’s edit are refused; no renotifyMin repeats every 30', async () => {
  const o = await owner();
  const m = await member(o);
  const past = await o.post('/reminders', { title: 'Late', date: await ahead(-1), time: '08:00', channels: ['push'] });
  expect(past.status).toBe(400);
  expect(past.json.message).toBe('Pick a time later than now.');
  expect((await o.post('/reminders', { title: ' ', date: await ahead(), time: '08:00', channels: ['push'] })).status).toBe(400);
  const r = await o.post('/reminders', { title: 'Mine', date: await ahead(), time: '08:00', channels: ['push'] });
  expect(r.json.renotifyMin).toBe(30);
  expect((await m.client.patch(`/reminders/${r.json.id}`, { title: 'Theirs' })).status).toBe(403);
  expect((await m.client.del(`/reminders/${r.json.id}`)).status).toBe(403);
});

it('RM5: a missed reminder moved later is due again; DELETE removes it and its fire', async () => {
  const o = await owner();
  const date = await ahead();
  const r = await o.post('/reminders', { title: 'Call the vet', date, time: '09:00', channels: ['push'] });
  // Make it look missed: its time is in the past and its fire closed missed.
  await env.DB.prepare(`UPDATE events SET start_date = ?, end_date = ? WHERE id = ?`).bind(await ahead(-2), await ahead(-2), r.json.id).run();
  expect((await o.get('/reminders')).json.find((x: any) => x.id === r.json.id).state).toBe('missed');
  const moved = await o.patch(`/reminders/${r.json.id}`, { date, time: '10:00' });
  expect(moved.status).toBe(200);
  expect(moved.json).toMatchObject({ state: 'due', date, time: '10:00' });

  const due = localToUtc(date, '10:00', await tz());
  await tickAt(o, addMinutes(due, -60));
  const fire = (await env.DB.prepare(`SELECT id FROM fires WHERE event_id = ? AND state = 'scheduled'`).bind(r.json.id).first<any>())!;
  expect((await o.del(`/reminders/${r.json.id}`)).json).toEqual({ ok: true });
  expect((await o.get('/reminders')).json.map((x: any) => x.id)).not.toContain(r.json.id);
  // DELETE runs on the real clock, before the fire's due time.
  expect((await env.DB.prepare('SELECT state, close_reason FROM fires WHERE id = ?').bind(fire.id).first<any>())).toEqual({ state: 'closed', close_reason: 'removed' });
});

it('RM8: each member sets their own After work / After school', async () => {
  const o = await owner();
  const m = await member(o);
  const row = async (id: string) => (await o.get('/members')).json.find((x: any) => x.id === id).after;
  expect(await row(m.id)).toEqual({ kind: 'school', time: '15:00' });
  const set = await m.client.patch('/me', { afterKind: 'work', afterTime: '16:30' });
  expect(set.status).toBe(200);
  expect(set.json.after).toEqual({ kind: 'work', time: '16:30' });
  expect(await row(m.id)).toEqual({ kind: 'work', time: '16:30' });
  expect((await m.client.patch('/me', { afterTime: 'soon' })).status).toBe(400);
  expect((await m.client.patch('/me', { afterKind: 'gym' })).status).toBe(400);
  await m.client.patch('/me', { afterKind: null, afterTime: null });
  expect(await row(m.id)).toEqual({ kind: 'school', time: '15:00' });
});
