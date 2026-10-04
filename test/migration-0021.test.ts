// CJ-D (SPEC §4.2t) — 0021 drops 0020's captions-from-home job columns and their index; rows written before it
// survive (a recipe mid-job too, less the four columns), foreign keys hold and recipe_emojis is intact. Runs on
// MIGRATION_DB, which no setup file migrates.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

const JOB_COLUMNS = ['captions_job', 'captions_queued_at', 'captions_claimed_at', 'captions_attempts'];

it('CJ-D earlier rows survive 0021; the job columns and their index are gone', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0021'));
  expect(at).toBe(20);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  const t = '2026-10-04T00:00:00.000Z';
  await db.batch([
    db.prepare(`INSERT INTO members (id, email, display_name, color, role, password_hash, created_at)
                VALUES ('mem_1', 'a@example.com', 'A', '#FF6B35', 'owner', 'x', ?)`).bind(t),
    db.prepare(`INSERT INTO list_items (id, list_id, text, text_key, created_by, created_at, updated_at)
                VALUES ('itm_1', 'lst_shopping', 'Milk', 'milk', 'mem_1', ?, ?)`).bind(t, t),
    db.prepare(`INSERT INTO recipes (id, title, video_id, ingredients, steps, found, source, captions_error, comments_error,
                  captions_job, captions_queued_at, captions_claimed_at, captions_attempts, created_by, created_at, updated_at)
                VALUES ('rcp_1', 'Soup', 'dQw4w9WgXcQ', '["1 onion"]', '[]', 1, '["description"]', 'blocked', 'quota',
                  'claimed', ?, ?, 1, 'mem_1', ?, ?)`).bind(t, t, t, t),
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
  expect(after[recipesAt]).toHaveLength(2);
  expect(after[recipesAt]).toEqual(before[recipesAt].map((r) =>
    Object.fromEntries(Object.entries(r).filter(([k]) => !JOB_COLUMNS.includes(k)))));

  const columns = (await db.prepare('PRAGMA table_info(recipes)').all<{ name: string }>()).results.map((c) => c.name);
  for (const c of JOB_COLUMNS) expect(columns).not.toContain(c);
  expect(columns).toEqual(expect.arrayContaining(['captions_error', 'comments_error', 'source']));
  expect(await db.prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_recipes_captions_job'`).first()).toBeNull();
  expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
  expect((await db.prepare('SELECT recipe_id, member_id, emoji FROM recipe_emojis').all()).results)
    .toEqual([{ recipe_id: 'rcp_1', member_id: 'mem_1', emoji: '🌶' }]);
});
