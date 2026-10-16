// RT-M (SPEC §4.2zy) — 0052 adds events.remind_random_from / remind_random_to: events written before keep a plain
// reminder (both NULL). Runs on MIGRATION_DB, which no setup file migrates.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('RT-M events survive 0052 with no Random time', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0052'));
  expect(at).toBeGreaterThan(0);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  await db.prepare(`INSERT INTO members (id, email, display_name, color, role, password_hash, created_at) VALUES ('mem_a', 'a@x', 'A', '#123456', 'owner', 'x', '2026-10-16T04:00:00.000Z')`).run();
  await db.prepare(`INSERT INTO events (id, title, start_date, start_time, end_date, remind_offset_min, remind_channels, created_by, created_at, updated_at)
    VALUES ('evt_1', 'Car repair', '2026-10-17', '09:00', '2026-10-17', 0, '["push"]', 'mem_a', '2026-10-16T04:00:00.000Z', '2026-10-16T04:00:00.000Z')`).run();
  const before = (await db.prepare('SELECT * FROM events').all<any>()).results;
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));
  expect((await db.prepare('SELECT * FROM events').all()).results).toEqual(before.map((e) => ({ ...e, remind_random_from: null, remind_random_to: null })));
  expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
});
