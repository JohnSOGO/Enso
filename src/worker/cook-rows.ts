// SPEC §7D.8 — the cooking-timer rows, shared by routes/cooking.ts and tick step 3e (the end of the day). No Hono; the
// rules are src/shared/cooking.ts.
import type { FireRow } from '../shared/engine';
import { closeCook, cookExpired, type CookChange, type CookRow } from '../shared/cooking';
import type { Env } from './env';
import { all, householdTz } from './db';
import { insertFire, updateFire } from './fire-rows';

/** The open timers, oldest first. */
export const openCooks = (db: D1Database) =>
  all<CookRow>(db, 'SELECT * FROM machines WHERE cook_kind IS NOT NULL AND closed_at IS NULL ORDER BY created_at, id');

export const openCookFire = async (db: D1Database, id: string) =>
  (await all<FireRow>(db, `SELECT * FROM fires WHERE machine_id = ? AND state != 'closed'`, id))[0] ?? null;

/**
 * One change's writes, for one batch. `before` = the row as read (null on Create, which inserts it). The row is guarded
 * by its `updated_at` as read: if another tap changed it first, the guard's INSERT collides with the row's own id, so the
 * whole batch fails and rolls back (fire writes included).
 */
export function cookWrites(db: D1Database, before: CookRow | null, c: CookChange): D1PreparedStatement[] {
  const r = c.row;
  const stmts: D1PreparedStatement[] = before === null
    ? [db.prepare(`INSERT INTO machines (id, cook_kind, name, owner_id, started_by, alert_id, minutes, started_at, done_at, created_at, updated_at, closed_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(r.id, r.cook_kind, r.name, r.owner_id, r.started_by, r.alert_id, r.minutes, r.started_at, r.done_at, r.created_at, r.updated_at, r.closed_at)]
    : [
        db.prepare(`INSERT INTO machines (id) SELECT ? WHERE NOT EXISTS (SELECT 1 FROM machines WHERE id = ? AND updated_at IS ?)`)
          .bind(r.id, r.id, before.updated_at),
        db.prepare(`UPDATE machines SET cook_kind = ?, name = ?, owner_id = ?, started_by = ?, alert_id = ?, minutes = ?, started_at = ?, done_at = ?,
                      updated_at = ?, closed_at = ? WHERE id = ? AND updated_at IS ?`)
          .bind(r.cook_kind, r.name, r.owner_id, r.started_by, r.alert_id, r.minutes, r.started_at, r.done_at, r.updated_at, r.closed_at, r.id, before.updated_at),
      ];
  if (c.closeFire) stmts.push(updateFire(db, c.closeFire));
  if (c.newFire) stmts.push(insertFire(db, c.newFire));
  return stmts;
}

/** Tick step 3e (§5.6): close every open timer `cookExpired` names, as ✕ does with nobody. A lost guard is skipped. */
export async function cookDayTick(env: Env, now: string): Promise<void> {
  const db = env.DB;
  const rows = await openCooks(db);
  if (!rows.length) return;
  const tz = await householdTz(db);
  for (const r of rows) {
    const fire = await openCookFire(db, r.id);
    if (!cookExpired(r, fire, tz, now)) continue;
    try { await db.batch(cookWrites(db, r, closeCook(r, fire, null, now))); }
    catch (e) { console.error('cookDayTick', r.id, e); }
  }
}
