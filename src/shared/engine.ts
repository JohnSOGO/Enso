// SPEC §5 — the alert engine. Pure: no I/O, no clock. `now` is always a parameter.
import type { Action, AlertKind, Channel, CloseReason, FireState, TimerCmd } from './vocab';
import { addDays, addMinutes, localToUtc, ms, utcToLocal } from './time';
import { occurrences, type Recurrence } from './recurrence';

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
}

export interface ReminderEvent {
  id: string;
  start_date: string;
  start_time: string | null;
  recurrence: Recurrence | null;
  exdates: string[];
  remind_offset_min: number | null;
}

export interface TimerState {
  id: string;
  running: boolean;
}

const blankFire = (): Omit<NewFire, 'kind' | 'event_id' | 'occurrence_date' | 'timer_id' | 'due_at'> => ({
  state: 'scheduled', alert_count: 0, last_alerted_at: null,
  close_reason: null, closed_by: null, closed_at: null,
});

export function newTimerFire(timerId: string, dueAt: string): NewFire {
  return { kind: 'timer', event_id: null, occurrence_date: null, timer_id: timerId, due_at: dueAt, ...blankFire() };
}

function close<T extends NewFire>(fire: T, reason: CloseReason, memberId: string | null, now: string): T {
  return { ...fire, state: 'closed', close_reason: reason, closed_by: memberId, closed_at: now };
}

/** Reminder fires whose due time falls in [fromUtc, toUtc). Idempotent. */
export function planReminderFires(ev: ReminderEvent, tz: string, fromUtc: string, toUtc: string): NewFire[] {
  if (ev.remind_offset_min === null) return [];
  const fromDate = addDays(utcToLocal(fromUtc, tz).date, -1);
  const toDate = addDays(utcToLocal(toUtc, tz).date, 2); // offsets are ≤ 1 day, so due ≤ start
  const out: NewFire[] = [];
  for (const date of occurrences(ev, fromDate, toDate)) {
    const start = localToUtc(date, ev.start_time ?? ALL_DAY_REMIND_TIME, tz);
    const due = addMinutes(start, -ev.remind_offset_min);
    if (ms(due) >= ms(fromUtc) && ms(due) < ms(toUtc)) {
      out.push({ kind: 'reminder', event_id: ev.id, occurrence_date: date, timer_id: null, due_at: due, ...blankFire() });
    }
  }
  return out;
}

/** §5.3 — advance one open fire to `now`. */
export function stepFire(fire: FireRow, cfg: AlertConfig, now: string): { fire: FireRow; alert: boolean } {
  const t = ms(now);
  if (fire.state === 'scheduled') {
    if (t < ms(fire.due_at)) return { fire, alert: false };
    if (fire.kind === 'reminder' && t - ms(fire.due_at) > MISSED_AFTER_MIN * 60_000) {
      return { fire: close(fire, 'missed', null, now), alert: false };
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
  if (fire.kind === 'reminder' && fire.state === 'ringing') {
    if (action === 'done') return { fire: close(fire, 'done', memberId, now) };
    if (action === 'snooze') {
      return { fire: { ...fire, state: 'scheduled', due_at: addMinutes(now, SNOOZE_MIN), alert_count: 0, last_alerted_at: null } };
    }
  }
  if (fire.kind === 'timer' && action === 'ack' && fire.state !== 'closed' && fire.timer_id && cfg.intervalMin) {
    return {
      fire: close(fire, 'acked', memberId, now),
      next: newTimerFire(fire.timer_id, addMinutes(now, cfg.intervalMin)),
    };
  }
  return { error: 'invalid_action' };
}

/** §5.5 — timer start/stop. */
export function applyTimerCmd(
  timer: TimerState, openFire: FireRow | null, cmd: TimerCmd, intervalMin: number, memberId: string, now: string,
): { timer: TimerState; closeFire?: FireRow; newFire?: NewFire } {
  if (cmd === 'start' && !timer.running) {
    return { timer: { ...timer, running: true }, newFire: newTimerFire(timer.id, addMinutes(now, intervalMin)) };
  }
  if (cmd === 'stop' && timer.running) {
    return { timer: { ...timer, running: false }, closeFire: openFire ? close(openFire, 'stopped', memberId, now) : undefined };
  }
  return { timer };
}

/** §5.7 — alert message text. */
export function alertMessage(kind: AlertKind, title: string, alertNumber: number): string {
  const base = kind === 'reminder' ? `Reminder: ${title}` : `Timer: ${title}`;
  return alertNumber >= 2 ? `${base} (alert ${alertNumber})` : base;
}
