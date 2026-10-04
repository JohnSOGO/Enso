// SPEC §7.7 S1–S3 (sunsetUtc) and G1–G2 (planning) — pure, no I/O.
// S1's expected values come from an INDEPENDENT implementation of the NOAA Solar Calculator
// spreadsheet formulas (NOAA_Solar_Calculations_day.xls: Julian century, geometric mean
// longitude and anomaly, equation of centre, apparent longitude, obliquity, equation of time,
// HA at 90.833°), iterated to the sunset instant. sun.ts uses the NOAA *general* solar position
// algorithm (fractional year γ) — a different formulation, so agreement is a real check.
import { describe, expect, it } from 'vitest';
import { sunsetUtc, type Place } from '../src/shared/sun';
import { alertMessage, planReminderFires, type ReminderEvent } from '../src/shared/engine';
import { utcToLocal } from '../src/shared/time';

const OCEANSIDE: Place = { lat: 33.2, lon: -117.29 };
const TZ = 'America/Los_Angeles';
const MIN = 60_000;

const rad = (d: number) => (d * Math.PI) / 180, deg = (r: number) => (r * 180) / Math.PI;
/** The spreadsheet's columns I..W at Julian day `jd`: equation of time (min) and HA of sunrise (°). */
function sheetAt(jd: number, lat: number): { eqTime: number; ha: number } {
  const JC = (jd - 2451545) / 36525;
  const I = (280.46646 + JC * (36000.76983 + JC * 0.0003032)) % 360;
  const J = 357.52911 + JC * (35999.05029 - 0.0001537 * JC);
  const K = 0.016708634 - JC * (0.000042037 + 0.0000001267 * JC);
  const L = Math.sin(rad(J)) * (1.914602 - JC * (0.004817 + 0.000014 * JC)) + Math.sin(rad(2 * J)) * (0.019993 - 0.000101 * JC)
    + Math.sin(rad(3 * J)) * 0.000289;
  const P = I + L - 0.00569 - 0.00478 * Math.sin(rad(125.04 - 1934.136 * JC));
  const Q = 23 + (26 + (21.448 - JC * (46.815 + JC * (0.00059 - JC * 0.001813))) / 60) / 60;
  const R = Q + 0.00256 * Math.cos(rad(125.04 - 1934.136 * JC));
  const T = deg(Math.asin(Math.sin(rad(R)) * Math.sin(rad(P))));
  const U = Math.tan(rad(R / 2)) ** 2;
  const eqTime = 4 * deg(U * Math.sin(2 * rad(I)) - 2 * K * Math.sin(rad(J)) + 4 * K * U * Math.sin(rad(J)) * Math.cos(2 * rad(I))
    - 0.5 * U * U * Math.sin(4 * rad(I)) - 1.25 * K * K * Math.sin(2 * rad(J)));
  const ha = deg(Math.acos(Math.cos(rad(90.833)) / (Math.cos(rad(lat)) * Math.cos(rad(T))) - Math.tan(rad(lat)) * Math.tan(rad(T))));
  return { eqTime, ha };
}
/** Spreadsheet sunset (unrounded, ms since epoch): solar noon + HA·4 min, re-evaluated at the sunset instant. */
function sheetSunsetMs(date: string, p: Place): number {
  const [y, m, d] = date.split('-').map(Number);
  const day0 = Date.UTC(y, m - 1, d);
  let min = 720 - 4 * p.lon;
  for (let k = 0; k < 5; k++) {
    const { eqTime, ha } = sheetAt(2451545 + (day0 + min * MIN - Date.UTC(2000, 0, 1, 12)) / 86_400_000, p.lat);
    min = 720 - 4 * p.lon - eqTime + 4 * ha;
  }
  return day0 + min * MIN;
}

describe('S1 sunset at Oceanside within ±1 min of the NOAA spreadsheet', () => {
  // The spreadsheet's values, rounded, as local clock times (they also match published Oceanside tables).
  const rows: [string, string][] = [
    ['2026-03-07', '17:51'], ['2026-03-08', '18:52'], ['2026-06-21', '20:02'],
    ['2026-10-31', '17:58'], ['2026-11-01', '16:57'], ['2026-12-21', '16:46'],
  ];
  for (const [date, local] of rows) {
    it(`${date} ≈ ${local}`, () => {
      const sheet = sheetSunsetMs(date, OCEANSIDE);
      expect(utcToLocal(new Date(Math.round(sheet / MIN) * MIN).toISOString(), TZ)).toEqual({ date, time: local });
      const got = sunsetUtc(date, OCEANSIDE)!;
      expect(got).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/); // rounded to the minute
      expect(Math.abs(Date.parse(got) - sheet)).toBeLessThanOrEqual(MIN);
      expect(utcToLocal(got, TZ).date).toBe(date);
    });
  }
});

describe('S2 DST continuity', () => {
  const gap = (a: string, b: string) => (Date.parse(sunsetUtc(b, OCEANSIDE)!) - Date.parse(sunsetUtc(a, OCEANSIDE)!)) / MIN;
  const localMin = (date: string) => { const t = utcToLocal(sunsetUtc(date, OCEANSIDE)!, TZ).time; return Number(t.slice(0, 2)) * 60 + Number(t.slice(3)); };
  it('spring forward: the UTC instants are a day apart, the clock jumps about +1 h', () => {
    expect(Math.abs(gap('2026-03-07', '2026-03-08') - 1440)).toBeLessThanOrEqual(2);
    expect(Math.abs(localMin('2026-03-08') - localMin('2026-03-07') - 60)).toBeLessThanOrEqual(2);
  });
  it('fall back: the UTC instants are a day apart, the clock jumps about −1 h', () => {
    expect(Math.abs(gap('2026-10-31', '2026-11-01') - 1440)).toBeLessThanOrEqual(2);
    expect(Math.abs(localMin('2026-11-01') - localMin('2026-10-31') + 60)).toBeLessThanOrEqual(2);
  });
});

describe('S3 no sunset → null, never a substitute', () => {
  it('latitude 78 on 12-21 (polar night)', () => expect(sunsetUtc('2026-12-21', { lat: 78, lon: 15 })).toBeNull());
  it('latitude 78 on 06-21 (midnight sun)', () => expect(sunsetUtc('2026-06-21', { lat: 78, lon: 15 })).toBeNull());
});

const goat: ReminderEvent = {
  id: 'evt_goat', start_date: '2026-10-03', start_time: null, recurrence: { freq: 'DAILY' }, exdates: [],
  remind_offset_min: 30, start_sun: 'sunset',
};

describe('G1–G2 planning a sun event', () => {
  const from = '2026-10-04T07:00:00.000Z', to = '2026-10-06T07:00:00.000Z'; // local midnights (PDT)
  it('G1 one fire per day, due at sunset − 30; idempotent', () => {
    const fires = planReminderFires(goat, TZ, from, to, OCEANSIDE);
    expect(fires.map((f) => f.occurrence_date)).toEqual(['2026-10-04', '2026-10-05']);
    for (const f of fires) {
      expect(Date.parse(sunsetUtc(f.occurrence_date!, OCEANSIDE)!) - Date.parse(f.due_at)).toBe(30 * MIN);
      expect(f).toMatchObject({ kind: 'reminder', event_id: 'evt_goat', state: 'scheduled' });
    }
    expect(planReminderFires(goat, TZ, from, to, OCEANSIDE)).toEqual(fires);
  });
  it('G2 no place → no fires (never 09:00)', () => {
    expect(planReminderFires(goat, TZ, from, to, null)).toEqual([]);
    expect(planReminderFires(goat, TZ, from, to)).toEqual([]);
  });
  it('no sunset that day → that occurrence is skipped', () => {
    const polar = { lat: 78, lon: 15 };
    expect(planReminderFires({ ...goat, start_date: '2026-12-01' }, 'Europe/Oslo', '2026-12-20T00:00:00.000Z', '2026-12-22T00:00:00.000Z', polar)).toEqual([]);
  });
});

describe('§5.7 sun reminder text', () => {
  it('"{title} — sunset at h:mm", 12-hour with no am/pm, alert suffix kept', () => {
    expect(alertMessage('reminder', 'Put the goats away', 1, undefined, false, '18:42')).toBe('Put the goats away — sunset at 6:42');
    expect(alertMessage('reminder', 'Put the goats away', 2, undefined, false, '18:42')).toBe('Put the goats away — sunset at 6:42 (alert 2)');
    expect(alertMessage('reminder', 'X', 1, undefined, false, '12:05')).toBe('X — sunset at 12:05');
    expect(alertMessage('reminder', 'X', 1, undefined, false, '00:30')).toBe('X — sunset at 12:30');
  });
  it('sunset not computable → "{title} — before sunset"; not a sun event → unchanged', () => {
    expect(alertMessage('reminder', 'Put the goats away', 1, undefined, false, null)).toBe('Put the goats away — before sunset');
    expect(alertMessage('reminder', 'Meds', 1)).toBe('Reminder: Meds');
  });
});
