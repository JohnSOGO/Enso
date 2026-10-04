// HS-M (SPEC §4.2w) — 0024 adds member_prefs.house_speakers and deliveries.speakers: rows written before it
// survive unchanged with both NULL, and foreign keys hold. Runs on MIGRATION_DB, which no setup file migrates.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('HS-M earlier rows survive 0024; both new columns are NULL', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0024'));
  expect(at).toBe(23);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  const t = '2026-10-04T00:00:00.000Z';
  await db.batch([
    db.prepare(`INSERT INTO members (id, email, display_name, color, role, password_hash, created_at)
                VALUES ('mem_1', 'a@example.com', 'A', '#FF6B35', 'owner', 'x', ?)`).bind(t),
    db.prepare(`INSERT INTO member_prefs (member_id) VALUES ('mem_1')`),
    db.prepare(`INSERT INTO deliveries (id, fire_id, alert_number, channel, member_id, message, status, created_at, updated_at)
                VALUES ('dlv_1', NULL, 1, 'house', NULL, 'A says: hi', 'sent', ?, ?)`).bind(t, t),
    db.prepare(`INSERT INTO deliveries (id, fire_id, alert_number, channel, member_id, message, status, created_at, updated_at)
                VALUES ('dlv_2', NULL, 1, 'push', 'mem_1', 'A says: hi', 'queued', ?, ?)`).bind(t, t),
  ]);
  const tables = ['members', 'member_prefs', 'deliveries', 'settings'];
  const snapshot = async () => Promise.all(tables.map(async (table) => (await db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results));
  const before = await snapshot();

  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));

  const after = await snapshot();
  const added: Record<string, string> = { member_prefs: 'house_speakers', deliveries: 'speakers' };
  tables.forEach((table, i) => {
    const col = added[table];
    expect(after[i], table).toEqual(col ? before[i].map((r) => ({ ...r, [col]: null })) : before[i]);
  });
  expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
});
