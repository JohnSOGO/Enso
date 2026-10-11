// CK-M (SPEC §4.2zp) — 0043 adds the cooking columns to machines: the three machines and their open fires survive; a
// cooking row and its fire can be written. Runs on MIGRATION_DB, which no setup file migrates.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('CK-M machines and their fires survive 0043; a cooking timer and its fire can be written', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0043'));
  expect(at).toBeGreaterThan(0);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  const t = '2026-10-11T18:00:00.000Z';
  await db.prepare(`UPDATE machines SET minutes = 60, started_at = ?, done_at = ?, updated_at = ? WHERE id = 'washer'`).bind(t, t, t).run();
  await db.prepare(`INSERT INTO fires (id, kind, machine_id, due_at, state) VALUES ('fire_w', 'machine', 'washer', ?, 'scheduled')`).bind(t).run();
  const machines = async () => (await db.prepare('SELECT * FROM machines ORDER BY id').all<any>()).results;
  const before = await machines();
  const fires = (await db.prepare('SELECT * FROM fires').all()).results;

  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));

  expect(await machines()).toEqual(before.map((m) => ({ ...m, cook_kind: null, name: null, created_at: null, closed_at: null })));
  expect((await db.prepare('SELECT * FROM fires').all()).results).toEqual(fires);
  await db.prepare(`INSERT INTO machines (id, cook_kind, name, minutes, created_at, updated_at) VALUES ('cook_1', 'oven', 'Oven 2', 12, ?, ?)`).bind(t, t).run();
  await db.prepare(`INSERT INTO fires (id, kind, machine_id, due_at, state) VALUES ('fire_c', 'machine', 'cook_1', ?, 'scheduled')`).bind(t).run();
  expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
});
