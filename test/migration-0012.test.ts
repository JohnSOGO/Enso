// AN8 (SPEC §4.2k) — 0012 rebuilds `deliveries` so fire_id may be NULL; every delivery written
// before it survives unchanged. Runs on MIGRATION_DB, which no setup file migrates.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('AN8 deliveries are intact after 0012, and a fire-less delivery is accepted', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0012'));
  expect(at).toBe(11);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  const t = '2026-10-01T00:00:00.000Z';
  await db.batch([
    db.prepare(`INSERT INTO members (id, email, display_name, color, role, password_hash, created_at)
                VALUES ('mem_1', 'a@example.com', 'A', '#FF6B35', 'owner', 'x', ?)`).bind(t),
    db.prepare(`INSERT INTO timers (id, title, interval_min, channels, created_by, created_at, updated_at)
                VALUES ('tmr_1', 'Dog', 60, '["push","house"]', 'mem_1', ?, ?)`).bind(t, t),
    db.prepare(`INSERT INTO fires (id, kind, timer_id, due_at, state, alert_count, last_alerted_at)
                VALUES ('fire_t', 'timer', 'tmr_1', ?, 'ringing', 2, ?)`).bind(t, t),
    db.prepare(`INSERT INTO deliveries (id, fire_id, alert_number, channel, message, status, detail, attempts, claimed_at, created_at, updated_at)
                VALUES ('dlv_1', 'fire_t', 1, 'house', 'Timer: Dog', 'partial', '{"echo":"ok"}', 1, ?, ?, ?)`).bind(t, t, t),
    db.prepare(`INSERT INTO deliveries (id, fire_id, alert_number, channel, member_id, message, status, created_at, updated_at)
                VALUES ('dlv_2', 'fire_t', 2, 'push', 'mem_1', 'Timer: Dog (alert 2)', 'sent', ?, ?)`).bind(t, t),
  ]);
  // Before 0012 a delivery must name its fire.
  await expect(db.prepare(`INSERT INTO deliveries (id, fire_id, alert_number, channel, message, status, created_at, updated_at)
                           VALUES ('dlv_x', NULL, 1, 'house', 'x', 'queued', ?, ?)`).bind(t, t).run()).rejects.toThrow(/NOT NULL/);
  const before = (await db.prepare('SELECT * FROM deliveries ORDER BY id').all()).results;
  expect(before).toHaveLength(2);

  await applyD1Migrations(db, env.TEST_MIGRATIONS);

  expect((await db.prepare('SELECT * FROM deliveries ORDER BY id').all()).results).toEqual(before);
  expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
  const idx = await db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_deliveries_queue'`).first<{ sql: string }>();
  expect(idx?.sql).toMatch(/ON deliveries\s*\(channel, status\)/);

  await db.prepare(`INSERT INTO deliveries (id, fire_id, alert_number, channel, member_id, message, status, created_at, updated_at)
                    VALUES ('dlv_a', NULL, 1, 'house', NULL, 'A says: hi', 'queued', ?, ?)`).bind(t, t).run();
  // The CHECKs are still in force.
  await expect(db.prepare(`INSERT INTO deliveries (id, fire_id, alert_number, channel, message, status, created_at, updated_at)
                           VALUES ('dlv_b', NULL, 1, 'sms', 'x', 'queued', ?, ?)`).bind(t, t).run()).rejects.toThrow(/CHECK/);
});
