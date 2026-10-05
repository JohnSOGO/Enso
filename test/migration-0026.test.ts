// W-M (SPEC §4.2y) — 0026 adds `shows`: rows written before it survive unchanged, and foreign keys hold. Runs on
// MIGRATION_DB, which no setup file migrates.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('W-M earlier rows survive 0026; shows exists, empty', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0026'));
  expect(at).toBeGreaterThan(0);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  const t = '2026-10-05T00:00:00.000Z';
  await db.batch([
    db.prepare(`INSERT INTO members (id, email, display_name, color, role, password_hash, created_at)
                VALUES ('mem_1', 'a@example.com', 'A', '#FF6B35', 'owner', 'x', ?)`).bind(t),
    db.prepare(`INSERT INTO things (id, title, created_by, created_at, updated_at) VALUES ('thg_1', 'Fair', 'mem_1', ?, ?)`).bind(t, t),
  ]);
  const tables = ['members', 'things', 'settings', 'deliveries'];
  const snapshot = async () => Promise.all(tables.map(async (table) => (await db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results));
  const before = await snapshot();

  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));

  expect(await snapshot()).toEqual(before);
  expect(await db.prepare('SELECT COUNT(*) AS n FROM shows').first()).toEqual({ n: 0 });
  expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
});
