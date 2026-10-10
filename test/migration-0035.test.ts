// EB-M (SPEC §4.2zh) — 0035 adds events.bring: earlier events survive unchanged with bring NULL.
// Runs on MIGRATION_DB, which no setup file migrates.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('EB-M earlier events survive 0035 with bring NULL', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0035'));
  expect(at).toBeGreaterThan(0);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  const t = '2026-10-09T00:00:00.000Z';
  await db.batch([
    db.prepare(`INSERT INTO members (id, email, display_name, color, role, password_hash, created_at)
                VALUES ('mem_1', 'a@example.com', 'A', '#FF6B35', 'owner', 'x', ?)`).bind(t),
    db.prepare(`INSERT INTO events (id, title, notes, start_date, start_time, end_date, created_by, created_at, updated_at)
                VALUES ('evt_1', 'Party', 'RSVP', '2026-10-17', '14:00', '2026-10-17', 'mem_1', ?, ?)`).bind(t, t),
  ]);
  const before = await db.prepare(`SELECT * FROM events WHERE id = 'evt_1'`).first();

  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));

  expect(await db.prepare(`SELECT * FROM events WHERE id = 'evt_1'`).first()).toEqual({ ...before, bring: null });
  expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
});
