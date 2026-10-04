// SPEC §3 — the only place these strings are defined. Import; never retype.

export const ALERT_KIND = ['reminder', 'timer', 'chore', 'thing', 'machine'] as const;
export const CHANNEL = ['push', 'house'] as const;
export const FIRE_STATE = ['scheduled', 'ringing', 'closed'] as const;
export const CLOSE_REASON = ['done', 'acked', 'missed', 'superseded', 'stopped', 'removed'] as const;
export const ACTION = ['done', 'snooze', 'ack'] as const;
export const TIMER_CMD = ['start', 'stop'] as const;
export const DELIVERY_STATUS = ['queued', 'claimed', 'sent', 'partial', 'failed'] as const;
export const ROLE = ['owner', 'member'] as const;
export const FREQ = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const;
export const WEEKDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;
export const CHORE_TIMING = ['at', 'by'] as const; // §7B
export const THING_STATUS = ['idea', 'planned', 'done', 'dropped'] as const; // §7C
export const MACHINE = ['washer', 'dryer'] as const; // §7D, in load order
export const MACHINE_STATE = ['free', 'running', 'done'] as const; // §7D, derived, never stored
export const SUN_EVENT = ['sunset'] as const; // §7.7 events.start_sun — there is no sunrise
export const RECIPE_SOURCE = ['description', 'captions', 'transcript', 'comments', 'typed'] as const; // §7E what a recipe was read from ('transcript': pasted, §7E.2b)
export const CAPTIONS_FAILURE = ['blocked', 'none', 'failed'] as const; // §7E why captions couldn't be read
export const IDENTIFY_FAILURE = ['off', 'failed'] as const; // §7A.3 why SogoAI gave no reading of a snapped item
export const ITEM_READ_VIA = ['sogoai', 'claude'] as const; // §7A.3 who named a snapped item

export type AlertKind = (typeof ALERT_KIND)[number];
export type Channel = (typeof CHANNEL)[number];
export type FireState = (typeof FIRE_STATE)[number];
export type CloseReason = (typeof CLOSE_REASON)[number];
export type Action = (typeof ACTION)[number];
export type TimerCmd = (typeof TIMER_CMD)[number];
export type DeliveryStatus = (typeof DELIVERY_STATUS)[number];
export type Role = (typeof ROLE)[number];
export type Freq = (typeof FREQ)[number];
export type Weekday = (typeof WEEKDAY)[number];
export type ChoreTiming = (typeof CHORE_TIMING)[number];
export type ThingStatus = (typeof THING_STATUS)[number];
export type MachineId = (typeof MACHINE)[number];
export type MachineState = (typeof MACHINE_STATE)[number];
export type SunEvent = (typeof SUN_EVENT)[number];
export type RecipeSource = (typeof RECIPE_SOURCE)[number];
export type CaptionsFailure = (typeof CAPTIONS_FAILURE)[number];
export type IdentifyFailure = (typeof IDENTIFY_FAILURE)[number];
export type ItemReadVia = (typeof ITEM_READ_VIA)[number];

/** /status `house.state` (§9.2) — derived from the deliveries table, never stored. */
export const HOUSE_STATE = ['ok', 'failing', 'not_configured', 'untried'] as const;
export type HouseState = (typeof HOUSE_STATE)[number];

export function isOneOf<T extends string>(list: readonly T[], v: unknown): v is T {
  return typeof v === 'string' && (list as readonly string[]).includes(v);
}

/** Member colors (§8.4), assigned in order at signup. Red and blue mean holidays. */
export const MEMBER_PALETTE = [
  '#FF6B35', '#10B981', '#8B5CF6', '#EC4899',
  '#F59E0B', '#06B6D4', '#84CC16', '#A16207',
] as const;
