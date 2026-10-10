// WX-M (SPEC §4.2zi) — 0036 adds weather_days and settings.weather_tried_at: the settings row survives unchanged
// with weather_tried_at NULL, and weather_days starts empty. Runs on MIGRATION_DB, which no setup file migrates.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('WX-M settings survive 0036 with weather_tried_at NULL; weather_days is empty', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0036'));
  expect(at).toBeGreaterThan(0);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  await db.prepare(`UPDATE settings SET household_name = 'Casa' WHERE id = 1`).run();
  const before = await db.prepare('SELECT * FROM settings WHERE id = 1').first();

  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));

  expect(await db.prepare('SELECT * FROM settings WHERE id = 1').first()).toEqual({ ...before, weather_tried_at: null });
  expect((await db.prepare('SELECT * FROM weather_days').all()).results).toEqual([]);
});
