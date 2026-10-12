// CS-M (SPEC §4.2zu) — 0048 adds chores.sun_offset_min: chores written before survive with it NULL. Runs on
// MIGRATION_DB, which no setup file migrates.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('CS-M chores survive 0048 with sun_offset_min NULL', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0048'));
  expect(at).toBeGreaterThan(0);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  const t = '2026-10-12T04:00:00.000Z';
  await db.prepare(`INSERT INTO members (id, email, display_name, color, role, password_hash, created_at) VALUES ('mem_a', 'a@x', 'A', '#123456', 'owner', 'x', ?)`).bind(t).run();
  await db.prepare(
    `INSERT INTO chores (id, title, days, timing, time, people, steps, channels, start_date, created_by, created_at, updated_at)
     VALUES ('chr_1', 'Trash', '["TU"]', 'by', '19:00', '["mem_a"]', '[{"title":"Trash","waitMin":null,"memberId":null}]', '["push"]', '2026-10-12', 'mem_a', ?, ?)`,
  ).bind(t, t).run();
  const before = (await db.prepare('SELECT * FROM chores').all<any>()).results;
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));
  expect((await db.prepare('SELECT * FROM chores').all()).results).toEqual(before.map((c) => ({ ...c, sun_offset_min: null })));
  await expect(db.prepare(`UPDATE chores SET sun_offset_min = 241`).run()).rejects.toThrow();
  expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
});
