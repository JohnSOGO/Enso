// MT1–MT3 (SPEC §7.14) — the moon's rise, set, overhead and underfoot, and sunrise, for Oceanside, against an independent
// ephemeris (astronomy-engine 2.1.19, run once by hand), each within 6 minutes.
import { describe, expect, it } from 'vitest';
import { moonTimes } from '../src/shared/moon-times';
import { sunriseUtc } from '../src/shared/sun';

const OCEANSIDE = { lat: 33.2, lon: -117.29 };
const TZ = 'America/Los_Angeles';
const near = (got: string | null, want: string) => {
  expect(got).not.toBeNull();
  expect(Math.abs(Date.parse(got!) - Date.parse(want)) / 60000).toBeLessThanOrEqual(6);
};

describe('moonTimes', () => {
  it('MT1 matches the ephemeris on four dates', () => {
    const want: Record<string, [string, string, string, string]> = { // rise, set, over, under ('' = not on that local day)
      '2026-10-25': ['2026-10-26T00:36Z', '2026-10-25T13:30Z', '', '2026-10-25T19:07Z'],
      '2026-11-09': ['2026-11-09T14:46Z', '2026-11-10T00:53Z', '2026-11-09T19:52Z', ''],
      '2026-12-21': ['2026-12-21T22:23Z', '2026-12-21T12:14Z', '2026-12-22T05:52Z', '2026-12-21T17:21Z'],
      '2026-06-21': ['2026-06-21T19:48Z', '2026-06-21T07:24Z', '2026-06-22T01:53Z', '2026-06-21T13:32Z'],
    };
    for (const [date, [rise, set, over, under]] of Object.entries(want)) {
      const m = moonTimes(date, OCEANSIDE, TZ);
      near(m.rise, rise); near(m.set, set);
      if (over) near(m.over, over); else expect(m.over).toBeNull();
      if (under) near(m.under, under); else expect(m.under).toBeNull();
    }
  });
  it('MT2 2026-10-27: overhead in the small hours, underfoot after lunch', () => {
    const m = moonTimes('2026-10-27', OCEANSIDE, TZ);
    near(m.over, '2026-10-27T08:30Z'); near(m.under, '2026-10-27T21:00Z'); near(m.set, '2026-10-27T15:53Z');
    near(m.rise, '2026-10-28T02:01Z'); // 7:01pm local, still the 27th
  });
});

describe('sunriseUtc', () => {
  it('MT3 matches the ephemeris', () => {
    near(sunriseUtc('2026-10-27', OCEANSIDE), '2026-10-27T14:03Z');
    near(sunriseUtc('2026-12-21', OCEANSIDE), '2026-12-21T14:48Z');
    near(sunriseUtc('2026-06-21', OCEANSIDE), '2026-06-21T12:40Z');
    expect(sunriseUtc('2026-12-21', { lat: 78, lon: 15 })).toBeNull();
  });
});
