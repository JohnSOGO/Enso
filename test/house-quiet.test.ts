// SPEC §9.2b HQ1 — quiet the house: when it ends, whether it is on, what may be asked for.
import { expect, it } from 'vitest';
import { quietEnd, quietError, quietState } from '../src/shared/house-quiet';

const TZ = 'America/Los_Angeles';

it('HQ1: quietEnd, quietState, quietError', () => {
  const now = '2026-10-10T22:00:00.000Z'; // 15:00 PDT
  expect(quietEnd('1h', TZ, now)).toBe('2026-10-10T23:00:00.000Z');
  expect(quietEnd('2h', TZ, now)).toBe('2026-10-11T00:00:00.000Z');
  expect(quietEnd('4h', TZ, now)).toBe('2026-10-11T02:00:00.000Z');
  expect(quietEnd('today', TZ, now)).toBe('2026-10-11T07:00:00.000Z'); // the next local midnight
  expect(quietEnd('today', TZ, '2026-10-11T06:30:00.000Z')).toBe('2026-10-11T07:00:00.000Z'); // 23:30 local → that midnight
  expect(quietEnd('today', TZ, '2026-11-01T20:00:00.000Z')).toBe('2026-11-02T08:00:00.000Z'); // after fall back: PST

  expect(quietState(null, now)).toBeNull();
  expect(quietState('2026-10-10T21:59:00.000Z', now)).toBeNull();
  expect(quietState(now, now)).toBeNull();
  expect(quietState('2026-10-10T22:01:00.000Z', now)).toBe('2026-10-10T22:01:00.000Z');

  for (const v of ['1h', '2h', '4h', 'today']) expect(quietError(v)).toBeNull();
  for (const v of ['3h', '', null, undefined, 2]) expect(quietError(v), String(v)).toBeTruthy();
});
