// SPEC §7G, §10 — the 💪 Task buddy: /tasks. Only the task's own member reaches a task (404 for anyone else). Each route
// validates, runs the task-moves.ts transition and saves it through task-rows.ts; it never decides a transition.
import { Hono, type Context } from 'hono';
import type { AppEnv } from '../env';
import { TASK_MOOD, isOneOf, type Channel } from '../../shared/vocab';
import { TASK_BREAK_CHOICES, TASK_BREAK_MIN, TASK_INTERVAL_DEFAULT, isTaskId, parseTaskEdit, parseTaskInput } from '../../shared/tasks';
import {
  TASK_REFUSAL, againMove, checkinMove, editMove, endMove, pauseMove, resumeMove, startMove, type TaskMove, type TaskRefusal,
} from '../../shared/task-moves';
import { FOUNDER_SQL, first, newId, nowIso } from '../db';
import { body, fail } from '../http';
import { requireMember } from '../session';
import {
  applyTaskMove, lastTask, loadTask, myOpenTask, newTaskWrites, openTaskFire, recentTasks, taskView, type LoadedTask,
} from '../task-rows';

export const tasks = new Hono<AppEnv>();

/** The task in the path, if it is mine — else a 404. Also used by routes/task-photos.ts. */
export async function loadMine(c: Context<AppEnv>): Promise<LoadedTask | Response> {
  const id = c.req.param('id') ?? '';
  const t = isTaskId(id) ? await loadTask(c.env.DB, id) : null;
  if (!t || t.session.member_id !== c.get('member').id) return fail(c, 404, 'not_found', 'That task is gone.');
  return t;
}

/** Answers a refusal, or saves the move and answers `{ task, said }`. */
async function save(c: Context<AppEnv>, before: LoadedTask | null, m: TaskMove | TaskRefusal, now: string) {
  if (typeof m === 'string') return fail(c, 409, m, TASK_REFUSAL[m]);
  const db = c.env.DB;
  try {
    if (before) {
      if (!(await applyTaskMove(db, before, m, now))) return fail(c, 409, 'conflict', 'That task just changed. Have another look.');
    } else await db.batch(newTaskWrites(db, m, now));
  } catch (e) {
    if (!/UNIQUE|constraint/i.test(String(e))) throw e;
    return fail(c, 409, before ? 'conflict' : 'busy', before ? 'That task just changed. Have another look.' : TASK_REFUSAL.busy);
  }
  return c.json({ task: await taskView(db, (await loadTask(db, m.session.id))!, now), said: m.said }, before ? 200 : 201);
}

/** A move on my task named in the path, given its open check-in. */
function on(run: (t: LoadedTask, open: Awaited<ReturnType<typeof openTaskFire>>, b: Record<string, unknown>, now: string) => TaskMove | TaskRefusal | string) {
  return async (c: Context<AppEnv>) => {
    const t = await loadMine(c);
    if (t instanceof Response) return t;
    const now = nowIso();
    const m = run(t, await openTaskFire(c.env.DB, t.session.id), await body(c), now);
    if (typeof m === 'string' && !(m in TASK_REFUSAL)) return fail(c, 400, 'invalid_input', m);
    return save(c, t, m as TaskMove | TaskRefusal, now);
  };
}

tasks.get('/tasks', requireMember, async (c) => {
  const db = c.env.DB, me = c.get('member').id, now = nowIso();
  const [open, recent, last] = await Promise.all([myOpenTask(db, me), recentTasks(db, me), lastTask(db, me)]);
  const founder = (await first<{ id: string }>(db, FOUNDER_SQL))?.id === me;
  const defaults = last
    ? { intervalMin: last.timer.interval_min, channels: last.timer.channels, private: last.session.private }
    : { intervalMin: TASK_INTERVAL_DEFAULT, channels: (founder ? ['push', 'house', 'funhouse'] : ['push', 'house']) as Channel[], private: false }; // ⚑ Q301
  return c.json({
    active: open ? await taskView(db, open, now) : null,
    recent: await Promise.all(recent.map((t) => taskView(db, t, now))),
    defaults,
  });
});

tasks.post('/tasks', requireMember, async (c) => {
  const input = parseTaskInput(await body(c));
  if (typeof input === 'string') return fail(c, 400, 'invalid_input', input);
  const me = c.get('member').id, now = nowIso();
  if (await myOpenTask(c.env.DB, me)) return fail(c, 409, 'busy', TASK_REFUSAL.busy);
  return save(c, null, startMove(newId('task'), me, input, now), now);
});

tasks.post('/tasks/:id/again', requireMember, async (c) => {
  const t = await loadMine(c);
  if (t instanceof Response) return t;
  const now = nowIso();
  if (await myOpenTask(c.env.DB, t.session.member_id)) return fail(c, 409, 'busy', TASK_REFUSAL.busy);
  return save(c, null, againMove(t.session, t.timer, newId('task'), now), now);
});

tasks.post('/tasks/:id/checkin', requireMember, on((t, open, b, now) => {
  if (!isOneOf(TASK_MOOD, b.mood)) return `mood must be one of: ${TASK_MOOD.join(', ')}.`;
  const breakMin = b.breakMin === undefined ? TASK_BREAK_MIN : b.breakMin;
  if (!(TASK_BREAK_CHOICES as readonly unknown[]).includes(breakMin)) return `A break is ${TASK_BREAK_CHOICES.join(', ')} minutes.`;
  return checkinMove(t.session, t.timer, open, b.mood, breakMin as number, now);
}));

tasks.patch('/tasks/:id', requireMember, on((t, open, b, now) => {
  const e = parseTaskEdit(b);
  return typeof e === 'string' ? e : editMove(t.session, t.timer, open, e, now);
}));

tasks.post('/tasks/:id/pause', requireMember, on((t, open, _b, now) => pauseMove(t.session, t.timer, open, now)));
tasks.post('/tasks/:id/resume', requireMember, on((t, open, _b, now) => resumeMove(t.session, t.timer, open, now)));
tasks.post('/tasks/:id/stop', requireMember, on((t, open, _b, now) => endMove(t.session, t.timer, open, 'stopped', null, now)));
tasks.post('/tasks/:id/finish', requireMember, on((t, open, b, now) => {
  if (b.ticked !== undefined && (!Array.isArray(b.ticked) || !b.ticked.every((n) => Number.isInteger(n)))) return 'ticked must be a list of line numbers.';
  return endMove(t.session, t.timer, open, 'finished', (b.ticked as number[] | undefined) ?? [], now);
}));
