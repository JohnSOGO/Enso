// IOU-M (SPEC §4.2zzf) — 0059 adds the IOU tables and deliveries.iou_plan_id: a delivery written before it survives with
// the column NULL; 0 cents, an unknown how or every, and a second live plan in one direction are refused.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('0059 keeps deliveries and guards the IOU tables', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0059'));
  expect(at).toBeGreaterThan(0);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
  const T = '2026-10-20T00:00:00Z';
  for (const id of ['mem_a', 'mem_b']) {
    await db.prepare(`INSERT INTO members (id, email, display_name, color, role, password_hash, created_at) VALUES (?, ?, 'X', '#123456', 'owner', 'x', ?)`).bind(id, `${id}@x`, T).run();
  }
  await db.prepare(`INSERT INTO deliveries (id, alert_number, channel, member_id, message, title, status, created_at, updated_at)
    VALUES ('dlv_old', 1, 'push', 'mem_a', 'm', 't', 'sent', ?, ?)`).bind(T, T).run();
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));
  expect(await db.prepare(`SELECT id, iou_plan_id FROM deliveries`).first()).toEqual({ id: 'dlv_old', iou_plan_id: null });
  const iou = (id: string, cents: number) => db.prepare(`INSERT INTO ious (id, owed_by, owed_to, cents, created_by, created_at) VALUES (?, 'mem_a', 'mem_b', ?, 'mem_a', ?)`).bind(id, cents, T).run();
  await iou('iou_1', 100);
  await expect(iou('iou_0', 0)).rejects.toThrow();
  const payment = (how: string) => db.prepare(`INSERT INTO iou_payments (id, owed_by, owed_to, cents, how, created_by, created_at) VALUES (?, 'mem_a', 'mem_b', 5, ?, 'mem_a', ?)`).bind(`iop_${how}`, how, T).run();
  await payment('let_go');
  await payment('tab');
  await expect(payment('forgiven')).rejects.toThrow();
  const plan = (id: string, every: string) => db.prepare(`INSERT INTO iou_plans (id, owed_by, owed_to, cents_each, every, start_date, created_by, created_at) VALUES (?, 'mem_a', 'mem_b', 5, ?, '2026-10-23', 'mem_a', ?)`).bind(id, every, T).run();
  await expect(plan('ipl_bad', 'daily')).rejects.toThrow();
  await plan('ipl_1', 'week');
  await expect(plan('ipl_2', 'month')).rejects.toThrow();
  await db.prepare(`UPDATE iou_plans SET ended_at = ? WHERE id = 'ipl_1'`).bind(T).run();
  await plan('ipl_2', 'month');
});
