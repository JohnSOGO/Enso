// RM-M2 (SPEC §4.2zza) — 0054 adds member_prefs.after_kind / after_time, NULL for everyone but the founder's 15:30.
// Runs on MIGRATION_DB, which no setup file migrates.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('0054 gives the founder After work 15:30 and leaves the others unset', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0054'));
  expect(at).toBeGreaterThan(0);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  await db.prepare(`INSERT INTO members (id, email, display_name, color, role, password_hash, created_at) VALUES ('mem_f', 'f@x', 'F', '#123456', 'owner', 'x', '2026-10-01T04:00:00.000Z'), ('mem_k', 'k@x', 'K', '#654321', 'member', 'x', '2026-10-07T04:00:00.000Z')`).run();
  await db.prepare(`INSERT INTO member_prefs (member_id) VALUES ('mem_f'), ('mem_k')`).run();
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));
  const rows = (await db.prepare('SELECT member_id, after_kind, after_time FROM member_prefs ORDER BY member_id').all()).results;
  expect(rows).toEqual([
    { member_id: 'mem_f', after_kind: null, after_time: '15:30' },
    { member_id: 'mem_k', after_kind: null, after_time: null },
  ]);
  await expect(db.prepare(`UPDATE member_prefs SET after_kind = 'gym'`).run()).rejects.toThrow();
});
