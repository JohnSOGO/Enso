// ON-M (SPEC §4.2u) — 0022 adds deliveries.title: rows written before it survive unchanged with title NULL,
// and foreign keys hold. Runs on MIGRATION_DB, which no setup file migrates.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('ON-M earlier rows survive 0022; deliveries gains a NULL title', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0022'));
  expect(at).toBe(21);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  const t = '2026-10-04T00:00:00.000Z';
  await db.batch([
    db.prepare(`INSERT INTO members (id, email, display_name, color, role, password_hash, created_at)
                VALUES ('mem_1', 'a@example.com', 'A', '#FF6B35', 'owner', 'x', ?)`).bind(t),
    db.prepare(`INSERT INTO deliveries (id, fire_id, alert_number, channel, member_id, message, status, created_at, updated_at)
                VALUES ('dlv_1', NULL, 1, 'house', NULL, 'A says: hi', 'sent', ?, ?)`).bind(t, t),
    db.prepare(`INSERT INTO deliveries (id, fire_id, alert_number, channel, member_id, message, status, detail, created_at, updated_at)
                VALUES ('dlv_2', NULL, 1, 'push', 'mem_1', 'A says: hi', 'failed', 'no_subscription', ?, ?)`).bind(t, t),
  ]);
  const tables = ['members', 'deliveries', 'settings'];
  const snapshot = async () => Promise.all(tables.map(async (table) => (await db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results));
  const before = await snapshot();

  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));

  const after = await snapshot();
  const d = tables.indexOf('deliveries');
  expect(after.filter((_, i) => i !== d)).toEqual(before.filter((_, i) => i !== d));
  expect(after[d]).toEqual(before[d].map((r) => ({ ...r, title: null })));
  const columns = (await db.prepare('PRAGMA table_info(deliveries)').all<{ name: string }>()).results.map((c) => c.name);
  expect(columns).toContain('title');
  expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
});
