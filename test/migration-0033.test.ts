// TS-M (SPEC §4.2zf) — 0033 adds timers.announce_start and announced_on: earlier timers survive unchanged with
// announce_start 0 and announced_on NULL. Runs on MIGRATION_DB, which no setup file migrates.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('TS-M earlier timers survive 0033 with announce_start 0 and announced_on NULL', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0033'));
  expect(at).toBeGreaterThan(0);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  const t = '2026-10-08T00:00:00.000Z';
  await db.batch([
    db.prepare(`INSERT INTO members (id, email, display_name, color, role, password_hash, created_at)
                VALUES ('mem_1', 'a@example.com', 'A', '#FF6B35', 'owner', 'x', ?)`).bind(t),
    db.prepare(`INSERT INTO timers (id, title, interval_min, channels, created_by, created_at, updated_at, active_from, active_to)
                VALUES ('tmr_1', 'Dog', 60, '["push"]', 'mem_1', ?, ?, '08:00', '21:00')`).bind(t, t),
  ]);
  const before = await db.prepare(`SELECT * FROM timers WHERE id = 'tmr_1'`).first();

  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));

  expect(await db.prepare(`SELECT * FROM timers WHERE id = 'tmr_1'`).first()).toEqual({ ...before, announce_start: 0, announced_on: null });
  expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
});
