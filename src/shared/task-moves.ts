// SPEC §7G.2–7G.6 — the task session's transitions: start, again, a check-in answer (and a break), pause, resume, the
// changes (interval, Check on me in N, more time, quiet), finish and stop. Each says what becomes of the session, its
// timer and its one open check-in fire, and what Enso says — or refuses. Pure; the routes only validate and persist.
import type { Channel, TaskMood } from './vocab';
import { closeFire, newTimerFire, type FireRow, type NewFire } from './engine';
import {
  TASK_CHECKINS_MAX, TASK_LIMIT_MAX, nextCheckinDue, taskState, workedMs,
  type EditInput, type StartInput, type TaskSession, type TaskTimer,
} from './tasks';
import { taskReply, taskSaid } from './task-replies';
import { addMinutes } from './time';

export interface TaskMove { session: TaskSession; timer: TaskTimer; closeFire?: FireRow; newFire?: NewFire; said: string }
export type TaskRefusal = 'busy' | 'ended' | 'not_working' | 'not_paused' | 'not_stopped';

export const TASK_REFUSAL: Record<TaskRefusal, string> = {
  busy: 'You already have a task going. Finish or stop it first.',
  ended: 'That task is already over.',
  not_working: "That task isn't running right now.",
  not_paused: "That task isn't paused or on a break.",
  not_stopped: 'Only a stopped task can be picked up again.',
};

/** Banks the running stretch: working stops (a break, a pause, the end). */
const bank = (s: TaskSession, now: string): TaskSession => ({ ...s, worked_ms: workedMs(s, now), working_since: null });
/** Working again from `now`; after a break or a pause the long-break count restarts. */
const backToWork = (s: TaskSession, now: string): TaskSession => ({ ...s, working_since: now, break_until: null, paused_at: null, since_break: now });

/** The move's fire half: close the open check-in (when there is one) and maybe plan the next. */
function withFires(m: Omit<TaskMove, 'closeFire' | 'newFire'>, open: FireRow | null, reason: FireRow['close_reason'], due: string | null,
  memberId: string, now: string): TaskMove {
  return {
    ...m,
    ...(open && reason ? { closeFire: closeFire(open, reason, memberId, now) } : {}),
    ...(due ? { newFire: newTimerFire(m.session.id, due) } : {}),
  };
}

/** §7G.2 Start: a new session working from now, its first check-in one interval away. */
export function startMove(id: string, memberId: string, input: StartInput, now: string): TaskMove {
  const session: TaskSession = {
    id, member_id: memberId, limit_min: input.limitMin, done_looks: input.doneLooks, private: input.private, started_at: now,
    worked_ms: 0, working_since: now, break_until: null, paused_at: null, since_break: now, checkins: [], ended_at: null,
    outcome: null, done_ticked: null,
  };
  const timer = { title: input.title, interval_min: input.intervalMin, channels: input.channels, running: true };
  return withFires({ session, timer, said: taskSaid.start(input.title, input.intervalMin, input.limitMin) }, null, null,
    nextCheckinDue(session, now, input.intervalMin), memberId, now);
}

/** §7G.6 Pick it up again: a stopped session's title, done list, interval, channels and Private, started now. */
export function againMove(old: TaskSession, t: TaskTimer, id: string, now: string): TaskMove | TaskRefusal {
  if (old.outcome !== 'stopped') return 'not_stopped';
  return startMove(id, old.member_id, {
    title: t.title, limitMin: old.limit_min, intervalMin: t.interval_min, doneLooks: old.done_looks, channels: t.channels, private: old.private,
  }, now);
}

/**
 * §7G.3 — a check-in answer. A break moves the check-in to the break's end; any other answer ends a break first and the
 * next check-in comes one interval later. Enso's reply is logged with it, so the next one differs.
 */
export function checkinMove(s: TaskSession, t: TaskTimer, open: FireRow | null, mood: TaskMood, breakMin: number, now: string): TaskMove | TaskRefusal {
  if (taskState(s) === 'ended') return 'ended';
  const said = taskReply(s, mood, breakMin);
  const checkins = [...s.checkins, { at: now, mood, said }].slice(-TASK_CHECKINS_MAX);
  const working = taskState(s) === 'working' ? s : backToWork(s, now);
  const session = mood === 'break'
    ? { ...bank(working, now), break_until: addMinutes(now, breakMin), checkins }
    : { ...working, checkins };
  const due = mood === 'break' ? session.break_until! : nextCheckinDue(session, now, t.interval_min);
  return withFires({ session, timer: { ...t, running: true }, said }, open, 'acked', due, s.member_id, now);
}

/** §7G.5 Pause: working time stops and so do the check-ins, until Resume. Working or on a break. */
export function pauseMove(s: TaskSession, t: TaskTimer, open: FireRow | null, now: string): TaskMove | TaskRefusal {
  const st = taskState(s);
  if (st === 'ended') return 'ended';
  if (st === 'paused') return 'not_working';
  const session = { ...bank(s, now), break_until: null, paused_at: now };
  return withFires({ session, timer: { ...t, running: false }, said: taskSaid.pause(s) }, open, 'stopped', null, s.member_id, now);
}

/** §7G.5 Resume, and Back to it on a break: working again, a check-in one interval later. */
export function resumeMove(s: TaskSession, t: TaskTimer, open: FireRow | null, now: string): TaskMove | TaskRefusal {
  const st = taskState(s);
  if (st === 'ended') return 'ended';
  if (st === 'working') return 'not_paused';
  const session = backToWork(s, now);
  return withFires({ session, timer: { ...t, running: true }, said: taskSaid.resume(s) }, open, 'superseded',
    nextCheckinDue(session, now, t.interval_min), s.member_id, now);
}

/**
 * §7G.5 — the changes while it runs. A new interval or "check on me in N" re-plans the open check-in from now; more
 * time grows the limit (an open-ended task becomes timed at its working time + N); quiet drops House and FunHouse.
 * A re-plan happens only while working: a break keeps its end, a pause has no check-in.
 */
export function editMove(s: TaskSession, t: TaskTimer, open: FireRow | null, e: EditInput, now: string): TaskMove | TaskRefusal {
  if (taskState(s) === 'ended') return 'ended';
  const workedMin = Math.ceil(workedMs(s, now) / 60_000);
  const session = e.addMin ? { ...s, limit_min: Math.min(TASK_LIMIT_MAX, Math.max(s.limit_min ?? 0, workedMin) + e.addMin) } : s;
  const timer: TaskTimer = {
    ...t, interval_min: e.intervalMin ?? t.interval_min,
    channels: e.quiet ? t.channels.filter((c): c is Channel => c === 'push') : t.channels,
  };
  const said = e.nextInMin ? taskSaid.soon(e.nextInMin) : e.addMin ? taskSaid.more(e.addMin) : e.intervalMin ? taskSaid.interval(e.intervalMin) : taskSaid.quiet();
  const replan = taskState(s) === 'working' && (e.nextInMin || e.addMin || e.intervalMin);
  const due = replan ? nextCheckinDue(session, now, e.nextInMin ?? timer.interval_min) : null;
  return withFires({ session, timer, said }, open, replan ? 'superseded' : null, due, s.member_id, now);
}

/** §7G.6 Finish (with the done lines ticked) or Stop: working time banked, the session ended, its check-in closed. */
export function endMove(s: TaskSession, t: TaskTimer, open: FireRow | null, outcome: 'finished' | 'stopped', ticked: number[] | null, now: string): TaskMove | TaskRefusal {
  if (taskState(s) === 'ended') return 'ended';
  const done = outcome === 'finished'
    ? [...new Set(ticked ?? [])].filter((n) => Number.isInteger(n) && n >= 0 && n < s.done_looks.length).sort((a, b) => a - b) : null;
  const session = { ...bank(s, now), break_until: null, paused_at: null, ended_at: now, outcome, done_ticked: done };
  const said = outcome === 'finished' ? taskSaid.finish(session, t.title) : taskSaid.stop(session, t.title);
  return withFires({ session, timer: { ...t, running: false }, said }, open, outcome === 'finished' ? 'done' : 'stopped', null, s.member_id, now);
}
