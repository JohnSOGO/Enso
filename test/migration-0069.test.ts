// SR-M (SPEC §4.2zzp) — 0069 replaces events.start_sun so it takes 'sunrise' too: every event survives with the same
// columns and values, and afterwards 'sunrise' is taken and 'noon' refused. Runs on MIGRATION_DB.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('SR-M events survive 0069 unchanged; start_sun then takes sunrise and refuses anything else', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0069'));
  expect(at).toBeGreaterThan(0);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  const t = '2026-11-01T00:00:00.000Z';
  await db.batch([
    db.prepare(`INSERT INTO members (id, email, display_name, color, role, password_hash, created_at)
                VALUES ('mem_1', 'a@example.com', 'A', '#FF6B35', 'owner', 'x', ?)`).bind(t),
    db.prepare(`INSERT INTO events (id, title, start_date, end_date, created_by, created_at, updated_at)
                VALUES ('evt_1', 'Trash', '2026-11-04', '2026-11-04', 'mem_1', ?, ?)`).bind(t, t),
    db.prepare(`INSERT INTO events (id, title, start_date, end_date, created_by, created_at, updated_at, start_sun, remind_offset_min)
                VALUES ('evt_2', 'Put the goats away', '2026-10-03', '2026-10-03', 'mem_1', ?, ?, 'sunset', 30)`).bind(t, t),
  ]);
  const before = (await db.prepare('SELECT * FROM events ORDER BY id').all<Record<string, unknown>>()).results;

  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));

  const after = (await db.prepare('SELECT * FROM events ORDER BY id').all<Record<string, unknown>>()).results;
  expect(after).toEqual(before); // same keys, same values: start_sun moved to the end of the row, nothing else changed
  expect(Object.keys(after[0])).not.toContain('start_sun_0016');
  await db.prepare(`UPDATE events SET start_sun = 'sunrise' WHERE id = 'evt_1'`).run();
  expect(await db.prepare(`SELECT start_sun FROM events WHERE id = 'evt_1'`).first()).toEqual({ start_sun: 'sunrise' });
  await expect(db.prepare(`UPDATE events SET start_sun = 'noon' WHERE id = 'evt_1'`).run()).rejects.toThrow(/CHECK/);
});
