// C13 (SPEC §4.2e) — 0006 rebuilds `fires`; rows written under 0001–0005 survive it, and a
// delivery still points at its fire. Runs on MIGRATION_DB, which no setup file migrates.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('C13 old fires and deliveries are intact after 0006', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0006'));
  expect(at).toBe(5);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  const t = '2026-10-01T00:00:00.000Z';
  await db.batch([
    db.prepare(`INSERT INTO members (id, email, display_name, color, role, password_hash, created_at)
                VALUES ('mem_1', 'a@example.com', 'A', '#FF6B35', 'owner', 'x', ?)`).bind(t),
    db.prepare(`INSERT INTO events (id, title, start_date, end_date, created_by, created_at, updated_at)
                VALUES ('evt_1', 'Meds', '2026-10-01', '2026-10-01', 'mem_1', ?, ?)`).bind(t, t),
    db.prepare(`INSERT INTO timers (id, title, interval_min, channels, created_by, created_at, updated_at)
                VALUES ('tmr_1', 'Dog', 60, '["push"]', 'mem_1', ?, ?)`).bind(t, t),
    db.prepare(`INSERT INTO fires (id, kind, event_id, occurrence_date, due_at, state, alert_count, last_alerted_at)
                VALUES ('fire_r', 'reminder', 'evt_1', '2026-10-01', ?, 'ringing', 1, ?)`).bind(t, t),
    db.prepare(`INSERT INTO fires (id, kind, timer_id, due_at, state, close_reason, closed_by, closed_at)
                VALUES ('fire_t', 'timer', 'tmr_1', ?, 'closed', 'acked', 'mem_1', ?)`).bind(t, t),
    db.prepare(`INSERT INTO deliveries (id, fire_id, alert_number, channel, message, status, created_at, updated_at)
                VALUES ('dlv_1', 'fire_r', 1, 'house', 'Reminder: Meds', 'queued', ?, ?)`).bind(t, t),
  ]);
  const before = (await db.prepare('SELECT * FROM fires ORDER BY id').all<Record<string, unknown>>()).results;
  expect(before).toHaveLength(2);

  await applyD1Migrations(db, env.TEST_MIGRATIONS);

  const after = (await db.prepare('SELECT * FROM fires ORDER BY id').all<Record<string, unknown>>()).results;
  expect(after).toEqual(before.map((f) => ({ ...f, chore_run_id: null, thing_id: null, machine_id: null, away_by: null, away_at: null }))); // later migrations add these columns
  const d = await db.prepare('SELECT d.id, d.message, f.id AS fire_id, f.kind FROM deliveries d JOIN fires f ON f.id = d.fire_id').all();
  expect(d.results).toEqual([{ id: 'dlv_1', message: 'Reminder: Meds', fire_id: 'fire_r', kind: 'reminder' }]);
  expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
  // The rebuilt table keeps its indexes: a second open fire for the same occurrence is refused.
  await expect(db.prepare(`INSERT INTO fires (id, kind, event_id, occurrence_date, due_at, state)
                           VALUES ('fire_r2', 'reminder', 'evt_1', '2026-10-01', ?, 'scheduled')`).bind(t).run()).rejects.toThrow(/UNIQUE/);
});
