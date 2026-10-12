// SPEC §7D.8 — cooking timers: made on demand, closed with ✕, cleared at the end of the day. Rows are `machines` rows
// (§4.2zp) ringing through ordinary `machine` fires. Pure: `now` and a new timer's id are parameters. Imports machines,
// engine, vocab and time; machines.ts never imports this.
import { closeFire, newMachineFire, type FireRow, type NewFire } from './engine';
import { MACHINE_MAX_ALERTS, machineAlert, machineState } from './machines';
import { COOK_KIND, isOneOf, type CookKind } from './vocab';
import { addMinutes, ms, utcToLocal } from './time';

export const COOK_RENOTIFY_MIN = 5;
export const COOK_NAME_MAX = 40;
export const COOK_MINUTES_MAX = 600;

export const COOK_LABEL: Record<CookKind, string> = { air_fryer: 'Air fryer', stove: 'Stove', oven: 'Oven', microwave: 'Microwave', other: 'Other' };

export const isCookId = (v: unknown): v is string => typeof v === 'string' && v.startsWith('cook_');

export interface CookRow {
  id: string;
  cook_kind: CookKind;
  name: string | null;
  /** Who started it last (both). */
  owner_id: string | null;
  started_by: string | null;
  /** §7D.7 — who is alerted when it is done; null = nobody (phones only). */
  alert_id: string | null;
  minutes: number;
  started_at: string | null;
  done_at: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

/** Its name, else its kind ("Air fryer"). */
export const cookLabel = (r: Pick<CookRow, 'cook_kind' | 'name'>): string => r.name ?? COOK_LABEL[r.cook_kind];

/** §7D.8 — `"Sam, the air fryer is done"` / `"Sam, Oven 2 is done"`; with nobody (or nobody active) to alert, no name. */
export function cookMessage(r: Pick<CookRow, 'cook_kind' | 'name'>, alertName: string | null): string {
  const what = r.name ?? `the ${COOK_LABEL[r.cook_kind].toLowerCase()}`;
  const said = alertName ? `${alertName}, ${what}` : what.charAt(0).toUpperCase() + what.slice(1);
  return `${said} is done`;
}

/** §7D.8 — the §7D.7 audience, at any hour (no alert hours), every 5 minutes. */
export function cookAlert(alertId: string | null, founderAlerted: boolean): ReturnType<typeof machineAlert> {
  const a = machineAlert(null, alertId, founderAlerted);
  return { ...a, cfg: { ...a.cfg, renotifyMin: COOK_RENOTIFY_MIN } };
}

export interface CookChange { row: CookRow; closeFire?: FireRow; newFire?: NewFire }
export type CookRefusal = { error: 'not_done' | 'not_running' | 'busy'; row: CookRow };
export type CookResult = CookChange | CookRefusal;

const off = (r: CookRow, now: string): CookRow => ({ ...r, started_at: null, done_at: null, updated_at: now });
const on = (r: CookRow, by: string, now: string): CookRow =>
  ({ ...r, owner_id: by, started_by: by, started_at: now, done_at: addMinutes(now, r.minutes), updated_at: now });
const closed = (f: FireRow | null, reason: 'done' | 'removed' | 'superseded', by: string | null, now: string) =>
  f ? closeFire(f, reason, by, now) : undefined;

export interface CookInput { kind: CookKind; name: string | null; minutes: number; alertId: string | null }

/** Create: a new timer, running at once. */
export function createCook(id: string, input: CookInput, by: string, now: string): CookChange {
  const blank: CookRow = {
    id, cook_kind: input.kind, name: input.name, owner_id: null, started_by: null, alert_id: input.alertId, minutes: input.minutes,
    started_at: null, done_at: null, created_at: now, updated_at: now, closed_at: null,
  };
  const row = on(blank, by, now);
  return { row, newFire: newMachineFire(id, row.done_at!) };
}

/** Off: a done timer stops ringing; its kind, name, minutes and alert person stay. */
export function offCook(r: CookRow, fire: FireRow | null, by: string, now: string): CookResult {
  if (machineState(r, now) !== 'done') return { error: 'not_done', row: r };
  return { row: off(r, now), closeFire: closed(fire, 'done', by, now) };
}

/** Stop: a running timer stops; nothing rings. */
export function stopCook(r: CookRow, fire: FireRow | null, by: string, now: string): CookResult {
  if (machineState(r, now) !== 'running') return { error: 'not_running', row: r };
  return { row: off(r, now), closeFire: closed(fire, 'removed', by, now) };
}

/** Start again: an off timer runs again with its saved minutes and alert person. */
export function startCook(r: CookRow, by: string, now: string): CookResult {
  if (machineState(r, now) !== 'free') return { error: 'busy', row: r };
  const row = on(r, by, now);
  return { row, newFire: newMachineFire(r.id, row.done_at!) };
}

export type CookPatch = Partial<CookInput>;

/** Edit: new minutes on a running or done timer move its done-at to start + minutes, never before now (§7D.8). */
export function editCook(r: CookRow, p: CookPatch, fire: FireRow | null, by: string, now: string): CookChange {
  const row: CookRow = {
    ...r, cook_kind: p.kind ?? r.cook_kind, name: p.name === undefined ? r.name : p.name,
    alert_id: p.alertId === undefined ? r.alert_id : p.alertId, minutes: p.minutes ?? r.minutes, updated_at: now,
  };
  if (p.minutes === undefined || r.started_at === null) return { row };
  const end = addMinutes(r.started_at, p.minutes);
  row.done_at = ms(end) > ms(now) ? end : now;
  if (row.done_at === r.done_at) return { row };
  return { row, closeFire: closed(fire, 'superseded', by, now), newFire: newMachineFire(r.id, row.done_at) };
}

/** Close — the red ✕, or the end of the day (`by` null): gone from the list; nothing rings. */
export function closeCook(r: CookRow, fire: FireRow | null, by: string | null, now: string): CookChange {
  return { row: { ...r, closed_at: now, updated_at: now }, closeFire: closed(fire, 'removed', by, now) };
}

/**
 * §7D.8 end of day: an open timer that is not active — not running, and not done with alerts still to send — whose last
 * change (updated_at, or done-at when later) was before today's local midnight.
 */
export function cookExpired(r: CookRow, fire: FireRow | null, tz: string, now: string): boolean {
  if (r.closed_at !== null || machineState(r, now) === 'running') return false;
  if (fire && fire.state !== 'closed' && fire.alert_count < MACHINE_MAX_ALERTS) return false;
  const last = r.done_at && ms(r.done_at) > ms(r.updated_at) ? r.done_at : r.updated_at;
  return utcToLocal(last, tz).date < utcToLocal(now, tz).date;
}

export function cookRefusalText(r: CookRefusal): string {
  const label = cookLabel(r.row);
  return r.error === 'not_done' ? `${label} isn't done yet.` : r.error === 'not_running' ? `${label} isn't running.` : `${label} is already on.`;
}

const KIND_TEXT = `What must be one of ${COOK_KIND.map((k) => COOK_LABEL[k]).join(', ')}.`;
const NAME_TEXT = `Name must be ${COOK_NAME_MAX} characters or fewer.`;
const MINUTES_TEXT = `Minutes must be a whole number from 1 to ${COOK_MINUTES_MAX}.`;
const ALERT_TEXT = 'Alert when done must be an active member or nobody.';

const nameOf = (v: unknown): string | null | undefined => {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string' || v.trim().length > COOK_NAME_MAX) return undefined;
  return v.trim() || null;
};
const isMinutes = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= COOK_MINUTES_MAX;
const alertOf = (v: unknown, activeIds: readonly string[]): string | null | undefined =>
  v === null ? null : typeof v === 'string' && activeIds.includes(v) ? v : undefined;

/** Create's body: a kind, an optional name, minutes 1–600 and who to alert (absent → me). Returns the input or a message. */
export function parseCreate(b: Record<string, unknown>, activeIds: readonly string[], me: string): CookInput | string {
  if (!isOneOf(COOK_KIND, b.kind)) return KIND_TEXT;
  const name = nameOf(b.name);
  if (name === undefined) return NAME_TEXT;
  if (!isMinutes(b.minutes)) return MINUTES_TEXT;
  const alertId = b.alertId === undefined ? me : alertOf(b.alertId, activeIds);
  return alertId === undefined ? ALERT_TEXT : { kind: b.kind, name, minutes: b.minutes, alertId };
}

/** Edit's body: each field optional, the same rules as Create. */
export function parseEdit(b: Record<string, unknown>, activeIds: readonly string[]): CookPatch | string {
  const p: CookPatch = {};
  if (b.kind !== undefined) { if (!isOneOf(COOK_KIND, b.kind)) return KIND_TEXT; p.kind = b.kind; }
  if (b.name !== undefined) { const n = nameOf(b.name); if (n === undefined) return NAME_TEXT; p.name = n; }
  if (b.minutes !== undefined) { if (!isMinutes(b.minutes)) return MINUTES_TEXT; p.minutes = b.minutes; }
  if (b.alertId !== undefined) { const a = alertOf(b.alertId, activeIds); if (a === undefined) return ALERT_TEXT; p.alertId = a; }
  return p;
}

