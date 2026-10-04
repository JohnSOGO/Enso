// M4i acceptance — event emoji (SPEC §7.6 E1–E3) through the API, plus the one-emoji rule's unit rows.
import { describe, expect, it } from 'vitest';
import { owner } from './helpers';
import { EMOJI_MAX_BYTES, emojiError } from '../src/shared/emoji';

describe('emojiError (§7.6)', () => {
  it.each(['🧹', '🗑️', '🇺🇸', '❤️'])('accepts %s', (v) => expect(emojiError(v)).toBeNull());
  it.each(['ab', '🧹🧹', '1', '#', '', ' ', 'a'])('rejects %j', (v) => expect(emojiError(v)).toMatch(/single emoji/));
  it('rejects a single grapheme over the byte cap', () => {
    const long = '👨‍👩‍👧‍👦'; // one grapheme, 25 bytes
    expect(new TextEncoder().encode(long).length).toBeGreaterThan(EMOJI_MAX_BYTES);
    expect(emojiError(long)).not.toBeNull();
  });
  it('rejects a 17-byte string', () => {
    const v = '🧹'.repeat(4) + 'a'; // 17 bytes
    expect(new TextEncoder().encode(v).length).toBe(17);
    expect(emojiError(v)).not.toBeNull();
  });
  it('rejects non-strings', () => expect(emojiError(7)).not.toBeNull());
});

describe('event emoji through the API (E1–E3)', () => {
  const base = { title: 'Street sweeping', startDate: '2026-10-01', startTime: null, recurrence: { freq: 'MONTHLY', byDay: ['TH'], setPos: [1, 3] } };

  it('E1 an event with emoji 🧹 round-trips through POST/GET; PATCH keeps or clears it', async () => {
    const o = await owner();
    const ev = await o.post('/events', { ...base, emoji: '🧹' });
    expect(ev.status).toBe(201);
    expect(ev.json.emoji).toBe('🧹');
    expect((await o.get(`/events/${ev.json.id}`)).json.emoji).toBe('🧹');
    expect((await o.patch(`/events/${ev.json.id}`, { title: 'Sweeping' })).json.emoji).toBe('🧹');
    expect((await o.patch(`/events/${ev.json.id}`, { emoji: '🗑️' })).json.emoji).toBe('🗑️');
    expect((await o.patch(`/events/${ev.json.id}`, { emoji: '' })).json.emoji).toBeNull();
    expect((await o.post('/events', { ...base, title: 'Plain' })).json.emoji).toBeNull();
  });

  it.each(['ab', '🧹🧹', '🧹🧹🧹🧹a'])('E2 emoji %j → 400 with a message', async (emoji) => {
    const o = await owner();
    const r = await o.post('/events', { ...base, emoji });
    expect(r.status).toBe(400);
    expect(r.json.message).toMatch(/single emoji/);
  });

  it('E3 /calendar occurrences carry emoji; /optional-events too', async () => {
    const o = await owner();
    const ev = await o.post('/events', { ...base, emoji: '🧹', optional: true });
    const cal = await o.get('/calendar?from=2026-10-01&to=2026-10-31');
    const mine = cal.json.occurrences.filter((x: any) => x.eventId === ev.json.id);
    expect(mine.map((x: any) => x.date)).toEqual(['2026-10-01', '2026-10-15']);
    expect(mine.every((x: any) => x.emoji === '🧹')).toBe(true);
    expect((await o.get('/optional-events')).json.find((x: any) => x.id === ev.json.id).emoji).toBe('🧹');
  });
});
