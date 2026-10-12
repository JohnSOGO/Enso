// SPEC §8.17 CK1–CK2 — the 12-hour / 24-hour clock: the one formatter, and the member's choice on /me.
import { describe, expect, it } from 'vitest';
import { owner } from './helpers';
import { clockText } from '../src/shared/time';

describe('CK1 clockText', () => {
  it('12-hour: no leading zero, am/pm, no space (⚑ Q278); 24-hour: as stored', () => {
    expect([clockText('18:42', false), clockText('18:42', true)]).toEqual(['6:42pm', '18:42']);
    expect([clockText('00:05', false), clockText('00:05', true)]).toEqual(['12:05am', '00:05']);
    expect(clockText('12:00', false)).toBe('12:00pm');
    expect([clockText('09:30', false), clockText('09:30', true)]).toEqual(['9:30am', '09:30']);
  });
});

describe('CK2 PATCH /me { clock24h }', () => {
  it('starts 12-hour, saves a boolean, refuses anything else', async () => {
    const A = await owner();
    expect((await A.get('/me')).json.clock24h).toBe(false);
    expect((await A.patch('/me', { clock24h: true })).json.clock24h).toBe(true);
    expect((await A.get('/me')).json.clock24h).toBe(true);
    expect((await A.patch('/me', { clock24h: 'yes' })).status).toBe(400);
    expect((await A.get('/me')).json.clock24h).toBe(true);
  });
});
