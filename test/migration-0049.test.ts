// CK-M (SPEC §4.2zv) — 0049 adds member_prefs.clock_24h: members written before come through on 12-hour (0). Runs on
// MIGRATION_DB, which no setup file migrates.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('CK-M member prefs survive 0049 on 12-hour', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0049'));
  expect(at).toBeGreaterThan(0);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  await db.prepare(`INSERT INTO members (id, email, display_name, color, role, password_hash, created_at) VALUES ('mem_a', 'a@x', 'A', '#123456', 'owner', 'x', '2026-10-12T04:00:00.000Z')`).run();
  await db.prepare(`INSERT INTO member_prefs (member_id) VALUES ('mem_a')`).run();
  const before = (await db.prepare('SELECT * FROM member_prefs').all<any>()).results;
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));
  expect((await db.prepare('SELECT * FROM member_prefs').all()).results).toEqual(before.map((p) => ({ ...p, clock_24h: 0 })));
  await expect(db.prepare(`UPDATE member_prefs SET clock_24h = 2`).run()).rejects.toThrow();
  expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
});
