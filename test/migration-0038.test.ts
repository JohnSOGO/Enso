// HQ-M (SPEC §4.2zk) — 0038 adds the two quiet columns: the settings row survives unchanged, not quiet.
// Runs on MIGRATION_DB, which no setup file migrates.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('HQ-M the settings row survives 0038 with both quiet columns NULL', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0038'));
  expect(at).toBeGreaterThan(0);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  await db.prepare(`UPDATE settings SET household_name = 'Sogo Dojo' WHERE id = 1`).run();
  const before = await db.prepare('SELECT * FROM settings').first<any>();

  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));

  const after = await db.prepare('SELECT * FROM settings').first<any>();
  expect(after).toEqual({ ...before, house_quiet_until: null, house_quiet_by: null });
  expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
});
