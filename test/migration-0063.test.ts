// PV-M (SPEC §4.2zzj) — 0063 adds events.private: an existing event reads 0; a new one takes 1.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('0063 adds events.private, 0 by default', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0063'));
  expect(at).toBeGreaterThan(0);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  const cols = `id, title, start_date, end_date, assigned_to, created_by, created_at, updated_at`;
  await db.prepare(`INSERT INTO members (id, email, display_name, color, role, password_hash, created_at) VALUES ('mem_a', 'a@x', 'A', '#FF6B35', 'owner', 'x', 'T')`).run();
  await db.prepare(`INSERT INTO events (${cols}) VALUES ('evt_old', 'Old', '2030-01-01', '2030-01-01', '[]', 'mem_a', 'T', 'T')`).run();
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));
  await db.prepare(`INSERT INTO events (${cols}, private) VALUES ('evt_new', 'New', '2030-01-01', '2030-01-01', '["mem_a"]', 'mem_a', 'T', 'T', 1)`).run();
  expect(await db.prepare('SELECT id, private FROM events ORDER BY id').all().then((r) => r.results))
    .toEqual([{ id: 'evt_new', private: 1 }, { id: 'evt_old', private: 0 }]);
});
