// SPEC §9.2d PF1 — phone first, then the house.
import { expect, it } from 'vitest';
import { speaksOnHouse } from '../src/shared/phone-first';

it('PF1: speaksOnHouse', () => {
  const both = { channels: ['push', 'house'] as ('push' | 'house')[], renotifyMin: 5, maxAlerts: 4 };
  expect(speaksOnHouse(1, both)).toBe(false);
  expect(speaksOnHouse(2, both)).toBe(true);
  expect(speaksOnHouse(4, both)).toBe(true);
  expect(speaksOnHouse(1, { ...both, channels: ['house'] })).toBe(true);
  expect(speaksOnHouse(1, { ...both, renotifyMin: null })).toBe(true);
  expect(speaksOnHouse(1, { ...both, maxAlerts: 1 })).toBe(true);
  expect(speaksOnHouse(2, { ...both, channels: ['push'] })).toBe(false);
});
