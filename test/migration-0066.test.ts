// FI-M (SPEC §4.2zzm) — 0066 adds the fishing settings, tables and marks: an existing member gets 🎣 off, 30 min and no
// ping; settings and deliveries rows survive with the new columns NULL; the new tables start empty.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('0066 adds the fishing columns and tables', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0066'));
  expect(at).toBeGreaterThan(0);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  await db.prepare(`INSERT INTO members (id, email, display_name, color, role, password_hash, created_at) VALUES ('mem_a', 'a@x', 'A', '#FF6B35', 'owner', 'x', 'T')`).run();
  await db.prepare(`INSERT INTO member_prefs (member_id) VALUES ('mem_a')`).run();
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));
  expect(await db.prepare('SELECT show_fishing, fishing_range, fishing_alert FROM member_prefs').first()).toEqual({ show_fishing: 0, fishing_range: 30, fishing_alert: 0 });
  expect(await db.prepare('SELECT coast_tried_at, fish_events_tried_at FROM settings WHERE id = 1').first()).toEqual({ coast_tried_at: null, fish_events_tried_at: null });
  for (const t of ['tide_turns', 'coast_days', 'fish_events']) expect((await db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first<{ n: number }>())!.n).toBe(0);
  await expect(db.prepare(`INSERT INTO tide_turns (station, at, kind, height_ft, fetched_at) VALUES ('9410230', 'T', 'X', 1, 'T')`).run()).rejects.toThrow();
});
