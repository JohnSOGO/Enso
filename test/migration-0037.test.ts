// DW-M (SPEC §4.2zj) — 0037 seeds the dish washer: the washer and dryer rows (a running load included) and
// their open fires survive unchanged, and the dish washer starts free. Runs on MIGRATION_DB, which no setup file migrates.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('DW-M the laundry rows and their fires survive 0037; the dish washer is seeded free', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0037'));
  expect(at).toBeGreaterThan(0);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  const t = '2026-10-10T18:00:00.000Z';
  await db.prepare(`UPDATE machines SET minutes = 45, started_at = ?, done_at = ?, updated_at = ? WHERE id = 'washer'`).bind(t, t, t).run();
  await db.prepare(`INSERT INTO fires (id, kind, machine_id, due_at, state) VALUES ('fire_w', 'machine', 'washer', ?, 'scheduled')`).bind(t).run();
  const machines = async () => (await db.prepare('SELECT * FROM machines ORDER BY id').all<any>()).results;
  const before = await machines();
  const fires = (await db.prepare('SELECT * FROM fires').all()).results;

  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));

  const after = await machines();
  expect(after.filter((m) => m.id !== 'dishwasher')).toEqual(before);
  expect(after.find((m) => m.id === 'dishwasher')).toMatchObject({ owner_id: null, minutes: null, started_at: null, done_at: null });
  expect((await db.prepare('SELECT * FROM fires').all()).results).toEqual(fires);
});
