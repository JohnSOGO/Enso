// SPEC §7D — the laundry loop: a machine's state, its transitions, the done message, input rules.
// Pure: `now` is always a parameter. Imports engine + vocab + time; the engine never imports this.
import { closeFire, newMachineFire, type AlertConfig, type FireRow, type NewFire } from './engine';
import { MACHINE, isOneOf, type Channel, type MachineId, type MachineState } from './vocab';
import { addMinutes, ms } from './time';

export const MACHINE_MINUTES = [30, 45, 60, 90] as const;
export const MACHINE_RENOTIFY_MIN = 15;
export const MACHINE_MAX_ALERTS = 4;
export const MACHINE_CHANNELS: readonly Channel[] = ['push', 'house'];

/** §7D.3 — every machine fire rings alike. */
export const machineAlertConfig = (): AlertConfig =>
  ({ channels: [...MACHINE_CHANNELS], renotifyMin: MACHINE_RENOTIFY_MIN, maxAlerts: MACHINE_MAX_ALERTS });

export const MACHINE_LABEL: Record<MachineId, string> = { washer: 'Washer', dryer: 'Dryer' };
const lower = (id: MachineId) => MACHINE_LABEL[id].toLowerCase();

/** The machine a load moves on to (washer → dryer), or null for the last. */
export function nextMachine(id: MachineId): MachineId | null {
  return MACHINE[MACHINE.indexOf(id) + 1] ?? null;
}
/** The machine whose load moves on to this one, or null for the first. */
export function previousMachine(id: MachineId): MachineId | null {
  return MACHINE[MACHINE.indexOf(id) - 1] ?? null;
}

export interface MachineRow {
  id: MachineId;
  owner_id: string | null;
  minutes: number | null;
  started_at: string | null;
  done_at: string | null;
  started_by: string | null;
  updated_at: string | null;
}

/** §7D.1 — free (no owner), running (before done-at), done (done-at passed). Derived, never stored. */
export function machineState(row: MachineRow, now: string): MachineState {
  if (row.owner_id === null || row.done_at === null) return 'free';
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
  ({ ...row, owner_id: null, minutes: null, started_at: null, done_at: null, started_by: null, updated_at: now });
const loaded = (row: MachineRow, ownerId: string, minutes: number, by: string, now: string): MachineRow =>
  ({ ...row, owner_id: ownerId, minutes, started_at: now, done_at: addMinutes(now, minutes), started_by: by, updated_at: now });

/** Start a free machine for `ownerId`; its fire is due at done-at. */
export function startMachine(row: MachineRow, ownerId: string, minutes: number, by: string, now: string): MachineResult {
  if (machineState(row, now) !== 'free') return { error: 'busy', machine: row };
  const next = loaded(row, ownerId, minutes, by, now);
  return { rows: [next], newFire: newMachineFire(row.id, next.done_at!) };
}

/** Move a done load on (washer → dryer): the same owner, the next machine's own minutes. */
export function moveMachine(
  from: MachineRow, to: MachineRow | null, openFire: FireRow | null, minutes: number, by: string, now: string,
): MachineResult {
  if (!to || nextMachine(from.id) !== to.id) return { error: 'invalid_state', machine: from, why: 'no_next' };
  if (machineState(from, now) !== 'done') return { error: 'not_done', machine: from };
  if (machineState(to, now) !== 'free') return { error: 'busy', machine: to };
  const started = loaded(to, from.owner_id!, minutes, by, now);
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

/** Clear a running or done machine: nothing rings for it any more. */
export function clearMachine(row: MachineRow, openFire: FireRow | null, by: string, now: string): MachineResult {
  if (machineState(row, now) === 'free') return { error: 'already_free', machine: row };
  return { rows: [freed(row, now)], closeFire: openFire ? closeFire(openFire, 'removed', by, now) : undefined };
}

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
      ? `${label} loads don't move on — use Fold & out.`
      : `Fold & out is for the ${lower(MACHINE[MACHINE.length - 1])} — move this load on first.`;
  }
}

/**
 * §7D.3 — the done message. `ownerName`: the owner if still active, else null. `waiting`: the
 * name of a done load waiting in the machine before (null when that owner is not active), or
 * undefined when no load is waiting.
 */
export function doneMessage(id: MachineId, ownerName: string | null, waiting?: string | null): string {
  const base = ownerName ? `${ownerName}, your laundry in the ${lower(id)} is done` : `The laundry in the ${lower(id)} is done`;
  if (waiting === undefined) return base;
  return `${base} — ${waiting ? `${waiting}'s load` : 'another load'} is waiting`;
}

/** The done load waiting in the machine before this one, if any (derived at alert time). */
export function waitingLoad(rows: readonly MachineRow[], id: MachineId, now: string): MachineRow | null {
  const prev = previousMachine(id);
  const row = prev ? rows.find((r) => r.id === prev) : undefined;
  return row && machineState(row, now) === 'done' ? row : null;
}

const MINUTES_TEXT = `Minutes must be one of ${MACHINE_MINUTES.join(', ')}.`;
const isMinutes = (v: unknown): v is number => (MACHINE_MINUTES as readonly unknown[]).includes(v);

export const isMachineId = (v: unknown): v is MachineId => isOneOf(MACHINE, v);

/** Start's body: whose load (an active member) and a minute chip. Returns the input or a message. */
export function parseStart(b: Record<string, unknown>, activeIds: readonly string[]): { ownerId: string; minutes: number } | string {
  if (typeof b.ownerId !== 'string' || !activeIds.includes(b.ownerId)) return 'Whose load must be an active member.';
  if (!isMinutes(b.minutes)) return MINUTES_TEXT;
  return { ownerId: b.ownerId, minutes: b.minutes };
}

/** Move's body: the next machine's minute chip. */
export function parseMove(b: Record<string, unknown>): { minutes: number } | string {
  return isMinutes(b.minutes) ? { minutes: b.minutes } : MINUTES_TEXT;
}
