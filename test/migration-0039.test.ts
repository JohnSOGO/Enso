// AW-M (SPEC §4.2zl) — 0039 adds fires.away_by / away_at: fires and deliveries survive unchanged, nobody away.
// Runs on MIGRATION_DB, which no setup file migrates.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('AW-M fires and deliveries survive 0039 with both away columns NULL', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0039'));
  expect(at).toBeGreaterThan(0);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  const t = '2026-10-10T18:00:00.000Z';
  await db.prepare(`INSERT INTO fires (id, kind, machine_id, due_at, state, alert_count) VALUES ('fire_w', 'machine', 'washer', ?, 'ringing', 1)`).bind(t).run();
  await db.prepare(`INSERT INTO deliveries (id, fire_id, alert_number, channel, member_id, message, status, created_at, updated_at)
    VALUES ('del_1', 'fire_w', 1, 'house', NULL, 'Washer done', 'sent', ?, ?)`).bind(t, t).run();
  const fire = await db.prepare('SELECT * FROM fires').first<any>();
  const deliveries = (await db.prepare('SELECT * FROM deliveries').all()).results;

  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));

  expect(await db.prepare('SELECT * FROM fires').first<any>()).toEqual({ ...fire, away_by: null, away_at: null });
  expect((await db.prepare('SELECT * FROM deliveries').all()).results).toEqual(deliveries);
  expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
});
