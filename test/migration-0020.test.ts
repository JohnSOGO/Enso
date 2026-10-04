// CJ-M (SPEC §4.2s) — 0020 adds the captions-from-home job columns; rows written before it survive, every existing
// recipe has no job (NULLs, attempts 0), the CHECK refuses another value, and the partial index exists. Runs on
// MIGRATION_DB, which no setup file migrates.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('CJ-M earlier rows survive 0020; the job columns are empty; the CHECK and the index hold', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0020'));
  expect(at).toBe(19);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  const t = '2026-10-04T00:00:00.000Z';
  await db.batch([
    db.prepare(`INSERT INTO members (id, email, display_name, color, role, password_hash, created_at)
                VALUES ('mem_1', 'a@example.com', 'A', '#FF6B35', 'owner', 'x', ?)`).bind(t),
    db.prepare(`INSERT INTO list_items (id, list_id, text, text_key, created_by, created_at, updated_at)
                VALUES ('itm_1', 'lst_shopping', 'Milk', 'milk', 'mem_1', ?, ?)`).bind(t, t),
    db.prepare(`INSERT INTO recipes (id, title, video_id, ingredients, steps, found, source, captions_error, comments_error, created_by, created_at, updated_at)
                VALUES ('rcp_1', 'Soup', 'dQw4w9WgXcQ', '["1 onion"]', '[]', 1, '["description"]', 'blocked', 'quota', 'mem_1', ?, ?)`).bind(t, t),
    db.prepare(`INSERT INTO recipes (id, title, ingredients, steps, found, source, created_by, created_at, updated_at)
                VALUES ('rcp_2', 'Bread', '[]', '["Bake"]', 1, '["typed"]', 'mem_1', ?, ?)`).bind(t, t),
    db.prepare(`INSERT INTO recipe_reads (at, member_id) VALUES (?, 'mem_1')`).bind(t),
    db.prepare(`INSERT INTO recipe_emojis (recipe_id, member_id, emoji, updated_at) VALUES ('rcp_1', 'mem_1', '🌶', ?)`).bind(t),
  ]);
  const tables = ['members', 'lists', 'list_items', 'recipes', 'recipe_reads', 'recipe_emojis', 'settings'];
  const snapshot = async () => Promise.all(tables.map(async (table) => (await db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results));
  const before = await snapshot();

  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));

  const after = await snapshot();
  const recipesAt = tables.indexOf('recipes');
  expect(after.filter((_, i) => i !== recipesAt)).toEqual(before.filter((_, i) => i !== recipesAt));
  expect(after[recipesAt]).toEqual(before[recipesAt].map((r) => ({
    ...r, captions_job: null, captions_queued_at: null, captions_claimed_at: null, captions_attempts: 0,
  })));
  expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);

  await db.prepare(`UPDATE recipes SET captions_job = 'queued', captions_queued_at = ? WHERE id = 'rcp_1'`).bind(t).run();
  await db.prepare(`UPDATE recipes SET captions_job = 'claimed' WHERE id = 'rcp_1'`).run();
  await expect(db.prepare(`UPDATE recipes SET captions_job = 'done' WHERE id = 'rcp_1'`).run()).rejects.toThrow(/CHECK/);
  expect(await db.prepare(`SELECT captions_job FROM recipes WHERE id = 'rcp_1'`).first()).toEqual({ captions_job: 'claimed' });

  const index = await db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_recipes_captions_job'`).first<{ sql: string }>();
  expect(index?.sql).toMatch(/ON recipes\s*\(\s*captions_job\s*\)\s*WHERE captions_job IS NOT NULL/);
});
