// SPEC §7.10 EB1–EB5 — an event's things to bring: through the API, in words, and in its reminder.
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { owner, tickAt } from './helpers';
import { EVENT_BRING_ITEM_MAX, EVENT_BRING_MAX } from '../src/shared/alert-limits';
import { bringText } from '../src/shared/bring';
import { alertMessage } from '../src/shared/engine';

describe('§7.10 things to bring', () => {
  const base = { title: 'Soccer', startDate: '2026-10-17', startTime: '09:00' };

  it('EB1 cleaned, stored and returned; kept by a title-only PATCH; cleared by []', async () => {
    const o = await owner();
    const ev = await o.post('/events', { ...base, bring: ['  Water ', '', 'Snacks', 'water'] });
    expect(ev.status, JSON.stringify(ev.json)).toBe(201);
    expect(ev.json.bring).toEqual(['Water', 'Snacks']);
    expect((await o.get(`/events/${ev.json.id}`)).json.bring).toEqual(['Water', 'Snacks']);
    expect((await o.patch(`/events/${ev.json.id}`, { title: 'Soccer game' })).json.bring).toEqual(['Water', 'Snacks']);
    expect((await o.patch(`/events/${ev.json.id}`, { bring: [] })).json.bring).toEqual([]);
    expect((await env.DB.prepare('SELECT bring FROM events WHERE id = ?').bind(ev.json.id).first<any>()).bring).toBeNull();
    expect((await o.post('/events', base)).json.bring).toEqual([]);
  });

  it.each([
    Array.from({ length: EVENT_BRING_MAX + 1 }, (_, i) => `Thing ${i}`), ['x'.repeat(EVENT_BRING_ITEM_MAX + 1)], 'water', [3],
  ])('EB2 bring %# → 400 invalid_input', async (bring) => {
    const o = await owner();
    const r = await o.post('/events', { ...base, bring });
    expect(r.status).toBe(400);
    expect(r.json.error).toBe('invalid_input');
    expect(r.json.message).toBe(`Things to bring must be a list of up to ${EVENT_BRING_MAX} lines, each up to ${EVENT_BRING_ITEM_MAX} characters.`);
  });

  it('EB3 the words', () => {
    expect(bringText(['Water'])).toBe('bring: water');
    expect(bringText(['Shin guards', 'Water'])).toBe('bring: shin guards and water');
    expect(bringText(['Shin guards', 'Water', 'GPS watch', 'Snacks'])).toBe('bring: shin guards, water, GPS watch and snacks');
  });

  it('EB4 the reminder message, every alert', () => {
    const bring = ['Shin guards', 'Water'];
    expect(alertMessage('reminder', 'Soccer', 1, undefined, false, undefined, bring)).toBe('Reminder: Soccer — bring: shin guards and water');
    expect(alertMessage('reminder', 'Soccer', 2, undefined, false, undefined, bring)).toBe('Reminder: Soccer — bring: shin guards and water (alert 2)');
    expect(alertMessage('reminder', 'Soccer', 1, undefined, false, undefined, [])).toBe('Reminder: Soccer');
  });

  it('EB5 the phone and the speakers both hear the list', async () => {
    const o = await owner();
    const ev = await o.post('/events', {
      title: 'Soccer', startDate: '2031-05-14', startTime: '18:00', bring: ['Shin guards', 'Water'],
      reminder: { offsetMin: 0, channels: ['push', 'house'] },
    });
    await tickAt(o, '2031-05-14T12:00Z');
    await tickAt(o, '2031-05-15T01:00Z');
    const d = await env.DB.prepare(
      'SELECT d.channel, d.message FROM deliveries d JOIN fires f ON f.id = d.fire_id WHERE f.event_id = ?').bind(ev.json.id).all<any>();
    expect(new Set(d.results.map((x) => x.channel))).toEqual(new Set(['push', 'house']));
    expect(d.results.every((x) => x.message === 'Reminder: Soccer — bring: shin guards and water')).toBe(true);
  });
});
