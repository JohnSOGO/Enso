// DL-M (SPEC §4.2zw) — 0050 adds lists.daily / ping_owners, list_items.time and deliveries.list_item_id: rows written
// before come through with 0 / 0 / NULL / NULL. Runs on MIGRATION_DB, which no setup file migrates.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('DL-M lists, items and deliveries survive 0050', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0050'));
  expect(at).toBeGreaterThan(0);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  const t = '2026-10-13T00:00:00.000Z';
  await db.batch([
    db.prepare(`INSERT INTO members (id, email, display_name, color, role, password_hash, created_at)
                VALUES ('mem_1', 'a@example.com', 'A', '#FF6B35', 'owner', 'x', ?)`).bind(t),
    db.prepare(`INSERT INTO lists (id, name, name_key, created_by, created_at, updated_at)
                VALUES ('lst_1', 'Reminders', 'reminders', 'mem_1', ?, ?)`).bind(t, t),
    db.prepare(`INSERT INTO list_items (id, list_id, text, text_key, created_by, created_at, updated_at)
                VALUES ('itm_1', 'lst_1', 'Meds', 'meds', 'mem_1', ?, ?)`).bind(t, t),
    db.prepare(`INSERT INTO deliveries (id, alert_number, channel, member_id, message, status, created_at, updated_at)
                VALUES ('dlv_1', 1, 'push', 'mem_1', 'Hi', 'sent', ?, ?)`).bind(t, t),
  ]);
  const tables = ['lists', 'list_items', 'deliveries'] as const;
  const added = { lists: { daily: 0, ping_owners: 0 }, list_items: { time: null }, deliveries: { list_item_id: null } };
  const snapshot = async () => Promise.all(tables.map(async (table) => (await db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all<any>()).results));
  const before = await snapshot();
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));
  const after = await snapshot();
  tables.forEach((table, k) => expect(after[k]).toEqual(before[k].map((r) => ({ ...r, ...added[table] }))));
  await expect(db.prepare(`UPDATE lists SET daily = 2`).run()).rejects.toThrow();
  expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
});
