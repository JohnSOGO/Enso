// SPEC §3 — the only place these strings are defined. Import; never retype.

export const ALERT_KIND = ['reminder', 'timer'] as const;
export const CHANNEL = ['push', 'house'] as const;
export const FIRE_STATE = ['scheduled', 'ringing', 'closed'] as const;
export const CLOSE_REASON = ['done', 'acked', 'missed', 'superseded', 'stopped', 'removed'] as const;
export const ACTION = ['done', 'snooze', 'ack'] as const;
export const TIMER_CMD = ['start', 'stop'] as const;
export const DELIVERY_STATUS = ['queued', 'claimed', 'sent', 'partial', 'failed'] as const;
export const ROLE = ['owner', 'member'] as const;
export const FREQ = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const;
export const WEEKDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;
export const LIST = ['shopping', 'wishlist'] as const; // §7A

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
export type List = (typeof LIST)[number];

/** Statuses the relay may report (§9.2). The server's /relay/report accepts exactly these. */
export const RELAY_REPORT_STATUS = ['sent', 'partial', 'failed'] as const satisfies readonly DeliveryStatus[];
export type RelayReportStatus = (typeof RELAY_REPORT_STATUS)[number];

export function isOneOf<T extends string>(list: readonly T[], v: unknown): v is T {
  return typeof v === 'string' && (list as readonly string[]).includes(v);
}

/** Member colors (§8.4), assigned in order at signup. Red and blue mean holidays. */
export const MEMBER_PALETTE = [
  '#FF6B35', '#10B981', '#8B5CF6', '#EC4899',
  '#F59E0B', '#06B6D4', '#84CC16', '#A16207',
] as const;
