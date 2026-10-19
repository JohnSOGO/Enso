// SH-M (SPEC §4.2zzb) — 0055 adds share_keys and inbox_items; earlier members come through with no key.
// Runs on MIGRATION_DB, which no setup file migrates.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('0055 leaves members keyless and takes a key and an item', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0055'));
  expect(at).toBeGreaterThan(0);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  await db.prepare(`INSERT INTO members (id, email, display_name, color, role, password_hash, created_at) VALUES ('mem_s', 's@x', 'S', '#123456', 'owner', 'x', '2026-10-01T04:00:00.000Z')`).run();
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));
  expect((await db.prepare('SELECT COUNT(*) AS n FROM share_keys').first<{ n: number }>())!.n).toBe(0);
  await db.prepare(`INSERT INTO share_keys (member_id, key_hash, created_at) VALUES ('mem_s', 'h', '2026-10-19T00:00:00.000Z')`).run();
  await db.prepare(`INSERT INTO inbox_items (id, member_id, url, created_at) VALUES ('inb_1', 'mem_s', 'https://a.b', '2026-10-19T00:00:00.000Z')`).run();
  await expect(db.prepare(`INSERT INTO share_keys (member_id, key_hash, created_at) VALUES ('mem_s', 'h2', 'x')`).run()).rejects.toThrow();
});
