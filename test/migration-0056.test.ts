// SY-M2 (SPEC §4.2zzc) — 0056 adds feature_requests; it takes a request and refuses an unknown status or size.
// Runs on MIGRATION_DB, which no setup file migrates.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('0056 adds feature_requests with its status and size checks', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0056'));
  expect(at).toBeGreaterThan(0);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));
  await db.prepare(`INSERT INTO members (id, email, display_name, color, role, password_hash, created_at) VALUES ('mem_f', 'f@x', 'F', '#123456', 'owner', 'x', '2026-10-01T04:00:00.000Z')`).run();
  const add = (status: string, size: string) => db.prepare(`INSERT INTO feature_requests (id, text, title, summary, size, status, created_by, created_at, updated_at)
    VALUES (?, 'said', 'T', 'S', ?, ?, 'mem_f', '2026-10-19T00:00:00Z', '2026-10-19T00:00:00Z')`).bind(`req_${status}_${size}`, size, status).run();
  await add('needs_john', 'big');
  expect((await db.prepare('SELECT status, note FROM feature_requests').first())).toEqual({ status: 'needs_john', note: null });
  await expect(add('maybe', 'big')).rejects.toThrow();
  await expect(add('new', 'huge')).rejects.toThrow();
});
