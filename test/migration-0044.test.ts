// BT-M (SPEC §4.2zq) — 0044 adds chores.bounty, bounties, earnings and the two delivery pointers: earlier rows survive
// with the new columns NULL; an earning per bounty and per run can be written. Runs on MIGRATION_DB, which no setup
// file migrates.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('BT-M chores, runs and deliveries survive 0044; earnings can be written', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0044'));
  expect(at).toBeGreaterThan(0);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  const t = '2026-10-11T18:00:00.000Z';
  await db.prepare(`INSERT INTO members (id, email, display_name, color, role, password_hash, created_at) VALUES ('mem_a', 'a@x', 'A', '#123456', 'owner', 'x', ?)`).bind(t).run();
  await db.prepare(`INSERT INTO chores (id, title, days, timing, time, people, steps, channels, start_date, created_by, created_at, updated_at)
    VALUES ('chr_1', 'Trash', '["TU"]', 'by', '19:00', '["mem_a"]', '[{"title":"Trash"}]', '["push"]', '2026-10-11', 'mem_a', ?, ?)`).bind(t, t).run();
  await db.prepare(`INSERT INTO chore_runs (id, chore_id, date, step, created_at, updated_at) VALUES ('run_1', 'chr_1', '2026-10-13', 0, ?, ?)`).bind(t, t).run();
  await db.prepare(`INSERT INTO deliveries (id, alert_number, channel, member_id, message, title, status, created_at, updated_at)
    VALUES ('dlv_1', 1, 'push', 'mem_a', 'hi', '🤖 Claude', 'sent', ?, ?)`).bind(t, t).run();
  const rows = async (table: string) => (await db.prepare(`SELECT * FROM ${table} ORDER BY id`).all<any>()).results;
  const [chores, runs, deliveries] = [await rows('chores'), await rows('chore_runs'), await rows('deliveries')];

  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));

  expect(await rows('chores')).toEqual(chores.map((c) => ({ ...c, bounty: null })));
  expect(await rows('chore_runs')).toEqual(runs);
  expect(await rows('deliveries')).toEqual(deliveries.map((d) => ({ ...d, bounty_id: null, earning_id: null })));
  await db.prepare(`INSERT INTO bounties (id, title, points, created_by, created_at) VALUES ('bty_1', 'Toilet', 3, 'mem_a', ?)`).bind(t).run();
  await db.prepare(`INSERT INTO earnings (id, bounty_id, member_id, points, done_at) VALUES ('ern_1', 'bty_1', 'mem_a', 3, ?)`).bind(t).run();
  await db.prepare(`INSERT INTO earnings (id, chore_run_id, member_id, points, done_at) VALUES ('ern_2', 'run_1', 'mem_a', 2, ?)`).bind(t).run();
  await expect(db.prepare(`INSERT INTO earnings (id, bounty_id, member_id, points, done_at) VALUES ('ern_3', 'bty_1', 'mem_a', 3, ?)`).bind(t).run()).rejects.toThrow();
  await expect(db.prepare(`INSERT INTO earnings (id, member_id, points, done_at) VALUES ('ern_4', 'mem_a', 3, ?)`).bind(t).run()).rejects.toThrow();
  expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
});
