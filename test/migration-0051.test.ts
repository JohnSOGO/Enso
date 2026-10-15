// TA-M (SPEC §4.2zx) — 0051 clears Away only on open scheduled timer fires; every other fire keeps it.
// Runs on MIGRATION_DB, which no setup file migrates.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('TA-M 0051 clears Away on stuck timer fires only', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0051'));
  expect(at).toBeGreaterThan(0);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  const t = '2026-10-13T20:30:00.000Z';
  const fire = (id: string, kind: string, state: string) => db.prepare(
    `INSERT INTO fires (id, kind, timer_id, machine_id, due_at, state, alert_count, away_by, away_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, 'mem_1', ?)`).bind(id, kind, kind === 'timer' ? `tmr_${id}` : null, kind === 'machine' ? 'washer' : null, t, state, t);
  await db.batch([
    db.prepare(`INSERT INTO members (id, email, display_name, color, role, password_hash, created_at)
                VALUES ('mem_1', 'a@example.com', 'A', '#FF6B35', 'owner', 'x', ?)`).bind(t),
    ...['fire_stuck', 'fire_ringing'].map((id) => db.prepare(`INSERT INTO timers (id, title, interval_min, channels, assigned_to, created_by, created_at, updated_at)
                VALUES (?, 'Stairs', 60, '["push"]', '[]', 'mem_1', ?, ?)`).bind(`tmr_${id}`, t, t)),
    fire('fire_stuck', 'timer', 'scheduled'), fire('fire_ringing', 'timer', 'ringing'), fire('fire_machine', 'machine', 'scheduled'),
  ]);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));
  const rows = (await db.prepare('SELECT id, away_by, away_at FROM fires ORDER BY id').all<any>()).results;
  expect(rows).toEqual([
    { id: 'fire_machine', away_by: 'mem_1', away_at: t },
    { id: 'fire_ringing', away_by: 'mem_1', away_at: t },
    { id: 'fire_stuck', away_by: null, away_at: null },
  ]);
});
