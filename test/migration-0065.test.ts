// HD-M (SPEC §4.2zzl) — 0065 adds room_devices: existing rooms untouched, no device rows; one room per device.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('0065 adds room_devices, one room per device', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0065'));
  expect(at).toBeGreaterThan(0);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  await db.prepare(`INSERT INTO members (id, email, display_name, color, role, password_hash, created_at) VALUES ('mem_a', 'a@x', 'A', '#FF6B35', 'owner', 'x', 'T')`).run();
  await db.prepare(`INSERT INTO rooms (id, name, position, created_by, created_at, updated_at) VALUES ('rom_a', 'Kitchen', 0, 'mem_a', 'T', 'T'), ('rom_b', 'Den', 1, 'mem_a', 'T', 'T')`).run();
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));
  expect((await db.prepare('SELECT id, name FROM rooms ORDER BY position').all()).results).toEqual([{ id: 'rom_a', name: 'Kitchen' }, { id: 'rom_b', name: 'Den' }]);
  expect((await db.prepare('SELECT COUNT(*) AS n FROM room_devices').first<{ n: number }>())!.n).toBe(0);
  await db.prepare(`INSERT INTO room_devices (entity_id, room_id, position, created_at) VALUES ('climate.ac', 'rom_a', 0, 'T')`).run();
  await expect(db.prepare(`INSERT INTO room_devices (entity_id, room_id, position, created_at) VALUES ('climate.ac', 'rom_b', 0, 'T')`).run()).rejects.toThrow();
  expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
});
