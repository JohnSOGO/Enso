// SPEC §7.1 HM1–HM4 — the calendar header's month (frontend/src/header-month.ts).
// Loaded at run time like test/day-lines.test.ts: the Worker typecheck does not cover the PWA.
import { describe, expect, it } from 'vitest';

const HM = '../frontend/src/header-month.ts';
const { headerMonth } = (await import(/* @vite-ignore */ HM)) as { headerMonth: (first: string, days: number, today: string) => string };

describe('calendar header month (§7.1)', () => {
  it('HM1 Nov 7 with Oct 25 – Nov 21 on screen names November, not the top row\'s October', () => {
    expect(headerMonth('2026-10-25', 28, '2026-11-07')).toBe('2026-11');
  });
  it("HM4 today on screen names today's month even when another month fills more of it", () => {
    expect(headerMonth('2026-11-15', 63, '2026-11-28')).toBe('2026-11'); // phone: 9 rows, mostly December
    expect(headerMonth('2025-10-26', 28, '2025-11-01')).toBe('2025-11'); // a Saturday 1st in an October-heavy row
  });
  it('HM2 scrolled away from today, a tie goes to the earlier month', () => {
    expect(headerMonth('2026-09-27', 8, '2026-06-01')).toBe('2026-09'); // Sep 27–30 (4) vs Oct 1–4 (4)
  });
  it('HM3 crosses the year and handles a single row', () => {
    expect(headerMonth('2026-12-27', 35, '2026-06-01')).toBe('2027-01');
    expect(headerMonth('2026-12-27', 7, '2026-06-01')).toBe('2026-12'); // Dec 27–31 (5) vs Jan 1–2 (2)
  });
});
