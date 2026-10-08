// TW-M (SPEC §4.2n) — 0015 adds timers.active_from / active_to; existing timers survive with no
// window (both NULL), so they keep today's behavior. Runs on MIGRATION_DB, which no setup file migrates.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('TW-M existing timers survive 0015 unchanged, with a null window', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0015'));
  expect(at).toBe(14);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  const t = '2026-10-01T00:00:00.000Z';
  await db.batch([
    db.prepare(`INSERT INTO members (id, email, display_name, color, role, password_hash, created_at)
                VALUES ('mem_1', 'a@example.com', 'A', '#FF6B35', 'owner', 'x', ?)`).bind(t),
    db.prepare(`INSERT INTO timers (id, title, interval_min, channels, running, created_by, created_at, updated_at)
                VALUES ('tmr_1', 'Dog', 60, '["push"]', 1, 'mem_1', ?, ?)`).bind(t, t),
    db.prepare(`INSERT INTO fires (id, kind, timer_id, due_at, state) VALUES ('fire_t', 'timer', 'tmr_1', ?, 'scheduled')`).bind(t),
  ]);
  const before = (await db.prepare('SELECT * FROM timers ORDER BY id').all<Record<string, unknown>>()).results;
  const firesBefore = (await db.prepare('SELECT * FROM fires ORDER BY id').all()).results;

  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));

  const after = (await db.prepare('SELECT * FROM timers ORDER BY id').all<Record<string, unknown>>()).results;
  expect(after).toEqual(before.map((r) => ({ ...r, active_from: null, active_to: null })));
  expect((await db.prepare('SELECT * FROM fires ORDER BY id').all()).results).toEqual(firesBefore);
  // No CHECK: the route validates; the columns take a window.
  await db.prepare(`UPDATE timers SET active_from = '08:00', active_to = '21:00' WHERE id = 'tmr_1'`).run();
  expect(await db.prepare('SELECT active_from, active_to FROM timers').first()).toEqual({ active_from: '08:00', active_to: '21:00' });
});
