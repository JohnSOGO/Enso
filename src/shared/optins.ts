// SPEC §7.5 — the one optional-event rule: an optional event exists for a member only if they
// have it on. Applied by /calendar, /fires and tick's recipients; pure, the on-sets are data.
import type { Channel } from './vocab';

/** Whether an event exists for this member: not optional, or they have it on. */
export function isOnFor(event: { optional: boolean | number }, memberId: string, onIds: readonly string[]): boolean {
  return !event.optional || onIds.includes(memberId);
}

export interface AudienceInput {
  optional: boolean | number;
  assignedTo: readonly string[];
  activeIds: readonly string[];
  onIds: readonly string[];
  channels: readonly Channel[];
}

/**
 * Who a fire's alert is for (§5.7, §7.5). `push`: active members, narrowed to the assigned ones
 * (none assigned = everyone), and for an optional event to those who have it on. `house` / `funhouse`: the
 * House channel speaks / the FunHouse gets it (§9.4b) — for an optional event only when that audience is not empty.
 */
export function audience(a: AudienceInput): { push: string[]; house: boolean; funhouse: boolean } {
  const forWhom = a.assignedTo.length === 0 ? a.activeIds : a.assignedTo.filter((id) => a.activeIds.includes(id));
  const push = forWhom.filter((id) => isOnFor(a, id, a.onIds));
  const anyone = !a.optional || push.length > 0;
  return { push, house: a.channels.includes('house') && anyone, funhouse: a.channels.includes('funhouse') && anyone };
}
