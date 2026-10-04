// RE-M (SPEC §4.2q) — 0018 adds recipe_emojis; rows written before it survive, and the primary key allows
// one emoji per member per recipe. Runs on MIGRATION_DB, which no setup file migrates.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('RE-M earlier rows survive 0018; one emoji per member per recipe', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0018'));
  expect(at).toBe(17);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  const t = '2026-10-03T00:00:00.000Z';
  await db.batch([
    db.prepare(`INSERT INTO members (id, email, display_name, color, role, password_hash, created_at)
                VALUES ('mem_1', 'a@example.com', 'A', '#FF6B35', 'owner', 'x', ?)`).bind(t),
    db.prepare(`INSERT INTO members (id, email, display_name, color, role, password_hash, created_at)
                VALUES ('mem_2', 'b@example.com', 'B', '#10B981', 'member', 'x', ?)`).bind(t),
    db.prepare(`INSERT INTO things (id, title, created_by, created_at, updated_at) VALUES ('thg_1', 'Fall fair', 'mem_1', ?, ?)`).bind(t, t),
    db.prepare(`INSERT INTO list_items (id, list_id, text, text_key, created_by, created_at, updated_at)
                VALUES ('itm_1', 'lst_shopping', 'Milk', 'milk', 'mem_1', ?, ?)`).bind(t, t),
    db.prepare(`INSERT INTO recipes (id, title, video_id, ingredients, steps, found, source, created_by, created_at, updated_at)
                VALUES ('rcp_1', 'Soup', 'dQw4w9WgXcQ', '["1 onion"]', '[]', 1, '["description"]', 'mem_1', ?, ?)`).bind(t, t),
    db.prepare(`INSERT INTO recipe_reads (at, member_id) VALUES (?, 'mem_1')`).bind(t),
  ]);
  const snapshot = async () => Promise.all(['members', 'things', 'lists', 'list_items', 'recipes', 'recipe_reads', 'settings']
    .map(async (table) => (await db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results));
  const before = await snapshot();

  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));

  expect(await snapshot()).toEqual(before);
  expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);

  const emoji = (member: string, e: string) => db.prepare(
    `INSERT INTO recipe_emojis (recipe_id, member_id, emoji, updated_at) VALUES ('rcp_1', ?, ?, ?)`).bind(member, e, t);
  await emoji('mem_1', '🌶').run();
  await emoji('mem_2', '⭐').run(); // another member on the same recipe is fine
  await expect(emoji('mem_1', '⭐').run()).rejects.toThrow(/UNIQUE|PRIMARY/);
  expect((await db.prepare('SELECT member_id, emoji FROM recipe_emojis ORDER BY member_id').all()).results)
    .toEqual([{ member_id: 'mem_1', emoji: '🌶' }, { member_id: 'mem_2', emoji: '⭐' }]);
});
