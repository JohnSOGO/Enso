// SPEC §7B.8 — writing earnings, shared by routes/bounties.ts (a one-off's Done) and routes/chores.ts (a run's last
// step, and its undo): the earning row, OK'd at once for an admin, else one waiting push per active admin. Returns
// statements for the caller's own batch, the push ids it sends after and an undone earning's photo key it deletes
// after; never sends, never touches R2, never decides, no Hono.
import { all, first, newId } from './db';
import { pushDelivery } from './deliveries';
import { ADMIN_ROLE } from '../shared/roles';
import { WAITING_TITLE, okAtOnce, runEarningChange, waitingMessage } from '../shared/bounties';

export interface Finisher { id: string; admin: boolean }
/** `dropKey`: the dropped earning's done photo, for the caller to delete from R2 after its batch (§7B.8). */
export interface EarningWrites { stmts: D1PreparedStatement[]; pushIds: string[]; dropKey?: string | null }

/** One earning for `finisher`: the row, and, unless an admin OKs it at once, the waiting push to each active admin. */
export async function earningInsert(db: D1Database, on: { bountyId?: string; choreRunId?: string }, finisher: Finisher,
  points: number, title: string, now: string): Promise<EarningWrites> {
  const id = newId('ern'), ok = okAtOnce(finisher, now);
  const stmts = [db.prepare(
    `INSERT INTO earnings (id, bounty_id, chore_run_id, member_id, points, done_at, ok_by, ok_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, on.bountyId ?? null, on.choreRunId ?? null, finisher.id, points, now, ok?.ok_by ?? null, ok?.ok_at ?? null)];
  if (ok) return { stmts, pushIds: [] };
  const admins = await all<{ id: string }>(db, 'SELECT id FROM members WHERE role = ? AND disabled_at IS NULL', ADMIN_ROLE);
  const name = (await first<{ n: string }>(db, 'SELECT display_name AS n FROM members WHERE id = ?', finisher.id))?.n ?? 'Someone';
  const rows = admins.map((a) => pushDelivery(db,
    { memberId: a.id, message: waitingMessage(name, title, points), title: WAITING_TITLE, earningId: id }, now));
  return { stmts: [...stmts, ...rows.map((r) => r.stmt)], pushIds: rows.map((r) => r.id) };
}

/** A chore run's change: just finished → an earning for its finisher at the chore's bounty now; undone → its live
 *  earning dropped. Also returns the chore's bounty, for the run's view. */
export async function runEarningWrites(db: D1Database, choreId: string, before: { id: string; done_at: string | null },
  after: { done_at: string | null }, finisher: Finisher, now: string): Promise<EarningWrites & { bounty: number | null }> {
  const chore = await first<{ bounty: number | null; title: string }>(db, 'SELECT bounty, title FROM chores WHERE id = ?', choreId);
  const bounty = chore?.bounty ?? null, change = runEarningChange(before, after);
  if (change === 'drop') {
    const live = await first<{ photo_key: string | null }>(db, 'SELECT photo_key FROM earnings WHERE chore_run_id = ? AND dropped_at IS NULL', before.id);
    return { bounty, pushIds: [], dropKey: live?.photo_key ?? null, stmts: [db.prepare(
      'UPDATE earnings SET dropped_at = ?, photo_key = NULL WHERE chore_run_id = ? AND dropped_at IS NULL').bind(now, before.id)] };
  }
  if (change === 'earn' && bounty !== null) return { bounty, ...await earningInsert(db, { choreRunId: before.id }, finisher, bounty, chore!.title, now) };
  return { bounty, stmts: [], pushIds: [] };
}
