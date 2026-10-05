// CA-M (SPEC §4.2zb) — 0029 adds chore_areas and chore_area_photos: rows written before it survive unchanged, and
// foreign keys hold. Runs on MIGRATION_DB, which no setup file migrates.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('CA-M earlier rows survive 0029; the new tables start empty', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0029'));
  expect(at).toBeGreaterThan(0);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  const t = '2026-10-05T00:00:00.000Z';
  await db.batch([
    db.prepare(`INSERT INTO members (id, email, display_name, color, role, password_hash, created_at)
                VALUES ('mem_1', 'a@example.com', 'A', '#FF6B35', 'owner', 'x', ?)`).bind(t),
    db.prepare(`INSERT INTO chores (id, title, done_means, days, timing, time, people, steps, channels, start_date, created_by, created_at, updated_at)
                VALUES ('chr_1', 'Kitchen', 'Counters clear', '["MO"]', 'by', '19:00', '["mem_1"]', '[{"title":"Kitchen","waitMin":null,"memberId":null}]', '[]', '2026-10-05', 'mem_1', ?, ?)`).bind(t, t),
  ]);
  const tables = ['members', 'chores', 'chore_runs', 'settings'];
  const snapshot = async () => Promise.all(tables.map(async (table) => (await db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results));
  const before = await snapshot();

  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));

  expect(await snapshot()).toEqual(before);
  for (const table of ['chore_areas', 'chore_area_photos']) {
    expect((await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())!.n).toBe(0);
  }
  await db.prepare(`INSERT INTO chore_areas (id, chore_id, name, position, created_by, created_at, updated_at)
                    VALUES ('cha_1', 'chr_1', 'Sink', 0, 'mem_1', ?, ?)`).bind(t, t).run();
  expect((await db.prepare(`SELECT expectations FROM chore_areas WHERE id = 'cha_1'`).first<{ expectations: string }>())!.expectations).toBe('[]');
  expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
});
