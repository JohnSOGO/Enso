// SN-M (SPEC §4.2v) — 0023 adds list_items.photo_key: rows written before it survive unchanged with photo_key NULL,
// and foreign keys hold. Runs on MIGRATION_DB, which no setup file migrates.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('SN-M earlier rows survive 0023; list_items gains a NULL photo_key', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0023'));
  expect(at).toBe(22);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  const t = '2026-10-04T00:00:00.000Z';
  await db.batch([
    db.prepare(`INSERT INTO members (id, email, display_name, color, role, password_hash, created_at)
                VALUES ('mem_1', 'a@example.com', 'A', '#FF6B35', 'owner', 'x', ?)`).bind(t),
    db.prepare(`INSERT INTO list_items (id, list_id, text, text_key, note, assignee_id, created_by, created_at, updated_at)
                VALUES ('itm_1', 'lst_shopping', 'Milk', 'milk', 'two', 'mem_1', 'mem_1', ?, ?)`).bind(t, t),
    db.prepare(`INSERT INTO list_items (id, list_id, text, text_key, created_by, created_at, updated_at, checked_at, checked_by)
                VALUES ('itm_2', 'lst_wishlist', 'Kite', 'kite', 'mem_1', ?, ?, ?, 'mem_1')`).bind(t, t, t),
  ]);
  const tables = ['members', 'lists', 'list_items', 'settings'];
  const snapshot = async () => Promise.all(tables.map(async (table) => (await db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results));
  const before = await snapshot();

  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));

  const after = await snapshot();
  const i = tables.indexOf('list_items');
  expect(after.filter((_, k) => k !== i)).toEqual(before.filter((_, k) => k !== i));
  expect(after[i]).toHaveLength(2);
  expect(after[i]).toEqual(before[i].map((r) => ({ ...r, photo_key: null })));
  const columns = (await db.prepare('PRAGMA table_info(list_items)').all<{ name: string }>()).results.map((c) => c.name);
  expect(columns).toContain('photo_key');
  expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
});
