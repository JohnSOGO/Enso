// PL-M (SPEC §4.2zzg) — 0060 adds places with the seeded Incognito SD; a second row with its id is refused.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('0060 seeds Incognito SD', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0060'));
  expect(at).toBeGreaterThan(0);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));
  expect(await db.prepare(`SELECT name, address, words, created_by FROM places`).all().then((r) => r.results))
    .toEqual([{ name: 'Incognito SD', address: '2335 Mirador, Vista, CA 92084', words: '["Incognito"]', created_by: null }]);
  await expect(db.prepare(`INSERT INTO places (id, name, address, created_at, updated_at) VALUES ('plc_incognitosd0000', 'x', 'y', 'T', 'T')`).run()).rejects.toThrow();
});
