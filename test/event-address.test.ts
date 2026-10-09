// SPEC §7.9 EA1–EA2 — an event's address through the API.
import { describe, expect, it } from 'vitest';
import { owner } from './helpers';
import { EVENT_ADDRESS_MAX } from '../src/shared/alert-limits';

describe('§7.9 an event address', () => {
  const base = { title: 'Mia\'s party', startDate: '2026-10-17', startTime: '14:00' };

  it('EA1 stored trimmed and returned; PATCH keeps it, clears it to null; none → null', async () => {
    const o = await owner();
    const ev = await o.post('/events', { ...base, address: '  Sky Zone, 3030 Plaza Bonita Rd, National City  ' });
    expect(ev.status, JSON.stringify(ev.json)).toBe(201);
    expect(ev.json.address).toBe('Sky Zone, 3030 Plaza Bonita Rd, National City');
    expect((await o.get(`/events/${ev.json.id}`)).json.address).toBe('Sky Zone, 3030 Plaza Bonita Rd, National City');
    expect((await o.patch(`/events/${ev.json.id}`, { title: 'Party' })).json.address).toBe('Sky Zone, 3030 Plaza Bonita Rd, National City');
    expect((await o.patch(`/events/${ev.json.id}`, { address: null })).json.address).toBeNull();
    expect((await o.patch(`/events/${ev.json.id}`, { address: '   ' })).json.address).toBeNull();
    expect((await o.post('/events', base)).json.address).toBeNull();
  });

  it.each(['x'.repeat(EVENT_ADDRESS_MAX + 1), 7])('EA2 address %# → 400 invalid_input', async (address) => {
    const o = await owner();
    const r = await o.post('/events', { ...base, address });
    expect(r.status).toBe(400);
    expect(r.json.error).toBe('invalid_input');
    expect(r.json.message).toBe(`Address must be text (up to ${EVENT_ADDRESS_MAX} characters).`);
  });
});
