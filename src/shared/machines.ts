// SPEC §7D — the laundry loop and the dish washer: a machine's state, its transitions, the done message, input rules.
// Pure: `now` is always a parameter. Imports engine + vocab + time; the engine never imports this. Alert hours: machine-hours.ts.
import { closeFire, newMachineFire, type AlertConfig, type FireRow, type NewFire } from './engine';
import { MACHINE, isOneOf, type Channel, type MachineId, type MachineState } from './vocab';
import { addMinutes, ms } from './time';

export const MACHINE_RENOTIFY_MIN = 15;
export const MACHINE_MAX_ALERTS = 4;
export const MACHINE_CHANNELS: readonly Channel[] = ['push', 'house'];

/** §7D.3 — every machine fire rings alike. */
export const machineAlertConfig = (): AlertConfig =>
  ({ channels: [...MACHINE_CHANNELS], renotifyMin: MACHINE_RENOTIFY_MIN, maxAlerts: MACHINE_MAX_ALERTS });

/**
 * §7D.3, §7D.5, §7D.7 — a machine fire's audience and alert, waiting for the alert hours: every phone, and every speaker
 * only when the load has someone to alert (`alertId`, an active member); with nobody, phones only.
 */
export const machineAlert = (quietUntil: string | null, alertId: string | null): { assignedTo: string[]; allSpeakers: boolean; cfg: AlertConfig } => {
  const cfg: AlertConfig = { ...machineAlertConfig(), ...(alertId ? {} : { channels: ['push'] }), ...(quietUntil ? { quietUntil } : {}) };
  return { assignedTo: [], allSpeakers: alertId !== null, cfg };
};

export const MACHINE_LABEL: Record<MachineId, string> = { washer: 'Clothes washer', dryer: 'Clothes dryer', dishwasher: 'Dish washer' };
const lower = (id: MachineId) => MACHINE_LABEL[id].toLowerCase();

/** §7D.1 — the laundry machines in load order; a machine not in it (the dish washer, §7D.6) stands alone. */
const LAUNDRY: readonly MachineId[] = ['washer', 'dryer'];
export const isLaundry = (id: MachineId): boolean => LAUNDRY.includes(id);

/** §7D.2, §7D.6 — each machine's minute chips: the washer has a 2-hour cycle and no 45, dish cycles run longer. */
const MINUTES: Record<MachineId, readonly number[]> = { washer: [30, 60, 90, 120], dryer: [30, 45, 60, 90], dishwasher: [60, 90, 120, 150] };
export const machineMinutes = (id: MachineId): readonly number[] => MINUTES[id];
/** §8.5 — the button that ends a load in the last machine. */
export const finishLabel = (id: MachineId): string => (isLaundry(id) ? 'Fold & out' : 'Emptied');

/** The machine a load moves on to (washer → dryer), or null for the last or a lone machine. */
export function nextMachine(id: MachineId): MachineId | null {
  return isLaundry(id) ? LAUNDRY[LAUNDRY.indexOf(id) + 1] ?? null : null;
}
/** The machine whose load moves on to this one, or null for the first or a lone machine. */
export function previousMachine(id: MachineId): MachineId | null {
  return isLaundry(id) ? LAUNDRY[LAUNDRY.indexOf(id) - 1] ?? null : null;
}

export interface MachineRow {
  id: MachineId;
  owner_id: string | null;
  /** §7D.7 — who is alerted when it is done; null = nobody (phones only). */
  alert_id: string | null;
  minutes: number | null;
  started_at: string | null;
  done_at: string | null;
  started_by: string | null;
  updated_at: string | null;
}

/** §7D.1 — free (no load), running (before done-at), done (done-at passed). Derived, never stored; a load's owner may be unknown. */
export function machineState(row: MachineRow, now: string): MachineState {
  if (row.done_at === null) return 'free';
  return ms(now) < ms(row.done_at) ? 'running' : 'done';
}

export interface MachineChange { rows: MachineRow[]; closeFire?: FireRow; newFire?: NewFire }
export type MachineRefusal =
  | { error: 'busy'; machine: MachineRow }          // the target machine still holds a load
  | { error: 'not_done'; machine: MachineRow }
  | { error: 'invalid_state'; machine: MachineRow; why: 'no_next' | 'not_last' }
  | { error: 'already_free'; machine: MachineRow };
export type MachineResult = MachineChange | MachineRefusal;

const freed = (row: MachineRow, now: string): MachineRow =>
  ({ ...row, owner_id: null, alert_id: null, minutes: null, started_at: null, done_at: null, started_by: null, updated_at: now });
const loaded = (row: MachineRow, ownerId: string | null, alertId: string | null, minutes: number, by: string, now: string): MachineRow =>
  ({ ...row, owner_id: ownerId, alert_id: alertId, minutes, started_at: now, done_at: addMinutes(now, minutes), started_by: by, updated_at: now });

/** Start a free machine for `ownerId`, alerting `alertId` (§7D.7); its fire is due at done-at. */
export function startMachine(row: MachineRow, ownerId: string, alertId: string | null, minutes: number, by: string, now: string): MachineResult {
  if (machineState(row, now) !== 'free') return { error: 'busy', machine: row };
  const next = loaded(row, ownerId, alertId, minutes, by, now);
  return { rows: [next], newFire: newMachineFire(row.id, next.done_at!) };
}

/** Move a done load on (washer → dryer): the same owner and alert person, the next machine's own minutes. */
export function moveMachine(
  from: MachineRow, to: MachineRow | null, openFire: FireRow | null, minutes: number, by: string, now: string,
): MachineResult {
  if (!to || nextMachine(from.id) !== to.id) return { error: 'invalid_state', machine: from, why: 'no_next' };
  if (machineState(from, now) !== 'done') return { error: 'not_done', machine: from };
  if (machineState(to, now) !== 'free') return { error: 'busy', machine: to };
  const started = loaded(to, from.owner_id, from.alert_id, minutes, by, now);
  return {
    rows: [freed(from, now), started],
    closeFire: openFire ? closeFire(openFire, 'done', by, now) : undefined,
    newFire: newMachineFire(to.id, started.done_at!),
  };
}

/** Fold & out: a done load in the last machine ends its loop. */
export function finishMachine(row: MachineRow, openFire: FireRow | null, by: string, now: string): MachineResult {
  if (nextMachine(row.id) !== null) return { error: 'invalid_state', machine: row, why: 'not_last' };
  if (machineState(row, now) !== 'done') return { error: 'not_done', machine: row };
  return { rows: [freed(row, now)], closeFire: openFire ? closeFire(openFire, 'done', by, now) : undefined };
}

/**
 * Done now: the household's real state when the app missed it — a free machine whose load was
 * never started here (`ownerId` names it, or null: owner unknown), or a running one that finished early. Done at `now`;
 * any open fire closes `superseded` and a new one rings now (§7D.2).
 */
export function doneNowMachine(
  row: MachineRow, ownerId: string | null, alertId: string | null, openFire: FireRow | null, by: string, now: string,
): MachineResult {
  const state = machineState(row, now);
  if (state === 'done') return { error: 'busy', machine: row };
  const next: MachineRow = state === 'free'
    ? { ...loaded(row, ownerId, alertId, 0, by, now), minutes: null }
    : { ...row, done_at: now, updated_at: now };
  return {
    rows: [next],
    closeFire: openFire ? closeFire(openFire, 'superseded', by, now) : undefined,
    newFire: newMachineFire(row.id, now),
  };
}

/** Clear a running or done machine: nothing rings for it any more. */
export function clearMachine(row: MachineRow, openFire: FireRow | null, by: string, now: string): MachineResult {
  if (machineState(row, now) === 'free') return { error: 'already_free', machine: row };
  return { rows: [freed(row, now)], closeFire: openFire ? closeFire(openFire, 'removed', by, now) : undefined };
}

/**
 * Still loaded: a done load nobody has moved yet. Its open fire closes `superseded` and a new one
 * rings now, so the 15-minute reminders run again from the first (§7D.2, §7D.3).
 */
export function remindMachine(row: MachineRow, openFire: FireRow | null, by: string, now: string): MachineResult {
  if (machineState(row, now) !== 'done') return { error: 'not_done', machine: row };
  return {
    rows: [{ ...row, updated_at: now }],
    closeFire: openFire ? closeFire(openFire, 'superseded', by, now) : undefined,
    newFire: newMachineFire(row.id, now),
  };
}

/** §7D.3 — a fire due after the machine's done-at was restarted by Still loaded. */
export const isStillLoaded = (row: MachineRow, fireDueAt: string): boolean =>
  row.done_at !== null && ms(fireDueAt) > ms(row.done_at);

/** The refusal's message (§7D.2). `names`: display names of active members. */
export function refusalText(r: MachineRefusal, names: ReadonlyMap<string, string>): string {
  const label = MACHINE_LABEL[r.machine.id];
  switch (r.error) {
    case 'busy': {
      const name = r.machine.owner_id ? names.get(r.machine.owner_id) : undefined;
      return `The ${lower(r.machine.id)} still has ${name ? `${name}'s load` : 'a load'}.`;
    }
    case 'not_done': return `The ${lower(r.machine.id)} isn't done yet.`;
    case 'already_free': return `The ${lower(r.machine.id)} is already free.`;
    case 'invalid_state': return r.why === 'no_next'
      ? `${label} loads don't move on — use ${finishLabel(r.machine.id)}.`
      : `Fold & out is for the ${lower(LAUNDRY[LAUNDRY.length - 1])} — move this load on first.`;
  }
}

/**
 * §7D.3 — the done message. `ownerName`: the owner if still active, else null; undefined when the
 * load has no owner (Done now with nobody named), which says so and what the load needs next. `waiting`: the
 * name of a done load waiting in the machine before (null when that owner is not active), or
 * undefined when no load is waiting. `still`: the reminders were restarted by Still loaded, so the
 * message says what the load needs next.
 */
export function doneMessage(id: MachineId, ownerName: string | null | undefined, waiting?: string | null, still = false): string {
  // §7D.6 — a lone machine names who started it; nothing waits before it.
  if (!isLaundry(id)) return `The ${lower(id)}${ownerName ? ` ${ownerName} started` : ''} is ${still ? 'still full — empty it' : 'done'}`;
  const next = nextMachine(id);
  const base = ownerName === undefined
    ? (next ? `${MACHINE_LABEL[id]} finished; Owner unknown; Please cycle to dryer` : `${MACHINE_LABEL[id]} finished: Owner unknown: Please unload`) // MojoSOGO's words
    : !still
    ? ownerName ? `${ownerName}, your laundry in the ${lower(id)} is done` : `The laundry in the ${lower(id)} is done`
    : `${ownerName ? `${ownerName}, your laundry is` : 'The laundry is'} still in the ${lower(id)} — ${next ? `move it to the ${lower(next)}` : 'take it out'}`;
  if (waiting === undefined) return base;
  return `${base} — ${waiting ? `${waiting}'s load` : 'another load'} is waiting`;
}

/** The done load waiting in the machine before this one, if any (derived at alert time). */
export function waitingLoad(rows: readonly MachineRow[], id: MachineId, now: string): MachineRow | null {
  const prev = previousMachine(id);
  const row = prev ? rows.find((r) => r.id === prev) : undefined;
  return row && machineState(row, now) === 'done' ? row : null;
}

const minutesText = (id: MachineId) => `Minutes must be one of ${machineMinutes(id).join(', ')}.`;
const isMinutes = (id: MachineId, v: unknown): v is number => (machineMinutes(id) as readonly unknown[]).includes(v);

export const isMachineId = (v: unknown): v is MachineId => isOneOf(MACHINE, v);

/** §7D.7 — Alert when done: absent → `fallback` (the owner), null → nobody, else an active member. Undefined = refused. */
function alertOf(v: unknown, fallback: string | null, activeIds: readonly string[]): string | null | undefined {
  if (v === undefined) return fallback;
  if (v === null) return null;
  return typeof v === 'string' && activeIds.includes(v) ? v : undefined;
}
const ALERT_TEXT = 'Alert when done must be an active member or nobody.';

/** Start's body: whose load (an active member), who to alert (§7D.7) and one of the machine's minute chips. Returns the input or a message. */
export function parseStart(b: Record<string, unknown>, id: MachineId, activeIds: readonly string[]): { ownerId: string; alertId: string | null; minutes: number } | string {
  if (typeof b.ownerId !== 'string' || !activeIds.includes(b.ownerId)) return 'Whose load must be an active member.';
  if (!isMinutes(id, b.minutes)) return minutesText(id);
  const alertId = alertOf(b.alertId, b.ownerId, activeIds);
  return alertId === undefined ? ALERT_TEXT : { ownerId: b.ownerId, alertId, minutes: b.minutes };
}

/**
 * Done now's body when the machine is free: whose load — optional, never assumed (absent or null = owner unknown) — and
 * who to alert, following the owner when absent (§7D.7). A running machine keeps its own: both null, ignored.
 */
export function parseDoneNow(b: Record<string, unknown>, activeIds: readonly string[], free: boolean): { ownerId: string | null; alertId: string | null } | string {
  if (!free) return { ownerId: null, alertId: null };
  const ownerId = b.ownerId === undefined || b.ownerId === null ? null : b.ownerId;
  if (ownerId !== null && !(typeof ownerId === 'string' && activeIds.includes(ownerId))) return 'Whose load must be an active member.';
  const alertId = alertOf(b.alertId, ownerId as string | null, activeIds);
  return alertId === undefined ? ALERT_TEXT : { ownerId: ownerId as string | null, alertId };
}

/** Move's body: a minute chip of the machine it moves to (`to`). */
export function parseMove(b: Record<string, unknown>, to: MachineId): { minutes: number } | string {
  return isMinutes(to, b.minutes) ? { minutes: b.minutes } : minutesText(to);
}
