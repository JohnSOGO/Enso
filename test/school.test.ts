// SPEC §7.13 acceptance SC1–SC6 — school days off, an optional built-in calendar item.
import { applyD1Migrations, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { SCHOOL_DAYS, schoolDaysBetween } from '../src/shared/school';
import { owner } from './helpers';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

const asText = (xs: { date: string; emoji: string }[]) => xs.map((x) => `${x.emoji} ${x.date}`);

describe('school days off', () => {
  it('SC1 November 2026', () => {
    const nov = schoolDaysBetween('2026-11-01', '2026-11-30');
    expect(asText(nov)).toEqual(['🏫 2026-11-11', '🕛 2026-11-18', '🕛 2026-11-19',
      '🏫 2026-11-23', '🏫 2026-11-24', '🏫 2026-11-25', '🏫 2026-11-26', '🏫 2026-11-27']);
    expect(nov.slice(3).every((x) => x.name === 'Thanksgiving break — No school')).toBe(true);
  });

  it('SC2 winter break runs every day, then students return', () => {
    const xs = schoolDaysBetween('2026-12-20', '2027-01-07');
    expect(xs).toHaveLength(17);
    expect(xs.slice(0, 16).every((x) => x.emoji === '🏫')).toBe(true);
    expect([xs[0].date, xs[15].date]).toEqual(['2026-12-21', '2027-01-05']);
    expect(xs[16]).toEqual({ date: '2027-01-06', name: 'Students return', emoji: '🎒' });
  });

  it('SC3 the last day of school', () => {
    expect(schoolDaysBetween('2027-06-01', '2027-06-30')).toEqual([{ date: '2027-06-03', name: 'Last day of school — Minimum day', emoji: '🎓' }]);
  });

  it('SC4 the table is in order with no overlaps', () => {
    SCHOOL_DAYS.forEach((r, i) => {
      expect(r.from <= r.to).toBe(true);
      if (i > 0) expect(SCHOOL_DAYS[i - 1].to < r.from).toBe(true);
    });
  });
});

it('SC5 /calendar carries the school days of the range', async () => {
  const o = await owner();
  const week = (await o.get('/calendar?from=2026-11-08&to=2026-11-14')).json;
  expect(week.schoolDays).toEqual([{ date: '2026-11-11', name: 'Veterans Day — No school', emoji: '🏫' }]);
  expect((await o.get('/calendar?from=2026-08-02&to=2026-08-08')).json.schoolDays).toEqual([]);
});

describe('SC6 migration 0064 and PATCH /me { showSchool }', () => {
  it('an existing member gets the switch on', async () => {
    const db = env.MIGRATION_DB;
    const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0064'));
    expect(at).toBeGreaterThan(0);
    await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
    await db.prepare(`INSERT INTO members (id, email, display_name, color, role, password_hash, created_at) VALUES ('mem_s', 's@x', 'S', '#123456', 'owner', 'x', '2026-10-01T04:00:00.000Z')`).run();
    await db.prepare(`INSERT INTO member_prefs (member_id) VALUES ('mem_s')`).run();
    await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));
    expect(await db.prepare(`SELECT show_school FROM member_prefs WHERE member_id = 'mem_s'`).first()).toEqual({ show_school: 1 });
  });

  it('starts on, saves a boolean, refuses anything else', async () => {
    const A = await owner();
    expect((await A.get('/me')).json.showSchool).toBe(1);
    expect((await A.patch('/me', { showSchool: false })).json.showSchool).toBe(0);
    expect((await A.patch('/me', { showSchool: 'no' })).status).toBe(400);
  });
});
