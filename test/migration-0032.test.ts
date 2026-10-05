// MS-M (SPEC §4.2ze) — 0032 adds messes, mess_denials and deliveries.mess_id: rows written before it survive
// unchanged with mess_id NULL, and foreign keys hold. Runs on MIGRATION_DB, which no setup file migrates.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('MS-M earlier rows survive 0032; deliveries gain mess_id NULL; the new tables start empty', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0032'));
  expect(at).toBeGreaterThan(0);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  const t = '2026-10-05T00:00:00.000Z';
  await db.batch([
    db.prepare(`INSERT INTO members (id, email, display_name, color, role, password_hash, created_at)
                VALUES ('mem_1', 'a@example.com', 'A', '#FF6B35', 'owner', 'x', ?)`).bind(t),
    db.prepare(`INSERT INTO deliveries (id, fire_id, alert_number, channel, member_id, message, title, status, created_at, updated_at)
                VALUES ('dlv_1', NULL, 1, 'push', 'mem_1', 'hi', '🤖 Claude', 'sent', ?, ?)`).bind(t, t),
  ]);
  const tables = ['members', 'chores', 'settings'];
  const snapshot = async () => Promise.all(tables.map(async (table) => (await db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results));
  const before = await snapshot();
  const delivery = await db.prepare(`SELECT * FROM deliveries WHERE id = 'dlv_1'`).first();

  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));

  expect(await snapshot()).toEqual(before);
  expect(await db.prepare(`SELECT * FROM deliveries WHERE id = 'dlv_1'`).first()).toEqual({ ...delivery, mess_id: null });
  for (const table of ['messes', 'mess_denials']) {
    expect((await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())!.n).toBe(0);
  }
  await db.prepare(`INSERT INTO messes (id, reported_by, created_at) VALUES ('mes_1', 'mem_1', ?)`).bind(t).run();
  expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
});
