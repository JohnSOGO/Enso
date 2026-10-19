// SPEC §7G.1, §7G.6 — the 💪 Task buddy's session model: one person's task, ridden on a rolling timer (id task_…) plus a
// task_sessions row. Its limits, derived state, working time, when the next check-in is due, the input rules, the
// summary and the photo check's cleaning. Pure: `now` is always a parameter. Transitions: task-moves.ts; words out:
// task-replies.ts; words in: task-say.ts.
import { CHANNEL, TASK_LOOKS, isOneOf, type Channel, type TaskLooks, type TaskMood, type TaskOutcome } from './vocab';
import { addMinutes, ms } from './time';
import { ALERT_TITLE_MAX } from './alert-limits';

export const isTaskId = (v: unknown): v is string => typeof v === 'string' && v.startsWith('task_');

export const TASK_INTERVAL_DEFAULT = 15; // ⚑ Q301
export const TASK_INTERVAL_MAX = 240;
export const TASK_LIMIT_MAX = 720;
export const TASK_RENOTIFY_MIN = 10; // ⚑ Q302: one nudge, then it waits
export const TASK_MAX_ALERTS = 2;
export const TASK_BREAK_MIN = 10; // ⚑ Q305
export const TASK_BREAK_CHOICES = [5, 10, 15, 30] as const;
export const TASK_SOON_MIN = 5; // ⚑ Q304
export const TASK_LONG_WORK_MIN = 90; // ⚑ Q303
export const TASK_DONE_LOOKS_MAX = 8; // ⚑ Q300
export const TASK_DONE_LOOK_MAX = 80;
export const TASK_CHECKINS_MAX = 200;
export const TASK_RECENT_MAX = 10;
export const TASK_NOTE_MAX = 200;
/** The interval choices on the form (§7G.2); a said one is added when it isn't one of these. */
export const TASK_INTERVAL_CHOICES = [5, 10, 15, 20, 30, 45, 60] as const;
export const TASK_LIMIT_CHOICES = [15, 30, 60, 120] as const;

export const MOOD_EMOJI: Record<TaskMood, string> = { great: '🚀', steady: '👍', distracted: '🦋', struggling: '😩', break: '☕' };
export const MOOD_LABEL: Record<TaskMood, string> = {
  great: 'Great!', steady: 'Steady!', distracted: 'Got distracted', struggling: 'Struggling', break: 'Taking a break',
};

export interface Checkin { at: string; mood: TaskMood; said: string }

/** One task_sessions row as stored (§4.2zz). */
export interface TaskRow {
  id: string; member_id: string; limit_min: number | null; done_looks: string; private: number; started_at: string;
  worked_ms: number; working_since: string | null; break_until: string | null; paused_at: string | null; since_break: string | null;
  checkins: string; ended_at: string | null; outcome: TaskOutcome | null; done_ticked: string | null; updated_at: string;
}

/** The session as the rules see it, JSON parsed. */
export interface TaskSession {
  id: string; member_id: string; limit_min: number | null; done_looks: string[]; private: boolean;
  started_at: string; worked_ms: number; working_since: string | null; break_until: string | null; paused_at: string | null;
  since_break: string | null; checkins: Checkin[]; ended_at: string | null; outcome: TaskOutcome | null; done_ticked: number[] | null;
}

/** The ringing half (the timers row): title, interval, channels, running. */
export interface TaskTimer { title: string; interval_min: number; channels: Channel[]; running: boolean }

const parse = <T>(text: string | null, fallback: T): T => {
  try { return text === null ? fallback : (JSON.parse(text) as T) ?? fallback; } catch { return fallback; }
};

export function taskFromRow(r: TaskRow): TaskSession {
  return {
    ...r, private: r.private === 1, done_looks: parse<string[]>(r.done_looks, []), checkins: parse<Checkin[]>(r.checkins, []),
    done_ticked: parse<number[] | null>(r.done_ticked, null),
  };
}

export type TaskState = 'working' | 'break' | 'paused' | 'ended';

/** §7G.1 — derived, never stored. */
export function taskState(s: TaskSession): TaskState {
  return s.ended_at ? 'ended' : s.break_until ? 'break' : s.paused_at ? 'paused' : 'working';
}

/** §7G.1 — banked working time plus the running stretch. Break and pause never count. */
export function workedMs(s: TaskSession, now: string): number {
  return s.worked_ms + (s.working_since ? Math.max(0, ms(now) - ms(s.working_since)) : 0);
}

/** A timed task's working time left (may be ≤ 0), or null when open-ended. */
export function remainingMs(s: TaskSession, now: string): number | null {
  return s.limit_min === null ? null : s.limit_min * 60_000 - workedMs(s, now);
}

/** Working time has reached the limit (30 s of slack for a tick landing just before its minute). */
export function timeUp(s: TaskSession, now: string): boolean {
  const left = remainingMs(s, now);
  return left !== null && left <= 30_000;
}

/** §7G.3 — the next check-in: `inMin` from now, but never after a timed task's working time runs out. */
export function nextCheckinDue(s: TaskSession, now: string, inMin: number): string {
  const left = remainingMs(s, now);
  if (left !== null && left > 30_000 && left < inMin * 60_000) return addMinutes(now, left / 60_000);
  return addMinutes(now, inMin);
}

/** §7G.6 — "A tough patch, then a strong finish" and the rest, from the answers in order. */
export function taskPattern(moods: TaskMood[]): string {
  const work = moods.filter((m) => m !== 'break');
  const hard = (m: TaskMood) => m === 'distracted' || m === 'struggling';
  const breaks = moods.length - work.length;
  const tail = breaks ? ` · ${breaks} break${breaks === 1 ? '' : 's'}` : '';
  if (work.length === 0) return `Heads down, no check-ins needed${tail}`;
  if (!work.some(hard)) return `${work.filter((m) => m === 'great').length * 2 >= work.length ? 'Strong momentum all the way' : 'Steady and consistent'}${tail}`;
  return `${hard(work[work.length - 1]) ? 'A tricky one, and you kept showing up' : 'A tough patch, then a strong finish'}${tail}`;
}

export interface TaskSummary { elapsedMin: number; workedMin: number; checkins: number; moods: string; pattern: string; doneCheck: { ticked: number; total: number } | null }

export function taskSummary(s: TaskSession, now: string): TaskSummary {
  const end = s.ended_at ?? now;
  const moods = s.checkins.map((c) => c.mood);
  return {
    elapsedMin: Math.round((ms(end) - ms(s.started_at)) / 60_000), workedMin: Math.round(workedMs(s, end) / 60_000),
    checkins: moods.length, moods: moods.map((m) => MOOD_EMOJI[m]).join(''), pattern: taskPattern(moods),
    doneCheck: s.done_ticked && s.done_looks.length ? { ticked: s.done_ticked.length, total: s.done_looks.length } : null,
  };
}

/** §10 the Task wire shape, as GET /tasks and every /tasks answer give it. */
export interface Task {
  id: string; title: string; state: TaskState; limitMin: number | null; intervalMin: number; channels: Channel[]; private: boolean;
  doneLooks: string[]; startedAt: string; workedMin: number; elapsedMin: number; remainingMin: number | null; timeUp: boolean;
  breakUntil: string | null; checkins: { at: string; mood: TaskMood }[];
  openFire: { id: string; dueAt: string; state: string; alertCount: number } | null;
  outcome: TaskOutcome | null; endedAt: string | null; doneTicked: number[] | null; summary: TaskSummary;
}

export function taskWire(s: TaskSession, t: TaskTimer, openFire: Task['openFire'], now: string): Task {
  const left = remainingMs(s, now);
  return {
    id: s.id, title: t.title, state: taskState(s), limitMin: s.limit_min, intervalMin: t.interval_min, channels: t.channels,
    private: s.private, doneLooks: s.done_looks, startedAt: s.started_at, workedMin: Math.round(workedMs(s, now) / 60_000),
    elapsedMin: Math.round((ms(s.ended_at ?? now) - ms(s.started_at)) / 60_000),
    remainingMin: left === null ? null : Math.max(0, Math.round(left / 60_000)), timeUp: !s.ended_at && timeUp(s, now),
    breakUntil: s.break_until, checkins: s.checkins.map(({ at, mood }) => ({ at, mood })), openFire,
    outcome: s.outcome, endedAt: s.ended_at, doneTicked: s.done_ticked, summary: taskSummary(s, now),
  };
}

export interface StartInput { title: string; limitMin: number | null; intervalMin: number; doneLooks: string[]; channels: Channel[]; private: boolean }
export interface EditInput { intervalMin?: number; nextInMin?: number; addMin?: number; quiet?: true }

const wholeIn = (v: unknown, lo: number, hi: number): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : null;

/** §7G.2 — the POST /tasks body → its input, or the message for a 400. */
export function parseTaskInput(b: Record<string, unknown>): StartInput | string {
  const title = typeof b.title === 'string' ? b.title.trim() : '';
  if (!title || title.length > ALERT_TITLE_MAX) return `What are you starting? It needs a name (up to ${ALERT_TITLE_MAX} characters).`;
  const limitMin = b.limitMin === undefined || b.limitMin === null ? null : wholeIn(b.limitMin, 1, TASK_LIMIT_MAX);
  if (limitMin === null && b.limitMin !== undefined && b.limitMin !== null) return `How long must be 1 to ${TASK_LIMIT_MAX} minutes, or open-ended.`;
  const intervalMin = wholeIn(b.intervalMin ?? TASK_INTERVAL_DEFAULT, 1, TASK_INTERVAL_MAX);
  if (intervalMin === null) return `Check on me every must be 1 to ${TASK_INTERVAL_MAX} minutes.`;
  const lines = b.doneLooks ?? [];
  if (!Array.isArray(lines) || !lines.every((l) => typeof l === 'string')) return 'What done looks like must be a list of lines.';
  const doneLooks = (lines as string[]).map((l) => l.trim()).filter(Boolean);
  if (doneLooks.length > TASK_DONE_LOOKS_MAX || doneLooks.some((l) => l.length > TASK_DONE_LOOK_MAX)) {
    return `What done looks like: up to ${TASK_DONE_LOOKS_MAX} lines of up to ${TASK_DONE_LOOK_MAX} characters.`;
  }
  if (!Array.isArray(b.channels) || b.channels.length === 0 || !b.channels.every((c) => isOneOf(CHANNEL, c))) {
    return 'Pick at least one way to check in (Phone, House or FunHouse).';
  }
  if (b.private !== undefined && typeof b.private !== 'boolean') return 'Private must be true or false.';
  return { title, limitMin, intervalMin, doneLooks, channels: CHANNEL.filter((c) => (b.channels as unknown[]).includes(c)), private: b.private === true };
}

/** §7G.5 — the PATCH /tasks/{id} body → its input, or the message for a 400. */
export function parseTaskEdit(b: Record<string, unknown>): EditInput | string {
  const out: EditInput = {};
  for (const [k, hi] of [['intervalMin', TASK_INTERVAL_MAX], ['nextInMin', TASK_INTERVAL_MAX], ['addMin', TASK_LIMIT_MAX]] as const) {
    if (b[k] === undefined) continue;
    const n = wholeIn(b[k], 1, hi);
    if (n === null) return `${k} must be a whole number from 1 to ${hi}.`;
    out[k] = n;
  }
  if (b.quiet !== undefined && b.quiet !== true) return 'quiet must be true.';
  if (b.quiet === true) out.quiet = true;
  return Object.keys(out).length ? out : 'Nothing to change.';
}

export interface DoneCheck { lines: { text: string; looks: TaskLooks }[]; note: string }

/** §7G.6 — the photo check's raw answer → one look per done line (anything missing or odd: unsure) and a short note. */
export function cleanDoneCheck(raw: { lines?: unknown; note?: unknown }, lines: string[]): DoneCheck {
  const got = Array.isArray(raw.lines) ? raw.lines : [];
  const lookOf = (i: number): TaskLooks => {
    const hit = got.find((g) => g && typeof g === 'object' && (g as { n?: unknown }).n === i + 1) as { looks?: unknown } | undefined;
    return isOneOf(TASK_LOOKS, hit?.looks) ? hit!.looks as TaskLooks : 'unsure';
  };
  const note = typeof raw.note === 'string' && raw.note.trim() ? raw.note.trim().slice(0, TASK_NOTE_MAX) : 'Here is what I could see.';
  return { lines: lines.map((text, i) => ({ text, looks: lookOf(i) })), note };
}
