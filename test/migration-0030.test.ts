// RL-M (SPEC §4.2zc) — 0030 adds recipes.link: rows written before it survive unchanged with link NULL, and
// uq_recipe_link refuses a second live recipe per link. Runs on MIGRATION_DB, which no setup file migrates.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('RL-M earlier rows survive 0030; one live recipe per link', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0030'));
  expect(at).toBeGreaterThan(0);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  const t = '2026-10-05T00:00:00.000Z';
  const recipe = (id: string) => db.prepare(
    `INSERT INTO recipes (id, title, video_id, ingredients, steps, found, source, created_by, created_at, updated_at)
     VALUES (?, 'Soup', NULL, '[]', '[]', 0, '["typed"]', 'mem_1', ?, ?)`).bind(id, t, t);
  await db.batch([
    db.prepare(`INSERT INTO members (id, email, display_name, color, role, password_hash, created_at)
                VALUES ('mem_1', 'a@example.com', 'A', '#FF6B35', 'owner', 'x', ?)`).bind(t),
    recipe('rcp_1'),
  ]);
  const snapshot = async () => (await db.prepare('SELECT id, title, video_id, source FROM recipes ORDER BY rowid').all()).results;
  const before = await snapshot();

  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));

  expect(await snapshot()).toEqual(before);
  expect((await db.prepare(`SELECT link FROM recipes WHERE id = 'rcp_1'`).first<{ link: string | null }>())!.link).toBeNull();
  const link = 'https://www.facebook.com/reel/1/';
  await recipe('rcp_2').run();
  await db.prepare(`UPDATE recipes SET link = ? WHERE id = 'rcp_2'`).bind(link).run();
  await recipe('rcp_3').run();
  await expect(db.prepare(`UPDATE recipes SET link = ? WHERE id = 'rcp_3'`).bind(link).run()).rejects.toThrow(/UNIQUE/);
  await db.prepare(`UPDATE recipes SET deleted_at = ? WHERE id = 'rcp_2'`).bind(t).run();
  await db.prepare(`UPDATE recipes SET link = ? WHERE id = 'rcp_3'`).bind(link).run();
  expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
});
