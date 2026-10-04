// H9 (SPEC §4.2l) — 0013 drops settings.relay_last_seen; the settings row and every delivery
// survive unchanged. Runs on MIGRATION_DB, which no setup file migrates.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('H9 the settings row survives 0013 and relay_last_seen is gone', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0013'));
  expect(at).toBe(12);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  const t = '2026-10-01T00:00:00.000Z';
  await db.batch([
    db.prepare(`UPDATE settings SET household_name = 'Sogo Dojo', timezone = 'America/New_York', days_off = '["christmas"]', relay_last_seen = ? WHERE id = 1`).bind(t),
    db.prepare(`INSERT INTO deliveries (id, fire_id, alert_number, channel, member_id, message, status, detail, attempts, created_at, updated_at)
                VALUES ('dlv_a', NULL, 1, 'house', NULL, 'A says: hi', 'partial', '{"echo":"ok"}', 1, ?, ?)`).bind(t, t),
  ]);
  const columns = async () => (await db.prepare('PRAGMA table_info(settings)').all<{ name: string }>()).results.map((c) => c.name);
  expect(await columns()).toContain('relay_last_seen');
  const { relay_last_seen, ...settingsBefore } = (await db.prepare('SELECT * FROM settings').first<Record<string, unknown>>())!;
  expect(relay_last_seen).toBe(t);
  const deliveriesBefore = (await db.prepare('SELECT * FROM deliveries ORDER BY id').all()).results;

  await applyD1Migrations(db, env.TEST_MIGRATIONS);

  expect(await columns()).not.toContain('relay_last_seen');
  expect((await db.prepare('SELECT * FROM settings').all()).results).toEqual([settingsBefore]);
  expect(settingsBefore).toMatchObject({ id: 1, household_name: 'Sogo Dojo', timezone: 'America/New_York', days_off: '["christmas"]' });
  expect((await db.prepare('SELECT * FROM deliveries ORDER BY id').all()).results).toEqual(deliveriesBefore);
});
