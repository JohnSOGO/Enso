// NM-M (SPEC §4.2zzi) — 0062 adds note_marks: it takes a row; a second row with the same hash is refused.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('0062 adds note_marks keyed by the text hash', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0062'));
  expect(at).toBeGreaterThan(0);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));
  const insert = `INSERT INTO note_marks (text_hash, marks, created_at) VALUES ('abc', '[{"text":"x","kind":"key"}]', 'T')`;
  await db.prepare(insert).run();
  expect(await db.prepare('SELECT text_hash, marks FROM note_marks').all().then((r) => r.results))
    .toEqual([{ text_hash: 'abc', marks: '[{"text":"x","kind":"key"}]' }]);
  await expect(db.prepare(insert).run()).rejects.toThrow();
});
