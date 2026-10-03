// L20 (SPEC §4.2f) — 0007 turns the fixed lists into household data; items written under
// 0001–0006 land on the seeded lists with the same assignee. Runs on MIGRATION_DB, which no
// setup file migrates.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';
import { SHOPPING_LIST_ID } from '../src/shared/lists';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('L20 shopping and wish-list items move to the seeded lists with their owner as assignee', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0007'));
  expect(at).toBe(6);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  const t = '2026-10-01T00:00:00.000Z';
  const item = (id: string, list: string, text: string, owner: string | null) =>
    db.prepare(`INSERT INTO list_items (id, list, text, text_key, owner_id, created_by, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 'mem_1', ?, ?)`).bind(id, list, text, text.toLowerCase(), owner, t, t);
  await db.batch([
    db.prepare(`INSERT INTO members (id, email, display_name, color, role, password_hash, created_at)
                VALUES ('mem_1', 'a@example.com', 'A', '#FF6B35', 'owner', 'x', ?)`).bind(t),
    item('itm_milk', 'shopping', 'Milk', null),
    item('itm_fence', 'wishlist', 'Paint the fence', 'mem_1'),
    item('itm_kite', 'wishlist', 'Kite', null),
  ]);

  await applyD1Migrations(db, env.TEST_MIGRATIONS);

  const items = (await db.prepare('SELECT id, list_id, assignee_id FROM list_items ORDER BY id').all()).results;
  expect(items).toEqual([
    { id: 'itm_fence', list_id: 'lst_wishlist', assignee_id: 'mem_1' },
    { id: 'itm_kite', list_id: 'lst_wishlist', assignee_id: null },
    { id: 'itm_milk', list_id: SHOPPING_LIST_ID, assignee_id: null },
  ]);
  const lists = (await db.prepare('SELECT id, name, created_by FROM lists WHERE deleted_at IS NULL ORDER BY id').all()).results;
  expect(lists).toEqual([
    { id: SHOPPING_LIST_ID, name: 'Shopping', created_by: null },
    { id: 'lst_wishlist', name: 'Wish list', created_by: null },
  ]);
  expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
  // The rebuilt table keeps its index: a second item with the same key on the same list is refused.
  await expect(db.prepare(`INSERT INTO list_items (id, list_id, text, text_key, created_by, created_at, updated_at)
                           VALUES ('itm_milk2', ?, 'MILK', 'milk', 'mem_1', ?, ?)`).bind(SHOPPING_LIST_ID, t, t).run()).rejects.toThrow(/UNIQUE/);
});
