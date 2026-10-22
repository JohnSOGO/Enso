// IOU-M2 (SPEC §4.2zzh) — 0061 adds declined_at / declined_by to ious and iou_payments and deliveries.iou_row_id: rows
// written before it survive with the new columns NULL.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('0061 keeps IOUs, payments and deliveries, not declined', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0061'));
  expect(at).toBeGreaterThan(0);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  const T = '2026-10-22T00:00:00Z';
  for (const id of ['mem_a', 'mem_b']) {
    await db.prepare(`INSERT INTO members (id, email, display_name, color, role, password_hash, created_at) VALUES (?, ?, 'X', '#123456', 'owner', 'x', ?)`).bind(id, `${id}@x`, T).run();
  }
  await db.prepare(`INSERT INTO ious (id, owed_by, owed_to, cents, created_by, created_at) VALUES ('iou_1', 'mem_a', 'mem_b', 100, 'mem_b', ?)`).bind(T).run();
  await db.prepare(`INSERT INTO iou_payments (id, owed_by, owed_to, cents, how, created_by, created_at) VALUES ('iop_1', 'mem_a', 'mem_b', 5, 'paid', 'mem_a', ?)`).bind(T).run();
  await db.prepare(`INSERT INTO deliveries (id, alert_number, channel, member_id, message, title, status, created_at, updated_at)
    VALUES ('dlv_old', 1, 'push', 'mem_a', 'm', 't', 'sent', ?, ?)`).bind(T, T).run();
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));
  expect(await db.prepare(`SELECT id, declined_at, declined_by FROM ious`).first()).toEqual({ id: 'iou_1', declined_at: null, declined_by: null });
  expect(await db.prepare(`SELECT id, declined_at, declined_by FROM iou_payments`).first()).toEqual({ id: 'iop_1', declined_at: null, declined_by: null });
  expect(await db.prepare(`SELECT id, iou_row_id FROM deliveries`).first()).toEqual({ id: 'dlv_old', iou_row_id: null });
});
