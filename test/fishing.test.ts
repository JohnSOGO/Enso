// SPEC §7.14 FS1–FS6, §7.14b FE1–FE3 — good fishing times, the pure rules: the spots and their drive times, the
// window rating, the words, the coast answers and the fish event answers.
import { describe, expect, it } from 'vitest';
import { FISHING_SPOTS, TIDE_STATIONS, driveMinutes, rangeError, spotsWithin } from '../src/shared/fishing-spots';
import { bestWindows, fishingPing, fishingText, phaseNear, windowsAt, type DayFacts } from '../src/shared/fishing';
import { moonPhasesBetween } from '../src/shared/moon';
import { parseTides, parseWaves, parseWind, tidesUrl } from '../src/shared/coast';
import { freeDaysBetween, parseParksIcal, parsePlants } from '../src/shared/fish-events';

const HOME = { lat: 33.2, lon: -117.29 };
const TZ = 'America/Los_Angeles';
const spot = (id: string) => ({ ...FISHING_SPOTS.find((s) => s.id === id)!, minutes: driveMinutes(HOME, FISHING_SPOTS.find((s) => s.id === id)!) });
const NONE = { rise: null, set: null, over: null, under: null };
const calm: DayFacts = { sunrise: '2026-10-27T14:03:00.000Z', sunset: '2026-10-28T01:02:00.000Z', moon: NONE, phase: null, tides: [], windMph: 8, waveFt: 3 };

describe('FS1–FS2 the spots', () => {
  it('FS1 every spot has a unique id, a link, and a tide station only at sea', () => {
    expect(new Set(FISHING_SPOTS.map((s) => s.id)).size).toBe(FISHING_SPOTS.length);
    for (const s of FISHING_SPOTS) {
      expect(s.link).toMatch(/^https:\/\//);
      if (s.kind === 'ocean') expect(TIDE_STATIONS).toContain(s.station); else expect(s.station).toBeUndefined();
    }
  });
  it('FS2 drive times from Oceanside, and How far will we go', () => {
    expect(driveMinutes(HOME, spot('oceanside-pier'))).toBe(10);
    expect(driveMinutes(HOME, spot('lake-cuyamaca'))).toBe(90);
    expect(spotsWithin(HOME, 15).map((s) => s.id)).toEqual(['guajome-lake', 'oceanside-pier', 'oceanside-harbor', 'agua-hedionda', 'discovery-lake']);
    expect(spotsWithin(HOME, 120)).toHaveLength(FISHING_SPOTS.length); // two hours reaches every spot
    expect(rangeError(45)).toBeNull();
    expect(rangeError(50)).toMatch(/15, 30, 45, 60, 90, 120/);
    expect(rangeError('45')).not.toBeNull();
  });
});

describe('FS3–FS5 the rating and the words', () => {
  it('FS3 dawn and dusk windows; a tide turn and a moonset near dawn make it great', () => {
    const f = { ...calm, tides: [{ at: '2026-10-27T14:30:00.000Z', kind: 'H' as const, heightFt: 4.1 }], moon: { ...NONE, set: '2026-10-27T15:40:00.000Z' } };
    const [dawn, dusk] = windowsAt(spot('oceanside-pier'), f);
    expect(dawn).toMatchObject({ from: '2026-10-27T13:20:00.000Z', to: '2026-10-27T15:20:00.000Z', rating: 3 });
    expect(dawn.why.map((y) => y.what)).toEqual(['dawn', 'high', 'moonset']);
    expect(dusk).toMatchObject({ rating: 1, why: [{ what: 'dusk' }] });
  });
  it('FS4 a lake counts a new or full moon instead of a tide; wind or big surf take one off, never below 1', () => {
    expect(windowsAt(spot('guajome-lake'), { ...calm, phase: 'full' })[0]).toMatchObject({ rating: 2, why: [{ what: 'dawn' }, { what: 'full' }] });
    expect(windowsAt(spot('guajome-lake'), { ...calm, phase: 'full', windMph: 18 })[0].rating).toBe(1);
    expect(windowsAt(spot('oceanside-pier'), { ...calm, waveFt: 7 })[0]).toMatchObject({ rating: 1, why: [{ what: 'dawn' }, { what: 'surf' }] });
    expect(windowsAt(spot('guajome-lake'), { ...calm, waveFt: 7 })[0].why).toEqual([{ what: 'dawn' }]); // no surf on a lake
  });
  it('FS4b the lake bonus: a new or full moon that day, the day before or the day after', () => {
    const oct = moonPhasesBetween('2026-10-01', '2026-10-31', TZ); // 🌕 10-25 in Los Angeles; 🌑 10-10, quarters between
    expect(['2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27'].map((d) => phaseNear(oct, d))).toEqual([null, 'full', 'full', 'full', null]);
    const q = oct.find((p) => p.emoji === '🌓')!;
    expect(phaseNear(oct, q.date)).toBeNull(); // a quarter is no bonus
  });
  it('FS5 best at sea and best at a lake, ties to the nearer; the text and the ping', () => {
    const f = { ...calm, tides: [{ at: '2026-10-27T14:30:00.000Z', kind: 'H' as const, heightFt: 4.1 }], moon: { ...NONE, set: '2026-10-27T15:40:00.000Z' } };
    const best = bestWindows(spotsWithin(HOME, 15), (s) => ({ ...f, tides: s.station ? f.tides : [] }));
    expect(best.map((w) => [w.spot.id, w.rating])).toEqual([['oceanside-pier', 3], ['guajome-lake', 2]]);
    expect(fishingText(best[0], TZ)).toBe('🎣🎣🎣 6:20am–8:20am Oceanside Pier · dawn, high tide 7:30am, moonset');
    expect(fishingText(best[0], TZ, true)).toBe('🎣🎣🎣 06:20–08:20 Oceanside Pier · dawn, high tide 07:30, moonset');
    expect(fishingPing({ date: '2026-10-27', windows: best, events: [{ emoji: '🐟', title: 'Trout planted this week: Cuyamaca Lake', url: null }] }, TZ))
      .toBe('Tomorrow 6:20am–8:20am Oceanside Pier · dawn, high tide 7:30am, moonset\nTomorrow: 🐟 Trout planted this week: Cuyamaca Lake');
    expect(fishingPing({ date: '2026-10-27', windows: [best[1]], events: [] }, TZ)).toBeNull();
  });
});

describe('FS6 the coast answers', () => {
  it('reads NOAA turns, waves in feet and wind; refuses anything else', () => {
    expect(tidesUrl('https://t.test', '9410230', '2026-10-26', '2026-11-03')).toContain('station=9410230&datum=MLLW&units=english&time_zone=gmt&format=json&begin_date=20261026&end_date=20261103');
    expect(parseTides({ predictions: [{ t: '2026-10-27 05:27', v: '4.128', type: 'H' }] })).toEqual([{ at: '2026-10-27T05:27:00.000Z', kind: 'H', heightFt: 4.1 }]);
    expect(parseTides({ error: { message: 'No Predictions data was found.' } })).toBeNull();
    expect(parseTides({ predictions: [{ t: '2026-10-27 05:27', v: 'x', type: 'H' }] })).toBeNull();
    expect(parseWaves({ daily: { time: ['2026-10-27', '2026-10-28'], wave_height_max: [0.94, null] } })).toEqual(new Map([['2026-10-27', 3.1], ['2026-10-28', null]]));
    expect(parseWind({ daily: { time: ['2026-10-27'], wind_speed_10m_max: [15.5] } })!.get('2026-10-27')).toBe(15.5);
    expect(parseWind({ daily: { time: ['2026-10-27'], wind_speed_10m_max: [] } })).toBeNull();
  });
});

describe('FE1–FE3 the fish events', () => {
  it('FE1 CDFW plants: one row a plant, on its week start, with its place', () => {
    const rows = parsePlants({ type: 'FeatureCollection', features: [
      { properties: { OBJECTID: 1945, WaterName: 'Cuyamaca Lake', WeekOfPlantStart: '2026-10-25', FishType: 'Trout', Lat: 32.99032, Lon: -116.569296 } },
    ] });
    expect(rows).toEqual([{ id: 'plant:1945', date: '2026-10-25', title: 'Trout planted this week: Cuyamaca Lake', lat: 32.99032, lon: -116.569296, url: null }]);
    expect(parsePlants({ error: {} })).toBeNull();
    expect(parsePlants({ features: [{ properties: { WaterName: 'X', WeekOfPlantStart: '10/25/2026' } }] })).toBeNull();
  });
  it('FE2 parks iCal: folded lines, only fishing in the SUMMARY, dated in the household zone', () => {
    const ics = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:TKF/1', 'DTSTART:20261108T020000Z', 'SUMMARY: Kids Fishing', '  Derby at Lindo Lake', 'URL:https://tockify.com/x/1', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:TKF/2', 'DTSTART:20260926T150000Z', 'SUMMARY: Yoga at PQ', 'DESCRIPTION:bring a fish snack', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    expect(parseParksIcal(ics, TZ)).toEqual([{ id: 'parks:TKF/1', date: '2026-11-07', title: 'Kids Fishing Derby at Lindo Lake', lat: null, lon: null, url: 'https://tockify.com/x/1' }]);
    expect(parseParksIcal('<html>', TZ)).toBeNull();
  });
  it('FE3 Free Fishing Days', () => {
    expect(freeDaysBetween('2026-07-01', '2026-09-30').map((d) => d.date)).toEqual(['2026-07-04', '2026-09-05']);
    expect(freeDaysBetween('2026-10-01', '2026-10-31')).toEqual([]);
  });
});
