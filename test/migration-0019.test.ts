// CM-M (SPEC §4.2r) — 0019 adds recipes.comments_error; rows written before it survive, and every existing
// recipe has it NULL. Runs on MIGRATION_DB, which no setup file migrates.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('CM-M earlier rows survive 0019; existing recipes have comments_error NULL', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0019'));
  expect(at).toBe(18);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  const t = '2026-10-04T00:00:00.000Z';
  await db.batch([
    db.prepare(`INSERT INTO members (id, email, display_name, color, role, password_hash, created_at)
                VALUES ('mem_1', 'a@example.com', 'A', '#FF6B35', 'owner', 'x', ?)`).bind(t),
    db.prepare(`INSERT INTO things (id, title, created_by, created_at, updated_at) VALUES ('thg_1', 'Fall fair', 'mem_1', ?, ?)`).bind(t, t),
    db.prepare(`INSERT INTO list_items (id, list_id, text, text_key, created_by, created_at, updated_at)
                VALUES ('itm_1', 'lst_shopping', 'Milk', 'milk', 'mem_1', ?, ?)`).bind(t, t),
    db.prepare(`INSERT INTO recipes (id, title, video_id, ingredients, steps, found, source, captions_error, created_by, created_at, updated_at)
                VALUES ('rcp_1', 'Soup', 'dQw4w9WgXcQ', '["1 onion"]', '[]', 1, '["description"]', 'blocked', 'mem_1', ?, ?)`).bind(t, t),
    db.prepare(`INSERT INTO recipes (id, title, ingredients, steps, found, source, created_by, created_at, updated_at)
                VALUES ('rcp_2', 'Bread', '[]', '["Bake"]', 1, '["typed"]', 'mem_1', ?, ?)`).bind(t, t),
    db.prepare(`INSERT INTO recipe_reads (at, member_id) VALUES (?, 'mem_1')`).bind(t),
    db.prepare(`INSERT INTO recipe_emojis (recipe_id, member_id, emoji, updated_at) VALUES ('rcp_1', 'mem_1', '🌶', ?)`).bind(t),
  ]);
  const tables = ['members', 'things', 'lists', 'list_items', 'recipes', 'recipe_reads', 'recipe_emojis', 'settings'];
  const snapshot = async () => Promise.all(tables.map(async (table) => (await db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results));
  const before = await snapshot();

  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));

  const after = await snapshot();
  const recipesAt = tables.indexOf('recipes');
  // Every table but recipes is unchanged; recipes gains only comments_error, NULL on every existing row.
  expect(after.filter((_, i) => i !== recipesAt)).toEqual(before.filter((_, i) => i !== recipesAt));
  expect(after[recipesAt]).toEqual(before[recipesAt].map((r) => ({ ...r, comments_error: null })));
  expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);

  await db.prepare(`UPDATE recipes SET comments_error = 'quota' WHERE id = 'rcp_1'`).run();
  expect(await db.prepare(`SELECT comments_error FROM recipes WHERE id = 'rcp_1'`).first()).toEqual({ comments_error: 'quota' });
});
