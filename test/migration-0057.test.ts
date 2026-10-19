// SY-M3 (SPEC §4.2zzd) — 0057 rebuilds feature_requests for status 'outside': a row saved under 0056 is still there,
// 'outside' is taken, an unknown status is still refused. Runs on MIGRATION_DB, which no setup file migrates.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('0057 keeps the 0056 rows and takes the outside status', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0057'));
  expect(at).toBeGreaterThan(0);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  await db.prepare(`INSERT INTO members (id, email, display_name, color, role, password_hash, created_at) VALUES ('mem_g', 'g@x', 'G', '#123456', 'owner', 'x', '2026-10-01T04:00:00.000Z')`).run();
  const add = (id: string, status: string) => db.prepare(`INSERT INTO feature_requests (id, text, title, summary, size, status, note, created_by, created_at, updated_at)
    VALUES (?, 'said', 'T', 'S', 'big', ?, 'n', 'mem_g', '2026-10-19T00:00:00Z', '2026-10-19T00:00:00Z')`).bind(id, status).run();
  await add('req_old', 'needs_john');
  await expect(add('req_early', 'outside')).rejects.toThrow();
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));
  expect(await db.prepare(`SELECT id, status, note FROM feature_requests`).all().then((r) => r.results)).toEqual([{ id: 'req_old', status: 'needs_john', note: 'n' }]);
  await add('req_out', 'outside');
  await expect(add('req_bad', 'maybe')).rejects.toThrow();
  expect((await db.prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_feature_requests_created'`).first())).toEqual({ name: 'idx_feature_requests_created' });
});
