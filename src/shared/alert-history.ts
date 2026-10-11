// SPEC §9.5 — My alerts: how a push I got is described back to me (its title and where it came from), how many
// are shown, and the link a tapped notification opens. Pure; imports vocab and announce only.
import { ANNOUNCE_TITLE } from './announce';
import type { AlertKind } from './vocab';

/** The newest this many of my pushes are listed. ⚑ Q221 */
export const ALERT_HISTORY_MAX = 200;

/** The title of a fire's push (§9.1). */
export const PUSH_TITLE = 'Ensō';

/** Where Settings → Alerts lives; sw.js carries its own copy (MA8 pins it). */
export const ALERTS_PATH = '/settings/alerts';

/** The title the phone showed: a fire's push → PUSH_TITLE; else the row's title (a ping, a notice) or ANNOUNCE_TITLE. */
export function pushTitle(r: { hasFire: boolean; title: string | null }): string {
  return r.hasFire ? PUSH_TITLE : r.title ?? ANNOUNCE_TITLE;
}

const KIND_SOURCE: Record<AlertKind, string> = {
  reminder: 'Reminder', timer: 'Rolling timer', chore: 'Chore', thing: 'Thing to do', machine: 'Machine',
};

export interface SourceFacts {
  hasFire: boolean; kind: AlertKind | null; isAlarm: boolean; notice: string | null; messId: string | null; title: string | null;
}

/** Where a push came from, in the order §9.5 gives (the ping branch matches opsPingsSince, §9.4). */
export function alertSource(r: SourceFacts): string {
  if (r.hasFire && r.kind) return r.kind === 'reminder' && r.isAlarm ? 'Alarm' : KIND_SOURCE[r.kind]; // ⚑ Q222
  if (r.notice) return 'Sign-in';
  if (r.messId) return 'Whose mess?';
  return r.title ?? 'Announcement'; // ⚑ Q223: a timer start announcement too
}

/** The alert id an address asks to open, or null. */
export function alertIdFrom(pathname: string, search: string): string | null {
  if (pathname !== ALERTS_PATH) return null;
  return new URLSearchParams(search).get('alert') || null;
}
