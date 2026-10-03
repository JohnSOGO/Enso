// SPEC §7B — chore rules (pure): whose turn, run planning, step advance/undo, a chore
// fire's config, input validation. `now` and `tz` are always parameters.
import { CHANNEL, CHORE_TIMING, WEEKDAY, isOneOf, type Channel, type ChoreTiming, type Weekday } from './vocab';
import { addDays, addMinutes, diffDays, isTime, localToUtc, ms, startOfWeek, utcToLocal, weekdayOf } from './time';
import { closeFire, newChoreFire, type AlertConfig, type FireRow, type NewFire } from './engine';

export const TITLE_MAX = 60;
export const DONE_MEANS_MAX = 200;
export const PEOPLE_MAX = 8;
export const STEPS_MAX = 6;
export const WAIT_MAX = 720;
export const RENOTIFY_MAX = 240; // the timers' range
export const DEFAULT_MAX_ALERTS = 4;

/** §7B.2 — one step of a chore's loop. */
export interface ChoreStep {
  title: string;
  waitMin: number | null;  // after THIS step is done, the next step rings in N min
  memberId: string | null; // this step's person; null = whoever's turn it is
}

/** A chore with its JSON columns parsed. */
export interface Chore {
  id: string;
  title: string;
  done_means: string | null;
  days: Weekday[];
  timing: ChoreTiming;
  time: string;
  nudge: boolean;
  people: string[];
  steps: ChoreStep[];
  channels: Channel[];
  renotify_min: number | null;
  max_alerts: number;
  start_date: string;
}

/** The `chores` row as D1 returns it (JSON columns as text). */
export interface ChoreRow {
  id: string; title: string; done_means: string | null; days: string; timing: ChoreTiming; time: string;
  nudge: number; people: string; steps: string; channels: string; renotify_min: number | null; max_alerts: number;
  start_date: string; created_by: string; created_at: string; updated_at: string; deleted_at: string | null;
}

/** One `chore_runs` row. `step` = steps.length once finished. */
export interface ChoreRun {
  id: string;
  chore_id: string;
  date: string;
  assignee_id: string | null;
  step: number;
  done_at: string | null;
  done_by: string | null;
}

export function choreFromRow(r: ChoreRow): Chore {
  return {
    id: r.id, title: r.title, done_means: r.done_means, days: JSON.parse(r.days), timing: r.timing, time: r.time,
    nudge: r.nudge === 1, people: JSON.parse(r.people), steps: JSON.parse(r.steps), channels: JSON.parse(r.channels),
    renotify_min: r.renotify_min, max_alerts: r.max_alerts, start_date: r.start_date,
  };
}

// ---- §7B.1 turns ----

/** Whose turn on `date`: people[w mod n] (w = Sunday-start weeks since start_date's week), skipping inactive people. */
export function assigneeFor(chore: Pick<Chore, 'people' | 'start_date'>, date: string, activeIds: readonly string[]): string | null {
  const n = chore.people.length;
  const w = diffDays(startOfWeek(date), startOfWeek(chore.start_date)) / 7;
  for (let i = 0; i < n; i++) {
    const id = chore.people[(((w + i) % n) + n) % n];
    if (activeIds.includes(id)) return id;
  }
  return null;
}

/** Is the chore due on this local date (one of its days)? */
export const isDueOn = (chore: Pick<Chore, 'days'>, date: string): boolean => chore.days.includes(WEEKDAY[weekdayOf(date)]);

// ---- §7B.2 steps ----

/** The current step, or null once the run is finished. */
export const currentStep = (chore: Chore, run: ChoreRun): ChoreStep | null => chore.steps[run.step] ?? null;

/** The current step's person: its own member, else whose turn it is. Null when finished or nobody. */
export function stepPerson(chore: Chore, run: ChoreRun): string | null {
  const step = currentStep(chore, run);
  return step ? step.memberId ?? run.assignee_id : null;
}

// ---- §7B.3 runs ----

const deadline = (chore: Chore, date: string, tz: string) => localToUtc(date, chore.time, tz);

/** A run's first fire: none for `by` without nudge, none when its time is already past. */
export function firstFireDue(chore: Chore, date: string, tz: string, now: string): string | null {
  if (chore.timing === 'by' && !chore.nudge) return null;
  const due = deadline(chore, date, tz);
  return ms(due) < ms(now) ? null : due;
}

export interface PlannedRun { date: string; assignee_id: string | null; firstDueAt: string | null }

/** One run per due date from today (household tz) to the local date of `toUtc`, never before start_date. */
export function planChoreRuns(chore: Chore, tz: string, now: string, toUtc: string, activeIds: readonly string[]): PlannedRun[] {
  const today = utcToLocal(now, tz).date;
  const last = utcToLocal(toUtc, tz).date;
  const out: PlannedRun[] = [];
  for (let d = today > chore.start_date ? today : chore.start_date; d <= last; d = addDays(d, 1)) {
    if (isDueOn(chore, d)) out.push({ date: d, assignee_id: assigneeFor(chore, d, activeIds), firstDueAt: firstFireDue(chore, d, tz, now) });
  }
  return out;
}

export interface RunChange { run: ChoreRun; closeFire?: FireRow; newFire?: NewFire }

/** Rule 4: a `by` nudge still ahead gets a fire at the deadline. */
function nudgeFire(chore: Chore, run: ChoreRun, now: string, tz: string): NewFire | undefined {
  if (chore.timing !== 'by' || !chore.nudge) return undefined;
  const due = deadline(chore, run.date, tz);
  return ms(due) > ms(now) ? newChoreFire(run.id, due) : undefined;
}

/** Done a step (§7B.3 rules 1–5). */
export function advanceRun(
  chore: Chore, run: ChoreRun, openFire: FireRow | null, memberId: string, now: string, tz: string,
): RunChange | { error: 'already_done' } {
  if (run.step >= chore.steps.length) return { error: 'already_done' };
  const closed = openFire ? closeFire(openFire, 'done', memberId, now) : undefined;
  const next: ChoreRun = { ...run, step: run.step + 1 };
  if (next.step >= chore.steps.length) return { run: { ...next, done_at: now, done_by: memberId }, closeFire: closed };
  const wait = chore.steps[run.step].waitMin;
  const newFire = wait ? newChoreFire(run.id, addMinutes(now, wait)) : nudgeFire(chore, run, now, tz);
  return { run: next, closeFire: closed, newFire };
}

/** Undo the last step: the open fire closes `removed`; only a `by` nudge still ahead is re-planned (waits are not). */
export function undoRun(
  chore: Chore, run: ChoreRun, openFire: FireRow | null, now: string, tz: string,
): RunChange | { error: 'nothing_to_undo' } {
  if (run.step <= 0) return { error: 'nothing_to_undo' };
  return {
    run: { ...run, step: Math.min(run.step, chore.steps.length) - 1, done_at: null, done_by: null },
    closeFire: openFire ? closeFire(openFire, 'removed', null, now) : undefined,
    newFire: nudgeFire(chore, run, now, tz),
  };
}

/**
 * Editing a chore re-plans an unstarted run (step 0, date ≥ today) in place: new assignee, the open
 * fire closes `removed`, a first fire by the planning rule. A date that is no longer one of the
 * chore's days gets no fire. Null = started, or from an earlier day: left alone.
 */
export function replanRun(
  chore: Chore, run: ChoreRun, openFire: FireRow | null, tz: string, now: string, activeIds: readonly string[],
): RunChange | null {
  if (run.step !== 0 || run.date < utcToLocal(now, tz).date) return null;
  const due = isDueOn(chore, run.date) ? firstFireDue(chore, run.date, tz, now) : null;
  return {
    run: { ...run, assignee_id: assigneeFor(chore, run.date, activeIds) },
    closeFire: openFire ? closeFire(openFire, 'removed', null, now) : undefined,
    newFire: due ? newChoreFire(run.id, due) : undefined,
  };
}

/** Today's list keeps a run unless it is unstarted on a day the (since edited) chore is no longer due. */
export const showsOnToday = (chore: Chore, run: ChoreRun): boolean => run.step > 0 || isDueOn(chore, run.date);

/** A chore fire's alert config and whom/what it names. `by` chores ring once: renotify is ignored. */
export function choreFireContext(chore: Chore, run: ChoreRun): { cfg: AlertConfig; personId: string | null; stepTitle: string; stepCount: number } {
  const step = currentStep(chore, run) ?? chore.steps[chore.steps.length - 1];
  return {
    cfg: { channels: chore.channels, renotifyMin: chore.timing === 'by' ? null : chore.renotify_min, maxAlerts: chore.max_alerts },
    personId: stepPerson(chore, run),
    stepTitle: step.title,
    stepCount: chore.steps.length,
  };
}

// ---- §7B.4 validation ----

export type ChoreInput = Omit<Chore, 'id' | 'start_date'>;

const text = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max ? v.trim() : null;
const intIn = (v: unknown, lo: number, hi: number): number | null =>
  Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi ? (v as number) : null;
const empty = (v: unknown) => v === undefined || v === null;

function parseStep(s: unknown, i: number, activeIds: readonly string[]): ChoreStep | string {
  const at = `steps[${i}]`;
  if (!s || typeof s !== 'object') return `${at} must be an object with a title.`;
  const o = s as Record<string, unknown>;
  const title = text(o.title, TITLE_MAX);
  if (!title) return `${at}.title must be 1–${TITLE_MAX} characters.`;
  const waitMin = empty(o.waitMin) ? null : intIn(o.waitMin, 1, WAIT_MAX);
  if (waitMin === null && !empty(o.waitMin)) return `${at}.waitMin must be 1–${WAIT_MAX} minutes, or empty.`;
  if (!empty(o.memberId) && !activeIds.includes(o.memberId as string)) {
    return `${at}.memberId must be an active member, or empty for whoever's turn it is.`;
  }
  return { title, waitMin, memberId: empty(o.memberId) ? null : (o.memberId as string) };
}

/** POST/PATCH body → normalized chore fields, or a message naming the offending field. */
export function parseChoreInput(b: Record<string, unknown>, activeIds: readonly string[]): ChoreInput | string {
  const title = text(b.title, TITLE_MAX);
  if (!title) return `title must be 1–${TITLE_MAX} characters.`;
  const dm = b.doneMeans;
  if (!empty(dm) && (typeof dm !== 'string' || dm.trim().length > DONE_MEANS_MAX)) return `doneMeans can be at most ${DONE_MEANS_MAX} characters.`;
  const done_means = typeof dm === 'string' && dm.trim() ? dm.trim() : null;
  if (!Array.isArray(b.days) || b.days.length === 0) return 'days: pick at least one day of the week.';
  if (!b.days.every((d) => isOneOf(WEEKDAY, d))) return `days must be from: ${WEEKDAY.join(', ')}.`;
  const days = WEEKDAY.filter((d) => (b.days as unknown[]).includes(d));
  if (!isOneOf(CHORE_TIMING, b.timing)) return `timing must be one of: ${CHORE_TIMING.join(', ')}.`;
  const timing = b.timing;
  if (!isTime(b.time)) return 'time must be HH:MM.';
  if (!empty(b.nudge) && typeof b.nudge !== 'boolean') return 'nudge must be true or false.';
  const nudge = timing === 'by' && b.nudge === true;
  const people = b.people;
  if (!Array.isArray(people) || people.length === 0 || people.length > PEOPLE_MAX) return `people: choose 1–${PEOPLE_MAX} members, in turn order.`;
  if (!people.every((p) => typeof p === 'string' && activeIds.includes(p))) return 'people must all be active members of the household.';
  if (new Set(people).size !== people.length) return 'people must not list anyone twice.';
  if (!Array.isArray(b.steps) || b.steps.length === 0 || b.steps.length > STEPS_MAX) return `steps: a chore has 1–${STEPS_MAX} steps.`;
  const steps: ChoreStep[] = [];
  for (const [i, s] of b.steps.entries()) {
    const step = parseStep(s, i, activeIds);
    if (typeof step === 'string') return step;
    steps.push(step);
  }
  const ch = b.channels ?? [];
  if (!Array.isArray(ch) || !ch.every((c) => isOneOf(CHANNEL, c))) return `channels must be a list of: ${CHANNEL.join(', ')}.`;
  const channels = CHANNEL.filter((c) => ch.includes(c));
  if (channels.length === 0 && (timing === 'at' || nudge)) return 'channels: choose at least one for a chore that rings or nudges.';
  const renotify_min = empty(b.renotifyMin) ? null : intIn(b.renotifyMin, 1, RENOTIFY_MAX);
  if (renotify_min === null && !empty(b.renotifyMin)) return `renotifyMin must be 1–${RENOTIFY_MAX} minutes, or empty to ring once.`;
  return {
    title, done_means, days, timing, time: b.time, nudge, people: people as string[], steps, channels,
    renotify_min, max_alerts: DEFAULT_MAX_ALERTS,
  };
}
