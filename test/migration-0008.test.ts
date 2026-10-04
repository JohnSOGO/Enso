// D12 (SPEC §4.2g) — 0008 rebuilds `fires` again (kind 'thing' + thing_id); fires of every earlier
// kind and their deliveries survive it. Runs on MIGRATION_DB, which no setup file migrates.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('D12 every fire kind and delivery is intact after 0008', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0008'));
  expect(at).toBe(7);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  const t = '2026-10-01T00:00:00.000Z';
  await db.batch([
    db.prepare(`INSERT INTO members (id, email, display_name, color, role, password_hash, created_at)
                VALUES ('mem_1', 'a@example.com', 'A', '#FF6B35', 'owner', 'x', ?)`).bind(t),
    db.prepare(`INSERT INTO events (id, title, start_date, end_date, created_by, created_at, updated_at)
                VALUES ('evt_1', 'Meds', '2026-10-01', '2026-10-01', 'mem_1', ?, ?)`).bind(t, t),
    db.prepare(`INSERT INTO timers (id, title, interval_min, channels, created_by, created_at, updated_at)
                VALUES ('tmr_1', 'Dog', 60, '["push"]', 'mem_1', ?, ?)`).bind(t, t),
    db.prepare(`INSERT INTO chores (id, title, days, timing, time, people, steps, channels, start_date, created_by, created_at, updated_at)
                VALUES ('chr_1', 'Trash', '["TU"]', 'at', '19:00', '["mem_1"]', '[{"title":"Trash"}]', '["push"]', '2026-10-01', 'mem_1', ?, ?)`).bind(t, t),
    db.prepare(`INSERT INTO chore_runs (id, chore_id, date, assignee_id, step, created_at, updated_at)
                VALUES ('run_1', 'chr_1', '2026-10-06', 'mem_1', 0, ?, ?)`).bind(t, t),
    db.prepare(`INSERT INTO fires (id, kind, event_id, occurrence_date, due_at, state, alert_count, last_alerted_at)
                VALUES ('fire_r', 'reminder', 'evt_1', '2026-10-01', ?, 'ringing', 1, ?)`).bind(t, t),
    db.prepare(`INSERT INTO fires (id, kind, timer_id, due_at, state, close_reason, closed_by, closed_at)
                VALUES ('fire_t', 'timer', 'tmr_1', ?, 'closed', 'acked', 'mem_1', ?)`).bind(t, t),
    db.prepare(`INSERT INTO fires (id, kind, chore_run_id, due_at, state)
                VALUES ('fire_c', 'chore', 'run_1', ?, 'scheduled')`).bind(t),
    db.prepare(`INSERT INTO deliveries (id, fire_id, alert_number, channel, message, status, created_at, updated_at)
                VALUES ('dlv_1', 'fire_r', 1, 'house', 'Reminder: Meds', 'queued', ?, ?)`).bind(t, t),
    db.prepare(`INSERT INTO deliveries (id, fire_id, alert_number, channel, member_id, message, status, created_at, updated_at)
                VALUES ('dlv_2', 'fire_c', 1, 'push', 'mem_1', 'Chore for A: Trash', 'sent', ?, ?)`).bind(t, t),
  ]);
  const before = (await db.prepare('SELECT * FROM fires ORDER BY id').all<Record<string, unknown>>()).results;
  const deliveriesBefore = (await db.prepare('SELECT * FROM deliveries ORDER BY id').all()).results;
  expect(before).toHaveLength(3);

  await applyD1Migrations(db, env.TEST_MIGRATIONS);

  const after = (await db.prepare('SELECT * FROM fires ORDER BY id').all<Record<string, unknown>>()).results;
  expect(after).toEqual(before.map((f) => ({ ...f, thing_id: null, machine_id: null }))); // 0014 adds machine_id
  // Every later migration is applied too: 0022 (§4.2u) adds deliveries.title and 0024 (§4.2w) deliveries.speakers, NULL on every older row.
  expect((await db.prepare('SELECT * FROM deliveries ORDER BY id').all()).results).toEqual(deliveriesBefore.map((d) => ({ ...d, title: null, speakers: null })));
  expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);

  // The new kind: a thing fire is accepted, and a second open one for the same thing + date is refused.
  await db.batch([
    db.prepare(`INSERT INTO things (id, title, created_by, created_at, updated_at) VALUES ('thg_1', 'Fall fair', 'mem_1', ?, ?)`).bind(t, t),
    db.prepare(`INSERT INTO fires (id, kind, thing_id, occurrence_date, due_at, state)
                VALUES ('fire_g', 'thing', 'thg_1', '2026-10-10', ?, 'scheduled')`).bind(t),
  ]);
  await expect(db.prepare(`INSERT INTO fires (id, kind, thing_id, occurrence_date, due_at, state)
                           VALUES ('fire_g2', 'thing', 'thg_1', '2026-10-10', ?, 'scheduled')`).bind(t).run()).rejects.toThrow(/UNIQUE/);
  // The rebuilt table keeps the earlier indexes too.
  await expect(db.prepare(`INSERT INTO fires (id, kind, event_id, occurrence_date, due_at, state)
                           VALUES ('fire_r2', 'reminder', 'evt_1', '2026-10-01', ?, 'scheduled')`).bind(t).run()).rejects.toThrow(/UNIQUE/);
});
