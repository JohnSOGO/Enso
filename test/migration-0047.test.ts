// RM-M (SPEC §4.2zt) — 0047 moves what done looks like from chores to rooms, losing nothing: each chore with areas
// becomes a room of its name and points at it; every area and photo keeps its id, fields and R2 key; a chore without
// areas gets no room; foreign keys hold. Runs on MIGRATION_DB, which no setup file migrates.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('RM-M the Kitchen chore\'s areas and photos become the Kitchen room\'s, unchanged', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0047'));
  expect(at).toBeGreaterThan(0);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  const t = '2026-10-05T00:00:00.000Z';
  const chore = (id: string, title: string) => db.prepare(
    `INSERT INTO chores (id, title, done_means, days, timing, time, people, steps, channels, start_date, created_by, created_at, updated_at)
     VALUES (?, ?, NULL, '["MO"]', 'by', '19:00', '["mem_1"]', '[{"title":"x","waitMin":null,"memberId":null}]', '[]', '2026-10-05', 'mem_1', ?, ?)`).bind(id, title, t, t);
  await db.batch([
    db.prepare(`INSERT INTO members (id, email, display_name, color, role, password_hash, created_at)
                VALUES ('mem_1', 'a@example.com', 'A', '#FF6B35', 'owner', 'x', ?)`).bind(t),
    chore('chr_AAAAAAAAAAAAAAAA', 'Kitchen'), chore('chr_BBBBBBBBBBBBBBBB', 'Trash'),
    db.prepare(`INSERT INTO chore_areas (id, chore_id, name, expectations, position, created_by, created_at, updated_at)
                VALUES ('cha_1', 'chr_AAAAAAAAAAAAAAAA', 'Sink', '["No dishes"]', 0, 'mem_1', ?, ?),
                       ('cha_2', 'chr_AAAAAAAAAAAAAAAA', 'Stove', '[]', 1, 'mem_1', ?, ?)`).bind(t, t, t, t),
    db.prepare(`INSERT INTO chore_area_photos (id, area_id, photo_key, created_at)
                VALUES ('cap_1', 'cha_1', 'chore-areas/cha_1/x.jpg', ?)`).bind(t),
  ]);
  const areasBefore = (await db.prepare('SELECT id, name, expectations, position, created_by, created_at, updated_at FROM chore_areas ORDER BY id').all()).results;
  const photosBefore = (await db.prepare('SELECT * FROM chore_area_photos ORDER BY id').all()).results;

  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));

  expect((await db.prepare('SELECT * FROM rooms').all()).results).toEqual([
    { id: 'rom_AAAAAAAAAAAAAAAA', name: 'Kitchen', position: 0, created_by: 'mem_1', created_at: t, updated_at: t },
  ]);
  expect((await db.prepare('SELECT id, room_id FROM chores ORDER BY id').all()).results).toEqual([
    { id: 'chr_AAAAAAAAAAAAAAAA', room_id: 'rom_AAAAAAAAAAAAAAAA' }, { id: 'chr_BBBBBBBBBBBBBBBB', room_id: null },
  ]);
  expect((await db.prepare('SELECT id, name, expectations, position, created_by, created_at, updated_at FROM room_areas ORDER BY id').all()).results).toEqual(areasBefore);
  expect((await db.prepare(`SELECT DISTINCT room_id FROM room_areas`).all()).results).toEqual([{ room_id: 'rom_AAAAAAAAAAAAAAAA' }]);
  expect((await db.prepare('SELECT * FROM room_area_photos ORDER BY id').all()).results).toEqual(photosBefore);
  expect(await db.prepare(`SELECT name FROM sqlite_master WHERE name IN ('chore_areas', 'chore_area_photos')`).first()).toBeNull();
  expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
});
