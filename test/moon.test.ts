// SPEC §7.12 acceptance MN1–MN4.
import { describe, expect, it } from 'vitest';
import { moonPhasesBetween } from '../src/shared/moon';

const asText = (xs: { date: string; emoji: string }[]) => xs.map((x) => `${x.emoji} ${x.date}`);

describe('moon phases', () => {
  it('MN1 October 2025 in UTC', () => {
    expect(asText(moonPhasesBetween('2025-10-01', '2025-10-31', 'UTC'))).toEqual(['🌕 2025-10-07', '🌗 2025-10-13', '🌑 2025-10-21', '🌓 2025-10-29']);
  });

  it('MN2 the full moon of 2026-10-26 04:12 UTC is the evening before in Los Angeles', () => {
    const full = (tz: string) => moonPhasesBetween('2026-10-01', '2026-10-31', tz).find((p) => p.emoji === '🌕')?.date;
    expect(full('UTC')).toBe('2026-10-26');
    expect(full('America/Los_Angeles')).toBe('2026-10-25');
  });

  it('MN3 a year runs new → first quarter → full → last quarter, 48 to 50 of them', () => {
    const year = moonPhasesBetween('2026-01-01', '2026-12-31', 'America/Los_Angeles');
    expect(year.length).toBeGreaterThanOrEqual(48);
    expect(year.length).toBeLessThanOrEqual(50);
    const order = ['🌑', '🌓', '🌕', '🌗'];
    year.forEach((p, i) => { if (i) expect(p.emoji).toBe(order[(order.indexOf(year[i - 1].emoji) + 1) % 4]); });
  });
});

it('MN4 /calendar carries the phases of the range', async () => {
  const { owner } = await import('./helpers');
  const o = await owner();
  const week = await o.get('/calendar?from=2026-10-19&to=2026-10-25');
  expect(week.json.moonPhases).toEqual([{ date: '2026-10-25', name: 'Full moon', emoji: '🌕' }]); // 04:12 UTC on the 26th, household zone Los Angeles
  const quiet = await o.get('/calendar?from=2026-10-27&to=2026-10-30');
  expect(quiet.json.moonPhases).toEqual([]);
});
