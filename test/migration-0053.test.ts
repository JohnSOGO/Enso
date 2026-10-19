// TB-M (SPEC §4.2zz) — 0053 adds task_sessions: earlier timers and fires come through unchanged; a session row can be
// written beside its task_… timer. Runs on MIGRATION_DB, which no setup file migrates.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('TB-M timers and fires survive 0053; a task session can be written', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0053'));
  expect(at).toBeGreaterThan(0);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  const T = '2026-10-19T04:00:00.000Z';
  await db.prepare(`INSERT INTO members (id, email, display_name, color, role, password_hash, created_at) VALUES ('mem_a', 'a@x', 'A', '#123456', 'owner', 'x', ?)`).bind(T).run();
  await db.prepare(`INSERT INTO timers (id, title, interval_min, channels, assigned_to, running, created_by, created_at, updated_at)
    VALUES ('tmr_1', 'Pushups', 60, '["push"]', '[]', 1, 'mem_a', ?, ?)`).bind(T, T).run();
  await db.prepare(`INSERT INTO fires (id, kind, timer_id, due_at, state) VALUES ('fire_1', 'timer', 'tmr_1', ?, 'scheduled')`).bind(T).run();
  const timers = (await db.prepare('SELECT * FROM timers').all()).results;
  const fires = (await db.prepare('SELECT * FROM fires').all()).results;
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));
  expect((await db.prepare('SELECT * FROM timers').all()).results).toEqual(timers);
  expect((await db.prepare('SELECT * FROM fires').all()).results).toEqual(fires);
  await db.prepare(`INSERT INTO timers (id, title, interval_min, channels, assigned_to, running, created_by, created_at, updated_at)
    VALUES ('task_1', 'Clean the garage', 15, '["push"]', '["mem_a"]', 1, 'mem_a', ?, ?)`).bind(T, T).run();
  await db.prepare(`INSERT INTO task_sessions (id, member_id, started_at, working_since, since_break, updated_at) VALUES ('task_1', 'mem_a', ?, ?, ?, ?)`).bind(T, T, T, T).run();
  expect((await db.prepare('SELECT * FROM task_sessions').first<any>())).toMatchObject({ id: 'task_1', worked_ms: 0, checkins: '[]', done_looks: '[]', outcome: null });
  expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
});
