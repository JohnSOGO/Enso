// SPEC §7.14 FA1–FA5, §7.14b FA6 — good fishing times through the Worker: the settings on /me, the once-a-day coast
// refresh against fakes (https://tides.test, https://marine.test, https://weather.test; any other host fails the
// test), /calendar's fishing days, the fish events refresh, and the evening-before ping.
import { env } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Client, owner } from './helpers';
import { coastTick } from '../src/worker/coast-days';
import { fishEventsTick } from '../src/worker/fish-events-rows';
import { fishingPingTick } from '../src/worker/fishing-pings';
import { opsPingsSince } from '../src/worker/deliveries';
import type { Env } from '../src/worker/env';

const days = (from: string, n: number) => Array.from({ length: n }, (_, i) => {
  const d = new Date(`${from}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10);
});
const fakeEnv = (): Env => ({
  ...(env as unknown as Env), TIDES_URL: 'https://tides.test', MARINE_URL: 'https://marine.test', WEATHER_URL: 'https://weather.test',
  FISH_PLANTS_URL: 'https://plants.test/q', PARKS_ICAL_URL: 'https://parks.test/ics',
});
const NOW = '2026-10-27T19:00:00.000Z'; // noon in Oceanside
const ICS = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:TKF/9', 'DTSTART:20261028T160000Z', 'SUMMARY: Kids Fishing Derby', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');

let A: Client;
const asked: URL[] = [];
const answers: Record<string, () => Response> = {};
beforeAll(async () => { A = await owner(); });
beforeEach(() => {
  asked.length = 0;
  Object.assign(answers, {
    'tides.test': () => Response.json({ predictions: [
      { t: '2026-10-27 05:27', v: '4.128', type: 'H' }, { t: '2026-10-27 14:30', v: '1.665', type: 'L' }, { t: '2026-10-28 01:00', v: '5.0', type: 'H' }] }),
    'marine.test': () => Response.json({ daily: { time: days('2026-10-27', 7), wave_height_max: [0.94, 0.92, 0.88, 0.96, 0.98, 0.98, 1.16] } }),
    'weather.test': () => Response.json({ daily: { time: days('2026-10-27', 7), wind_speed_10m_max: [8.6, 9.6, 9.2, 9.4, 9.4, 15.5, 7.8] } }),
    'plants.test': () => Response.json({ type: 'FeatureCollection', features: [
      { properties: { OBJECTID: 1945, WaterName: 'Cuyamaca Lake', WeekOfPlantStart: '2026-10-25', FishType: 'Trout', Lat: 32.99032, Lon: -116.569296 } }] }),
    'parks.test': () => new Response(ICS, { headers: { 'content-type': 'text/calendar' } }),
  });
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(new Request(input, init).url);
    if (!answers[url.hostname]) throw new Error(`a test tried to reach ${url.host}`);
    asked.push(url);
    return answers[url.hostname]();
  });
});
afterEach(() => vi.restoreAllMocks());

describe('FA1 the settings', () => {
  it('🎣 is off by default, How far will we go is 30 min, the ping off; each saves and is checked', async () => {
    expect((await A.get('/me')).json).toMatchObject({ showFishing: 0, fishingRange: 30, fishingAlert: false });
    expect((await A.patch('/me', { fishingRange: 50 })).status).toBe(400);
    expect((await A.patch('/me', { fishingAlert: 'yes' })).status).toBe(400);
    expect((await A.patch('/me', { showFishing: true, fishingRange: 120, fishingAlert: true })).json)
      .toMatchObject({ showFishing: 1, fishingRange: 120, fishingAlert: true });
    expect((await A.get('/settings')).json.place).toEqual({ lat: 33.2, lon: -117.29 });
  });
});

describe('FA2–FA4 the coast refresh and /calendar', () => {
  it('FA4 nothing without TIDES_URL, and /calendar fishing is empty', async () => {
    await coastTick(env as unknown as Env, NOW);
    expect(asked).toHaveLength(0);
    expect((await A.get('/calendar?from=2026-10-27&to=2026-10-27')).json.fishing).toEqual([]);
  });

  it('FA2 once a day: both tide stations, the waves off Oceanside, the wind at home', async () => {
    await coastTick(fakeEnv(), NOW);
    await coastTick(fakeEnv(), '2026-10-27T19:01:00.000Z');
    expect(asked.map((u) => `${u.hostname} ${u.searchParams.get('station') ?? u.pathname}`)).toEqual([
      'tides.test 9410230', 'tides.test 9410170', 'marine.test /v1/marine', 'weather.test /v1/forecast']);
    expect(asked[0].searchParams.get('begin_date')).toBe('20261026');
    expect(asked[0].searchParams.get('end_date')).toBe('20261103');
    expect(asked[3].searchParams.get('wind_speed_unit')).toBe('mph');
  });

  it('FA3 /calendar: the best at sea and at a lake in reach, each day the coast data covers', async () => {
    const f = (await A.get('/calendar?from=2026-10-20&to=2026-11-10')).json.fishing;
    expect(f.map((d: any) => d.date)).toEqual(days('2026-10-27', 7));
    const oct27 = f[0].windows;
    expect(oct27.map((w: any) => w.spot.kind).sort()).toEqual(['lake', 'ocean']);
    const sea = oct27.find((w: any) => w.spot.kind === 'ocean');
    expect(sea.spot).toMatchObject({ id: 'oceanside-pier', minutes: 10 });
    // Dusk beats dawn: the 6pm high and the 7pm moonrise are both in it (dawn has only its low tide).
    expect(sea).toMatchObject({ rating: 3, why: [{ what: 'dusk' }, { what: 'high', at: '2026-10-28T01:00:00.000Z' }, { what: 'moonrise' }] });
    expect(f[5].windows.every((w: any) => w.why.some((y: any) => y.what === 'windy'))).toBe(true); // 15.5 mph on Nov 1
  });
});

describe('FA5–FA6 fish events and the evening-before ping', () => {
  it('FA6 plants by range, parks events anywhere, Free Fishing Days for all', async () => {
    await fishEventsTick(fakeEnv(), NOW);
    expect(asked.map((u) => u.hostname)).toEqual(['plants.test', 'parks.test']);
    const ev = async () => (await A.get('/calendar?from=2026-10-25&to=2026-10-28')).json.fishing.flatMap((d: any) => d.events.map((e: any) => `${d.date} ${e.title}`));
    expect(await ev()).toEqual(['2026-10-25 Trout planted this week: Cuyamaca Lake', '2026-10-28 Kids Fishing Derby']);
    await A.patch('/me', { fishingRange: 30 });
    expect(await ev()).toEqual(['2026-10-28 Kids Fishing Derby']); // Cuyamaca is 90 min away
    expect((await A.get('/calendar?from=2026-07-04&to=2026-07-04')).json.fishing[0].events[0].title).toBe('Free Fishing Day: no license needed');
  });

  it('FA5 from 7pm, one phone push for tomorrow, never a founder ping', async () => {
    await A.patch('/me', { fishingAlert: true });
    const pings = async () => (await env.DB.prepare(`SELECT channel, title, message, fishing_on FROM deliveries WHERE fishing_on IS NOT NULL`).all()).results;
    await fishingPingTick(env as unknown as Env, '2026-10-28T01:59:00.000Z'); // 6:59pm on the 27th
    expect(await pings()).toEqual([]);
    await fishingPingTick(env as unknown as Env, '2026-10-28T02:00:00.000Z');
    await fishingPingTick(env as unknown as Env, '2026-10-28T02:30:00.000Z');
    const got = await pings();
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ channel: 'push', title: '🎣 Good fishing', fishing_on: '2026-10-28' });
    expect(got[0].message).toContain('Tomorrow: 🐟 Kids Fishing Derby');
    expect(await opsPingsSince(env.DB, '2026-10-28T00:00:00.000Z')).toBe(0);
  });
});
