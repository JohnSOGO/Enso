// MA-M (SPEC §4.2zn) — 0041 adds deliveries.dismissed_at: delivery rows survive unchanged, none hidden.
// Runs on MIGRATION_DB, which no setup file migrates.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('MA-M deliveries survive 0041 with dismissed_at NULL', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0041'));
  expect(at).toBeGreaterThan(0);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  const t = '2026-10-11T18:00:00.000Z';
  await db.prepare(`INSERT INTO members (id, email, display_name, color, role, password_hash, created_at)
    VALUES ('mem_1', 'a@example.com', 'A', '#FF6B35', 'owner', 'x', ?)`).bind(t).run();
  await db.prepare(`INSERT INTO deliveries (id, fire_id, alert_number, channel, member_id, message, title, status, created_at, updated_at)
    VALUES ('dlv_1', NULL, 1, 'push', 'mem_1', 'Build is live', '🏛️ Ozymandias', 'sent', ?, ?)`).bind(t, t).run();
  const before = (await db.prepare('SELECT * FROM deliveries').all()).results;

  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));

  expect((await db.prepare('SELECT * FROM deliveries').all()).results).toEqual(before.map((d) => ({ ...d, dismissed_at: null })));
});
