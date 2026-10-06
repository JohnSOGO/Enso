// MH-M (SPEC §4.2, §7D.5) — 0028 adds the machines' alert hours to settings: rows written before it survive
// unchanged, the settings row gains the default hours, and foreign keys hold. Runs on MIGRATION_DB, which no setup
// file migrates.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('MH-M earlier rows survive 0028; settings gain the default machine hours', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0028'));
  expect(at).toBeGreaterThan(0);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  const t = '2026-10-05T00:00:00.000Z';
  await db.batch([
    db.prepare(`INSERT INTO members (id, email, display_name, color, role, password_hash, created_at)
                VALUES ('mem_1', 'a@example.com', 'A', '#FF6B35', 'owner', 'x', ?)`).bind(t),
    db.prepare(`INSERT INTO lists (id, name, name_key, created_by, created_at, updated_at)
                VALUES ('lst_1', 'Hardware store', 'hardware store', 'mem_1', ?, ?)`).bind(t, t),
    db.prepare(`INSERT INTO list_items (id, list_id, text, text_key, created_by, created_at, updated_at)
                VALUES ('itm_1', 'lst_1', 'Nails', 'nails', 'mem_1', ?, ?)`).bind(t, t),
    db.prepare("UPDATE settings SET household_name = 'Casa' WHERE id = 1"),
  ]);
  const tables = ['members', 'lists', 'list_items', 'settings'];
  const snapshot = async () => Promise.all(tables.map(async (table) => (await db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results));
  const before = await snapshot();

  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));

  const after = await snapshot();
  const i = tables.indexOf('settings');
  expect(after.filter((_, k) => k !== i)).toEqual(before.filter((_, k) => k !== i));
  expect(after[i]).toHaveLength(1);
  expect(after[i]).toEqual(before[i].map((r) => ({
    ...r, machine_weekday_from: '17:30', machine_weekday_to: '20:30', machine_weekend_from: '09:00', machine_weekend_to: '21:00',
  })));
  expect(after[i][0]).toMatchObject({ household_name: 'Casa' });
  expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
});
