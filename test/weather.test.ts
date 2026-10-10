// SPEC §7.11 WX1–WX6 — weather on the calendar: the pure rules, the once-a-day refresh against a fake forecast at
// https://weather.test (a fetch to any other host fails the test), and /calendar carrying the days.
import { env } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Client, owner } from './helpers';
import { forecastUrl, parseForecast, weatherDue, weatherOf, weatherText } from '../src/shared/weather';
import { weatherTick } from '../src/worker/weather-days';
import type { Env } from '../src/worker/env';

const TZ = 'America/Los_Angeles';
const days = (from: string, n: number) => Array.from({ length: n }, (_, i) => {
  const d = new Date(`${from}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10);
});
const answer = (from: string, codes = [0, 2, 3, 45, 61, 71, 95]) => ({
  daily: { time: days(from, codes.length), weather_code: codes, temperature_2m_max: codes.map(() => 71.6), temperature_2m_min: codes.map(() => 58.4) },
});

describe('WX1–WX3 the rules', () => {
  it('WX1 weatherOf', () => {
    expect(weatherOf(0)).toEqual({ emoji: '☀️', words: 'Clear' });
    expect([2, 3, 45, 61, 80, 71, 95].map((c) => weatherOf(c)!.emoji)).toEqual(['⛅', '☁️', '🌫️', '🌧️', '🌧️', '🌨️', '⛈️']);
    expect(weatherOf(61)!.words).toBe('Rain');
    expect(weatherOf(42)).toBeNull();
  });

  it('WX2 parseForecast', () => {
    const rows = parseForecast(answer('2026-10-10'))!;
    expect(rows).toHaveLength(7);
    expect(rows[0]).toEqual({ date: '2026-10-10', code: 0, highF: 72, lowF: 58 });
    expect(parseForecast(answer('2026-10-10', [0, 42, 3]))!.map((r) => r.code)).toEqual([0, 3]);
    expect(parseForecast({})).toBeNull();
    expect(parseForecast({ daily: { time: ['2026-10-10'], weather_code: [0, 1], temperature_2m_max: [1], temperature_2m_min: [1] } })).toBeNull();
  });

  it('WX3 weatherDue', () => {
    const now = '2026-10-10T19:00:00.000Z'; // 12:00 local
    expect(weatherDue({ triedAt: null, fetchedAt: null }, now, TZ)).toBe(true);
    expect(weatherDue({ triedAt: '2026-10-10T17:00:00.000Z', fetchedAt: '2026-10-09T08:00:00.000Z' }, now, TZ)).toBe(true);
    expect(weatherDue({ triedAt: '2026-10-10T08:00:00.000Z', fetchedAt: '2026-10-10T08:00:00.000Z' }, now, TZ)).toBe(false);
    expect(weatherDue({ triedAt: '2026-10-10T18:30:00.000Z', fetchedAt: '2026-10-09T08:00:00.000Z' }, now, TZ)).toBe(false);
    expect(weatherDue({ triedAt: '2026-10-10T17:59:00.000Z', fetchedAt: null }, now, TZ)).toBe(true);
  });

  it('the address and the day-sheet words', () => {
    const u = new URL(forecastUrl('https://weather.test/', { lat: 33.2, lon: -117.29 }, TZ));
    expect(u.pathname).toBe('/v1/forecast');
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ latitude: '33.2', longitude: '-117.29', temperature_unit: 'fahrenheit', timezone: TZ, forecast_days: '7' });
    expect(weatherText({ date: '2026-10-10', emoji: '☀️', words: 'Clear', high: 72, low: 58 })).toBe('☀️ Clear · high 72° · low 58°');
  });
});

describe('WX4–WX6 the refresh and /calendar', () => {
  let A: Client;
  const asked: URL[] = [];
  const answers: (() => Response)[] = [];
  const wxEnv = (): Env => ({ ...(env as unknown as Env), WEATHER_URL: 'https://weather.test' });

  beforeAll(async () => { A = await owner(); });
  beforeEach(() => {
    asked.length = 0; answers.length = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(new Request(input, init).url);
      if (url.hostname !== 'weather.test') throw new Error(`a test tried to reach ${url.host}`);
      asked.push(url);
      return answers.shift()!();
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('WX6 off without WEATHER_URL or a place', async () => {
    await weatherTick(env as unknown as Env, '2026-10-10T19:00:00.000Z');
    await env.DB.prepare('UPDATE settings SET latitude = NULL WHERE id = 1').run();
    await weatherTick(wxEnv(), '2026-10-10T19:00:00.000Z');
    await env.DB.prepare('UPDATE settings SET latitude = 33.2 WHERE id = 1').run();
    expect(asked).toHaveLength(0);
    expect((await A.get('/calendar?from=2026-10-04&to=2026-10-17')).json.weather).toEqual([]);
  });

  it('WX4 one refresh a day, and /calendar carries it', async () => {
    answers.push(() => Response.json(answer('2026-10-10')));
    await weatherTick(wxEnv(), '2026-10-10T19:00:00.000Z');
    await weatherTick(wxEnv(), '2026-10-10T19:01:00.000Z');
    expect(asked).toHaveLength(1);
    expect(asked[0].pathname).toBe('/v1/forecast');
    expect(asked[0].searchParams.get('latitude')).toBe('33.2');
    expect(asked[0].searchParams.get('temperature_unit')).toBe('fahrenheit');
    expect(asked[0].searchParams.get('timezone')).toBe(TZ);
    const w = (await A.get('/calendar?from=2026-10-04&to=2026-10-17')).json.weather;
    expect(w).toHaveLength(7);
    expect(w[0]).toEqual({ date: '2026-10-10', emoji: '☀️', words: 'Clear', high: 72, low: 58 });
  });

  it('WX5 a failed refresh keeps the old days and is retried an hour later', async () => {
    answers.push(() => new Response('down', { status: 500 }));
    await weatherTick(wxEnv(), '2026-10-11T07:01:00.000Z'); // 00:01 local on the 11th
    expect(asked).toHaveLength(1);
    expect((await A.get('/calendar?from=2026-10-10&to=2026-10-10')).json.weather).toHaveLength(1);
    await weatherTick(wxEnv(), '2026-10-11T07:30:00.000Z');
    expect(asked).toHaveLength(1);
    answers.push(() => Response.json(answer('2026-10-11')));
    await weatherTick(wxEnv(), '2026-10-11T08:01:00.000Z');
    expect(asked).toHaveLength(2);
    const w = (await A.get('/calendar?from=2026-10-04&to=2026-10-24')).json.weather;
    expect(w.map((d: any) => d.date)).toEqual(days('2026-10-11', 7));
  });
});
