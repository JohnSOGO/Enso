// SPEC §5 — the alert engine. Pure: no I/O, no clock. `now` is always a parameter.
import type { Action, AlertKind, Channel, CloseReason, FireState, SunEvent, TimerCmd } from './vocab';
import { addDays, addMinutes, localToUtc, ms, utcToLocal } from './time';
import { occurrences, type Recurrence } from './recurrence';
import { sunsetUtc, type Place } from './sun';
import { bringText } from './bring';

export const MATERIALIZE_AHEAD_H = 36;
export const MISSED_AFTER_MIN = 60;
export const SNOOZE_MIN = 10; // ⚑ DEFAULT
export const ALL_DAY_REMIND_TIME = '09:00'; // ⚑ DEFAULT — "start" of an all-day event

export interface FireRow {
  id: string;
  kind: AlertKind;
  event_id: string | null;
  occurrence_date: string | null;
  timer_id: string | null;
  chore_run_id: string | null;
  thing_id: string | null;
  machine_id: string | null;
  due_at: string;
  state: FireState;
  alert_count: number;
  last_alerted_at: string | null;
  close_reason: CloseReason | null;
  closed_by: string | null;
  closed_at: string | null;
}

export type NewFire = Omit<FireRow, 'id'>;

export interface AlertConfig {
  channels: Channel[];
  renotifyMin: number | null;
  maxAlerts: number;
  intervalMin?: number;
  /** §4.2n — a rolling timer's active time range, if it has one. */
  window?: TimerWindow;
  /** §7D.5 — set when the source may not sound now: the instant it next may. */
  quietUntil?: string;
}

/** §4.2n — a rolling timer's active time range: local HH:MM in the household tz; from > to = overnight. */
export interface TimerWindow { from: string; to: string; tz: string }

/** The window of a timer row, or undefined when it has none (both ends must be set). */
export function timerWindow(from: string | null | undefined, to: string | null | undefined, tz: string | null | undefined): TimerWindow | undefined {
  return from && to && tz ? { from, to, tz } : undefined;
}

const minuteOfDay = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** §5.1 — why a window cannot be used with this interval, or null when it can. */
export function timerWindowError(win: Pick<TimerWindow, 'from' | 'to'>, intervalMin: number): string | null {
  if (win.from === win.to) return 'Active from and to must be different times.';
  const length = (minuteOfDay(win.to) - minuteOfDay(win.from) + 1440) % 1440;
  if (intervalMin >= length) return `The interval must be shorter than the active time range (${length} min).`;
  return null;
}

/** §5.1 — is instant `t` inside the window? from ≤ local < to; overnight: local ≥ from || local < to. */
export function inside(t: string, win: TimerWindow): boolean {
  const local = utcToLocal(t, win.tz).time;
  return win.from < win.to ? local >= win.from && local < win.to : local >= win.from || local < win.to;
}

/** The first instant strictly after `t` at which the local clock reads `hhmm` (§4.1 DST rules). */
function nextLocal(t: string, hhmm: string, tz: string): string {
  const today = utcToLocal(t, tz).date;
  for (let k = 0; ; k++) {
    const at = localToUtc(addDays(today, k), hhmm, tz);
    if (ms(at) > ms(t)) return at;
  }
}

/** §5.1 — when a rolling timer next rings, counted from `base`; the countdown restarts when the window opens. */
export function nextTimerDue(base: string, intervalMin: number, win?: TimerWindow): string {
  const plain = addMinutes(base, intervalMin);
  if (!win) return plain;
  if (inside(base, win) && ms(plain) < ms(nextLocal(base, win.to, win.tz))) return plain;
  return addMinutes(nextLocal(base, win.from, win.tz), intervalMin);
}

export interface ReminderEvent {
  id: string;
  start_date: string;
  start_time: string | null;
  recurrence: Recurrence | null;
  exdates: string[];
  remind_offset_min: number | null;
  /** §7.7: the start is that day's sunset at the household place. */
  start_sun?: SunEvent | null;
}

export interface TimerState {
  id: string;
  running: boolean;
}

const blankFire = (): Omit<NewFire, 'kind' | 'event_id' | 'occurrence_date' | 'timer_id' | 'chore_run_id' | 'thing_id' | 'machine_id' | 'due_at'> => ({
  state: 'scheduled', alert_count: 0, last_alerted_at: null,
  close_reason: null, closed_by: null, closed_at: null,
});

export function newTimerFire(timerId: string, dueAt: string): NewFire {
  return { kind: 'timer', event_id: null, occurrence_date: null, timer_id: timerId, chore_run_id: null, thing_id: null, machine_id: null, due_at: dueAt, ...blankFire() };
}

/** A fire for one step of one chore run (§7B.3). */
export function newChoreFire(runId: string, dueAt: string): NewFire {
  return { kind: 'chore', event_id: null, occurrence_date: null, timer_id: null, chore_run_id: runId, thing_id: null, machine_id: null, due_at: dueAt, ...blankFire() };
}

/** One reminder of a thing to do (§7C.2): `occurrence_date` is the reminder's local date. */
export function newThingFire(thingId: string, date: string, dueAt: string): NewFire {
  return { kind: 'thing', event_id: null, occurrence_date: date, timer_id: null, chore_run_id: null, thing_id: thingId, machine_id: null, due_at: dueAt, ...blankFire() };
}

/** One load in one machine, due when the machine is done (§7D.3). */
export function newMachineFire(machineId: string, dueAt: string): NewFire {
  return { kind: 'machine', event_id: null, occurrence_date: null, timer_id: null, chore_run_id: null, thing_id: null, machine_id: machineId, due_at: dueAt, ...blankFire() };
}

/** Reminders and thing reminders ring alike: they may go `missed`, and take Done / Snooze (§5.3, §5.4, §7C.2). */
const remindsLike = (kind: AlertKind) => kind === 'reminder' || kind === 'thing';

export function closeFire<T extends NewFire>(fire: T, reason: CloseReason, memberId: string | null, now: string): T {
  return { ...fire, state: 'closed', close_reason: reason, closed_by: memberId, closed_at: now };
}

/** Reminder fires whose due time falls in [fromUtc, toUtc). Idempotent. A sun event with no sunset (or no place) is skipped. */
export function planReminderFires(ev: ReminderEvent, tz: string, fromUtc: string, toUtc: string, place: Place | null = null): NewFire[] {
  if (ev.remind_offset_min === null) return [];
  const fromDate = addDays(utcToLocal(fromUtc, tz).date, -1);
  const toDate = addDays(utcToLocal(toUtc, tz).date, 2); // offsets are ≤ 1 day, so due ≤ start
  const out: NewFire[] = [];
  for (const date of occurrences(ev, fromDate, toDate)) {
    const start = ev.start_sun ? place && sunsetUtc(date, place) : localToUtc(date, ev.start_time ?? ALL_DAY_REMIND_TIME, tz);
    if (!start) continue; // §7.7: never a substitute time
    const due = addMinutes(start, -ev.remind_offset_min);
    if (ms(due) >= ms(fromUtc) && ms(due) < ms(toUtc)) {
      out.push({ kind: 'reminder', event_id: ev.id, occurrence_date: date, timer_id: null, chore_run_id: null, thing_id: null, machine_id: null, due_at: due, ...blankFire() });
    }
  }
  return out;
}

/** §5.3 — advance one open fire to `now`. */
export function stepFire(fire: FireRow, cfg: AlertConfig, now: string): { fire: FireRow; alert: boolean } {
  const r = stepOpen(fire, cfg, now);
  // Rule 0b (§5.3, §7D.5): an alert in quiet hours waits for them to end — the snooze shape, alerts counted afresh.
  if (r.alert && cfg.quietUntil) {
    return { fire: { ...fire, state: 'scheduled', due_at: cfg.quietUntil, alert_count: 0, last_alerted_at: null }, alert: false };
  }
  return r;
}

function stepOpen(fire: FireRow, cfg: AlertConfig, now: string): { fire: FireRow; alert: boolean } {
  const t = ms(now);
  // Rule 0 (§5.3): a timer never rings outside its window — the snooze shape, no close, no alert.
  if (
    fire.kind === 'timer' && cfg.window && cfg.intervalMin && !inside(now, cfg.window) &&
    (fire.state === 'ringing' || (fire.state === 'scheduled' && t >= ms(fire.due_at)))
  ) {
    return {
      fire: { ...fire, state: 'scheduled', due_at: nextTimerDue(now, cfg.intervalMin, cfg.window), alert_count: 0, last_alerted_at: null },
      alert: false,
    };
  }
  if (fire.state === 'scheduled') {
    if (t < ms(fire.due_at)) return { fire, alert: false };
    if (remindsLike(fire.kind) && t - ms(fire.due_at) > MISSED_AFTER_MIN * 60_000) {
      return { fire: closeFire(fire, 'missed', null, now), alert: false };
    }
    return { fire: { ...fire, state: 'ringing', alert_count: 1, last_alerted_at: now }, alert: true };
  }
  if (
    fire.state === 'ringing' &&
    cfg.renotifyMin !== null &&
    fire.alert_count < cfg.maxAlerts &&
    fire.last_alerted_at !== null &&
    t >= ms(fire.last_alerted_at) + cfg.renotifyMin * 60_000
  ) {
    return { fire: { ...fire, alert_count: fire.alert_count + 1, last_alerted_at: now }, alert: true };
  }
  return { fire, alert: false };
}

/** §5.4 — a human acted on a fire. */
export function applyAction(
  fire: FireRow, action: Action, cfg: AlertConfig, memberId: string, now: string,
): { fire: FireRow; next?: NewFire } | { error: 'invalid_action' } {
  // §7D.2: a machine fire is closed only by the /machines routes (move, Fold & out, Clear).
  if (fire.kind === 'machine') return { error: 'invalid_action' };
  if (fire.kind === 'chore') {
    // The run's step advance is the route's job (advanceRun, §7B.3); the engine only closes this fire.
    return fire.state === 'ringing' && action === 'done' ? { fire: closeFire(fire, 'done', memberId, now) } : { error: 'invalid_action' };
  }
  if (remindsLike(fire.kind) && fire.state === 'ringing') {
    if (action === 'done') return { fire: closeFire(fire, 'done', memberId, now) };
    if (action === 'snooze') {
      return { fire: { ...fire, state: 'scheduled', due_at: addMinutes(now, SNOOZE_MIN), alert_count: 0, last_alerted_at: null } };
    }
  }
  if (fire.kind === 'timer' && action === 'ack' && fire.state !== 'closed' && fire.timer_id && cfg.intervalMin) {
    return {
      fire: closeFire(fire, 'acked', memberId, now),
      next: newTimerFire(fire.timer_id, nextTimerDue(now, cfg.intervalMin, cfg.window)),
    };
  }
  return { error: 'invalid_action' };
}

/** §5.5 — timer start/stop. */
export function applyTimerCmd(
  timer: TimerState, openFire: FireRow | null, cmd: TimerCmd, intervalMin: number, memberId: string, now: string,
  window?: TimerWindow,
): { timer: TimerState; closeFire?: FireRow; newFire?: NewFire } {
  if (cmd === 'start' && !timer.running) {
    return { timer: { ...timer, running: true }, newFire: newTimerFire(timer.id, nextTimerDue(now, intervalMin, window)) };
  }
  if (cmd === 'stop' && timer.running) {
    return { timer: { ...timer, running: false }, closeFire: openFire ? closeFire(openFire, 'stopped', memberId, now) : undefined };
  }
  return { timer };
}

/** Who a chore alert names and which step it is on (§5.7). */
export interface ChoreAlertText { personName: string | null; stepTitle: string; stepCount: number }

/** "18:42" → "6:42": 12-hour, no am/pm (§7.7). */
const h12 = (hhmm: string) => `${Number(hhmm.slice(0, 2)) % 12 || 12}:${hhmm.slice(3, 5)}`;

/**
 * §5.7 — alert message text. `startsToday`: a thing's start reminder (§7C.2). `sunsetAt`: a sun
 * reminder's local sunset HH:MM, or null when it cannot be computed (§7.7); absent otherwise.
 */
export function alertMessage(
  kind: AlertKind, title: string, alertNumber: number, chore?: ChoreAlertText, startsToday = false, sunsetAt?: string | null,
  bring?: string[] | null,
): string {
  const base = kind === 'reminder'
    ? (sunsetAt !== undefined ? `${title} — ${sunsetAt === null ? 'before sunset' : `sunset at ${h12(sunsetAt)}`}` : `Reminder: ${title}`)
      + (bring?.length ? ` — ${bringText(bring)}` : '')
    : kind === 'timer' ? `Timer: ${title}`
    : kind === 'thing' ? `To do: ${title}${startsToday ? ' — starts today' : ''}`
    : kind === 'machine' ? title // the whole sentence, from machines.ts doneMessage (§7D.3)
    : `${chore?.personName ? `Chore for ${chore.personName}` : 'Chore'}: ${title}${chore && chore.stepCount > 1 ? ` — ${chore.stepTitle}` : ''}`;
  return alertNumber >= 2 ? `${base} (alert ${alertNumber})` : base;
}

/** §9.1 — the actions a phone notification offers for a kind: the Ringing bar's table (§8.2). */
const PUSH_ACTIONS: Record<AlertKind, readonly Action[]> = {
  reminder: ['done', 'snooze'], thing: ['done', 'snooze'], timer: ['ack'], chore: ['done'],
  machine: [], // §7D.3: no buttons — tapping the notification opens the app
};
export const pushActions = (kind: AlertKind): Action[] => [...PUSH_ACTIONS[kind]];
