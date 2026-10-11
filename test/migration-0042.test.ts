// FH-M (SPEC §4.2zo) — 0042 rebuilds deliveries so channel may be 'funhouse': every row survives unchanged, a
// funhouse row can be written, an unknown channel is still refused. Runs on MIGRATION_DB, which no setup file migrates.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('FH-M deliveries survive 0042 and take the funhouse channel', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0042'));
  expect(at).toBeGreaterThan(0);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  const t = '2026-10-11T18:00:00.000Z';
  await db.prepare(`INSERT INTO members (id, email, display_name, color, role, password_hash, created_at)
    VALUES ('mem_1', 'a@example.com', 'A', '#FF6B35', 'owner', 'x', ?)`).bind(t).run();
  await db.prepare(`INSERT INTO deliveries (id, fire_id, alert_number, channel, member_id, message, title, notice, url, status, detail,
      attempts, created_at, updated_at, dismissed_at)
    VALUES ('dlv_1', NULL, 1, 'push', 'mem_1', 'Sign in?', 'Sign-in', 'login', '/x', 'sent', 'ok', 1, ?, ?, ?)`).bind(t, t, t).run();
  await db.prepare(`INSERT INTO deliveries (id, fire_id, alert_number, channel, member_id, message, status, speakers, created_at, updated_at)
    VALUES ('dlv_2', NULL, 1, 'house', NULL, 'Hello', 'queued', '["sogo"]', ?, ?)`).bind(t, t).run();
  const before = (await db.prepare('SELECT * FROM deliveries ORDER BY id').all()).results;

  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));

  expect((await db.prepare('SELECT * FROM deliveries ORDER BY id').all()).results).toEqual(before);
  await db.prepare(`INSERT INTO deliveries (id, fire_id, alert_number, channel, member_id, message, title, status, created_at, updated_at)
    VALUES ('dlv_3', NULL, 1, 'funhouse', NULL, 'Hi', 'Ensō', 'queued', ?, ?)`).bind(t, t).run();
  await expect(db.prepare(`INSERT INTO deliveries (id, fire_id, alert_number, channel, member_id, message, status, created_at, updated_at)
    VALUES ('dlv_4', NULL, 1, 'bogus', NULL, 'Hi', 'queued', ?, ?)`).bind(t, t).run()).rejects.toThrow();
  const idx = (await db.prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'deliveries' AND sql IS NOT NULL ORDER BY name`)
    .all<{ name: string }>()).results.map((r) => r.name);
  expect(idx).toEqual(['idx_deliveries_member', 'idx_deliveries_mess', 'idx_deliveries_queue']);
});
