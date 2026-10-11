// BT-M2 (SPEC §4.2zr) — 0045 adds earnings.photo_key: earnings written before survive with it NULL. Runs on
// MIGRATION_DB, which no setup file migrates.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('BT-M2 earnings survive 0045 with photo_key NULL', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0045'));
  expect(at).toBeGreaterThan(0);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  const t = '2026-10-11T18:00:00.000Z';
  await db.prepare(`INSERT INTO members (id, email, display_name, color, role, password_hash, created_at) VALUES ('mem_a', 'a@x', 'A', '#123456', 'owner', 'x', ?)`).bind(t).run();
  await db.prepare(`INSERT INTO bounties (id, title, points, created_by, created_at) VALUES ('bty_1', 'Toilet', 3, 'mem_a', ?)`).bind(t).run();
  await db.prepare(`INSERT INTO earnings (id, bounty_id, member_id, points, done_at) VALUES ('ern_1', 'bty_1', 'mem_a', 3, ?)`).bind(t).run();
  const before = (await db.prepare('SELECT * FROM earnings').all<any>()).results;
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));
  expect((await db.prepare('SELECT * FROM earnings').all()).results).toEqual(before.map((e) => ({ ...e, photo_key: null })));
  expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
});
