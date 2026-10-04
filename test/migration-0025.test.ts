// PL-M (SPEC §4.2x) — 0025 adds login_requests and deliveries.notice / url: rows written before it survive
// unchanged with notice and url NULL, and foreign keys hold. Runs on MIGRATION_DB, which no setup file migrates.
// 0024 belongs to another branch in flight, so 0025 is found by name, not by position.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('PL-M earlier rows survive 0025; deliveries gain NULL notice and url; login_requests exists, empty', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0025'));
  expect(at).toBeGreaterThan(0);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  const t = '2026-10-04T00:00:00.000Z';
  await db.batch([
    db.prepare(`INSERT INTO members (id, email, display_name, color, role, password_hash, created_at)
                VALUES ('mem_1', 'a@example.com', 'A', '#FF6B35', 'owner', 'x', ?)`).bind(t),
    db.prepare(`INSERT INTO sessions (id, member_id, token_hash, created_at, expires_at) VALUES ('ses_1', 'mem_1', 'h', ?, ?)`).bind(t, t),
    db.prepare(`INSERT INTO deliveries (id, fire_id, alert_number, channel, member_id, message, title, status, created_at, updated_at)
                VALUES ('dlv_1', NULL, 1, 'push', 'mem_1', 'ping', '🤖 Claude', 'sent', ?, ?)`).bind(t, t),
    db.prepare(`INSERT INTO deliveries (id, fire_id, alert_number, channel, member_id, message, status, created_at, updated_at)
                VALUES ('dlv_2', NULL, 1, 'house', NULL, 'A says: hi', 'queued', ?, ?)`).bind(t, t),
  ]);
  const tables = ['members', 'sessions', 'push_subscriptions', 'settings'];
  const snapshot = async () => Promise.all(tables.map(async (table) => (await db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results));
  const before = await snapshot();
  const deliveriesBefore = (await db.prepare('SELECT * FROM deliveries ORDER BY id').all()).results;

  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));

  expect(await snapshot()).toEqual(before);
  expect((await db.prepare('SELECT * FROM deliveries ORDER BY id').all()).results)
    .toEqual(deliveriesBefore.map((d) => ({ ...d, notice: null, url: null })));
  expect((await db.prepare('SELECT COUNT(*) AS n FROM login_requests').first())).toEqual({ n: 0 });
  expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
});
