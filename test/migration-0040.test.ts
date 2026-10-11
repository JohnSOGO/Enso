// AL-M (SPEC §4.2zm) — 0040 adds machines.alert_id: machine rows and open fires survive; a loaded machine
// alerts its owner, a free or owner-unknown one nobody. Runs on MIGRATION_DB, which no setup file migrates.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('AL-M machines and their fires survive 0040; a loaded machine alerts its owner, others nobody', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0040'));
  expect(at).toBeGreaterThan(0);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  const t = '2026-10-11T18:00:00.000Z';
  await db.prepare(`INSERT INTO members (id, email, display_name, color, role, password_hash, created_at)
    VALUES ('mem_1', 'a@example.com', 'A', '#FF6B35', 'owner', 'x', ?)`).bind(t).run();
  await db.prepare(`UPDATE machines SET owner_id = 'mem_1', minutes = 60, started_at = ?, done_at = ?, updated_at = ? WHERE id = 'washer'`).bind(t, t, t).run();
  await db.prepare(`UPDATE machines SET started_at = ?, done_at = ?, updated_at = ? WHERE id = 'dishwasher'`).bind(t, t, t).run();
  await db.prepare(`INSERT INTO fires (id, kind, machine_id, due_at, state) VALUES ('fire_w', 'machine', 'washer', ?, 'scheduled')`).bind(t).run();
  const machines = async () => (await db.prepare('SELECT * FROM machines ORDER BY id').all<any>()).results;
  const before = await machines();
  const fires = (await db.prepare('SELECT * FROM fires').all()).results;

  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));

  const alertOf: Record<string, string | null> = { washer: 'mem_1', dryer: null, dishwasher: null };
  expect(await machines()).toEqual(before.map((m) => ({ ...m, alert_id: alertOf[m.id] })));
  expect((await db.prepare('SELECT * FROM fires').all()).results).toEqual(fires);
  expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
});
