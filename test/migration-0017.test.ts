// RC-M (SPEC §4.2p) — 0017 adds recipes and recipe_reads; rows written before it survive, and
// uq_recipe_video allows one live recipe per video. Runs on MIGRATION_DB, which no setup file migrates.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('RC-M earlier rows survive 0017; one live recipe per video; typed recipes and deleted ones never clash', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0017'));
  expect(at).toBe(16);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  const t = '2026-10-03T00:00:00.000Z';
  await db.batch([
    db.prepare(`INSERT INTO members (id, email, display_name, color, role, password_hash, created_at)
                VALUES ('mem_1', 'a@example.com', 'A', '#FF6B35', 'owner', 'x', ?)`).bind(t),
    db.prepare(`INSERT INTO things (id, title, created_by, created_at, updated_at) VALUES ('thg_1', 'Fall fair', 'mem_1', ?, ?)`).bind(t, t),
    db.prepare(`INSERT INTO list_items (id, list_id, text, text_key, created_by, created_at, updated_at)
                VALUES ('itm_1', 'lst_shopping', 'Milk', 'milk', 'mem_1', ?, ?)`).bind(t, t),
    db.prepare(`INSERT INTO photo_reads (at, member_id) VALUES (?, 'mem_1')`).bind(t),
  ]);
  const snapshot = async () => Promise.all(['members', 'things', 'lists', 'list_items', 'photo_reads', 'settings']
    .map(async (table) => (await db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results));
  const before = await snapshot();

  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));

  expect(await snapshot()).toEqual(before);
  expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);

  const recipe = (id: string, videoId: string | null, deletedAt: string | null = null) => db.prepare(
    `INSERT INTO recipes (id, title, video_id, ingredients, steps, found, source, created_by, created_at, updated_at, deleted_at)
     VALUES (?, 'Soup', ?, '[]', '[]', 0, '[]', 'mem_1', ?, ?, ?)`).bind(id, videoId, t, t, deletedAt);
  await recipe('rcp_old', 'dQw4w9WgXcQ', t).run(); // a deleted recipe for the video
  await recipe('rcp_1', 'dQw4w9WgXcQ').run(); // does not block a live one
  await expect(recipe('rcp_2', 'dQw4w9WgXcQ').run()).rejects.toThrow(/UNIQUE/);
  await recipe('rcp_t1', null).run(); // typed recipes never clash
  await recipe('rcp_t2', null).run();
  await expect(db.prepare(`UPDATE recipes SET found = 2 WHERE id = 'rcp_1'`).run()).rejects.toThrow(/CHECK/);
  await db.prepare(`INSERT INTO recipe_reads (at, member_id) VALUES (?, 'mem_1')`).bind(t).run();
  expect(await db.prepare('SELECT COUNT(*) AS n FROM recipes').first()).toEqual({ n: 4 });
});
