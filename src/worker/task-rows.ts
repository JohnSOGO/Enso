// SPEC §7G, §4.2zz — the task session rows, for routes/tasks.ts and routes/task-photos.ts: a session with its timer,
// its one open check-in fire, mine open / recent / last, the writes a move needs, and the Task wire shape. No Hono;
// never decides (task-moves.ts does).
import { taskFromRow, taskWire, TASK_MAX_ALERTS, TASK_RECENT_MAX, TASK_RENOTIFY_MIN, type Task, type TaskRow, type TaskSession, type TaskTimer } from '../shared/tasks';
import type { TaskMove } from '../shared/task-moves';
import type { FireRow } from '../shared/engine';
import type { Channel } from '../shared/vocab';
import { all, first, parseJson } from './db';
import { insertFire, updateFire } from './fire-rows';

type Joined = TaskRow & { title: string; interval_min: number; channels: string; running: number };
export interface LoadedTask { session: TaskSession; timer: TaskTimer; updatedAt: string }

const SELECT = `SELECT ts.*, t.title, t.interval_min, t.channels, t.running FROM task_sessions ts JOIN timers t ON t.id = ts.id`;

const loaded = (r: Joined): LoadedTask => ({
  session: taskFromRow(r), updatedAt: r.updated_at,
  timer: { title: r.title, interval_min: r.interval_min, channels: parseJson<Channel[]>(r.channels, []), running: r.running === 1 },
});

export async function loadTask(db: D1Database, id: string): Promise<LoadedTask | null> {
  const r = await first<Joined>(db, `${SELECT} WHERE ts.id = ?`, id);
  return r ? loaded(r) : null;
}

export const openTaskFire = (db: D1Database, id: string) =>
  first<FireRow>(db, `SELECT * FROM fires WHERE timer_id = ? AND state != 'closed'`, id);

export async function myOpenTask(db: D1Database, memberId: string): Promise<LoadedTask | null> {
  const r = await first<Joined>(db, `${SELECT} WHERE ts.member_id = ? AND ts.ended_at IS NULL`, memberId);
  return r ? loaded(r) : null;
}

/** My last ended sessions, newest first (§7G.6 Recent). */
export async function recentTasks(db: D1Database, memberId: string): Promise<LoadedTask[]> {
  return (await all<Joined>(db, `${SELECT} WHERE ts.member_id = ? AND ts.ended_at IS NOT NULL ORDER BY ts.ended_at DESC LIMIT ?`,
    memberId, TASK_RECENT_MAX)).map(loaded);
}

/** My newest session of any state: a new form starts from its interval, channels and Private (§7G.2). */
export async function lastTask(db: D1Database, memberId: string): Promise<LoadedTask | null> {
  const r = await first<Joined>(db, `${SELECT} WHERE ts.member_id = ? ORDER BY ts.started_at DESC LIMIT 1`, memberId);
  return r ? loaded(r) : null;
}

export async function taskView(db: D1Database, t: LoadedTask, now: string): Promise<Task> {
  const f = t.session.ended_at ? null : await openTaskFire(db, t.session.id);
  return taskWire(t.session, t.timer, f ? { id: f.id, dueAt: f.due_at, state: f.state, alertCount: f.alert_count } : null, now);
}

function sessionCols(s: TaskSession) {
  return [s.limit_min, JSON.stringify(s.done_looks), s.private ? 1 : 0, s.worked_ms, s.working_since, s.break_until, s.paused_at,
    s.since_break, JSON.stringify(s.checkins), s.ended_at, s.outcome, s.done_ticked === null ? null : JSON.stringify(s.done_ticked)];
}

/** A new session: its timer row (assigned to me, one nudge then quiet, §7G.3), its session row and its first check-in. */
export function newTaskWrites(db: D1Database, m: TaskMove, now: string): D1PreparedStatement[] {
  const s = m.session, t = m.timer;
  return [
    db.prepare(`INSERT INTO timers (id, title, interval_min, channels, renotify_min, max_alerts, assigned_to, running, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(s.id, t.title, t.interval_min, JSON.stringify(t.channels), TASK_RENOTIFY_MIN, TASK_MAX_ALERTS,
      JSON.stringify([s.member_id]), t.running ? 1 : 0, s.member_id, now, now),
    db.prepare(`INSERT INTO task_sessions (limit_min, done_looks, private, worked_ms, working_since, break_until, paused_at, since_break, checkins,
      ended_at, outcome, done_ticked, id, member_id, started_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(...sessionCols(s), s.id, s.member_id, s.started_at, now),
    ...(m.newFire ? [insertFire(db, m.newFire)] : []),
  ];
}

/**
 * A move on an existing session. The session row is written first, guarded by its `updated_at` as read: 0 changes means
 * another tap got there first (→ false, nothing else written). Then the timer and the fires.
 */
export async function applyTaskMove(db: D1Database, before: LoadedTask, m: TaskMove, now: string): Promise<boolean> {
  const r = await db.prepare(`UPDATE task_sessions SET limit_min = ?, done_looks = ?, private = ?, worked_ms = ?, working_since = ?, break_until = ?,
      paused_at = ?, since_break = ?, checkins = ?, ended_at = ?, outcome = ?, done_ticked = ?, updated_at = ? WHERE id = ? AND updated_at = ?`)
    .bind(...sessionCols(m.session), now, m.session.id, before.updatedAt).run();
  if (!r.meta.changes) return false;
  const t = m.timer;
  await db.batch([
    db.prepare('UPDATE timers SET interval_min = ?, channels = ?, running = ?, updated_at = ? WHERE id = ?')
      .bind(t.interval_min, JSON.stringify(t.channels), t.running ? 1 : 0, now, m.session.id),
    ...(m.closeFire ? [updateFire(db, m.closeFire)] : []),
    ...(m.newFire ? [insertFire(db, m.newFire)] : []),
  ]);
  return true;
}
