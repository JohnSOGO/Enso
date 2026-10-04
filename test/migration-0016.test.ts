// SA-M (SPEC §4.2o) — 0016 adds the household place and events.start_sun; existing settings and
// events survive. Runs on MIGRATION_DB, which no setup file migrates.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('SA-M settings gain 33.20 / −117.29, events survive with start_sun NULL, sunrise is refused', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0016'));
  expect(at).toBe(15);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  const t = '2026-10-01T00:00:00.000Z';
  await db.batch([
    db.prepare(`UPDATE settings SET household_name = 'Farm' WHERE id = 1`),
    db.prepare(`INSERT INTO members (id, email, display_name, color, role, password_hash, created_at)
                VALUES ('mem_1', 'a@example.com', 'A', '#FF6B35', 'owner', 'x', ?)`).bind(t),
    db.prepare(`INSERT INTO events (id, title, start_date, end_date, created_by, created_at, updated_at)
                VALUES ('evt_1', 'Trash', '2026-10-04', '2026-10-04', 'mem_1', ?, ?)`).bind(t, t),
  ]);
  const settingsBefore = await db.prepare('SELECT * FROM settings').first<Record<string, unknown>>();
  const eventsBefore = (await db.prepare('SELECT * FROM events ORDER BY id').all<Record<string, unknown>>()).results;

  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));

  expect(await db.prepare('SELECT * FROM settings').first()).toEqual({ ...settingsBefore, latitude: 33.2, longitude: -117.29 });
  expect((await db.prepare('SELECT * FROM events ORDER BY id').all()).results).toEqual(eventsBefore.map((r) => ({ ...r, start_sun: null })));
  await expect(db.prepare(`UPDATE events SET start_sun = 'sunrise' WHERE id = 'evt_1'`).run()).rejects.toThrow(/CHECK/);
  await db.prepare(`UPDATE events SET start_sun = 'sunset' WHERE id = 'evt_1'`).run();
  expect(await db.prepare('SELECT start_sun FROM events').first()).toEqual({ start_sun: 'sunset' });
});
