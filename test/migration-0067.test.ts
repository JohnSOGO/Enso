// MS-M2 (SPEC §4.2zzn) — 0067 adds messes.cleaned: a mess written before it reads as cleaned (1).
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('0067 marks every earlier mess as cleaned', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0067'));
  expect(at).toBeGreaterThan(0);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  await db.prepare(`INSERT INTO members (id, email, display_name, color, role, password_hash, created_at) VALUES ('mem_a', 'a@x', 'A', '#FF6B35', 'owner', 'x', 'T')`).run();
  await db.prepare(`INSERT INTO messes (id, reported_by, created_at) VALUES ('mes_1', 'mem_a', 'T')`).run();
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));
  expect(await db.prepare('SELECT cleaned FROM messes').first()).toEqual({ cleaned: 1 });
  expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
});
