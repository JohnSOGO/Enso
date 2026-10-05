// RP-M (SPEC §4.2zd) — 0031 adds recipes.photo_key: rows written before it survive unchanged with photo_key NULL.
// Runs on MIGRATION_DB, which no setup file migrates.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('RP-M earlier rows survive 0031 with no picture', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0031'));
  expect(at).toBeGreaterThan(0);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  const t = '2026-10-05T00:00:00.000Z';
  await db.batch([
    db.prepare(`INSERT INTO members (id, email, display_name, color, role, password_hash, created_at)
                VALUES ('mem_1', 'a@example.com', 'A', '#FF6B35', 'owner', 'x', ?)`).bind(t),
    db.prepare(`INSERT INTO recipes (id, title, ingredients, steps, found, source, created_by, created_at, updated_at)
                VALUES ('rcp_1', 'Soup', '[]', '[]', 0, '["typed"]', 'mem_1', ?, ?)`).bind(t, t),
  ]);
  const snapshot = async () => (await db.prepare('SELECT id, title, link, source FROM recipes ORDER BY rowid').all()).results;
  const before = await snapshot();

  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));

  expect(await snapshot()).toEqual(before);
  expect((await db.prepare(`SELECT photo_key FROM recipes WHERE id = 'rcp_1'`).first<{ photo_key: string | null }>())!.photo_key).toBeNull();
  expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
});
