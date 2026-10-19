// SPEC §8.18, §1.3 — what was said to the Ensō button, as Claude read it: the wire shape POST /say answers with, the
// cleaner that checks a reminder with the same rules POST /reminders uses, the fixed request and outside lines, and
// what Clarify sends.
// Pure: `now` and `tz` are passed in; never decides what is saved.
import { WEEKDAY, isOneOf, type FeatureRequestSize, type Weekday } from './vocab';
import { ALERT_TITLE_MAX } from './alert-limits';
import { reminderTimeError, windowDays, windowError, type ReminderWindow } from './reminders';
import { FEATURE_SUMMARY_MAX, FEATURE_TITLE_MAX } from './feature-requests';

export const SAY_TEXT_MAX = 1000;
const SAY_MAX = 400;
const WHERE_MAX = 80;

/** What the reminder form starts from (§8.5b / §8.5c); a missing date + time leaves the form's own. */
export interface SayReminder { title: string; assignedTo: string[]; date: string | null; time: string | null; window: ReminderWindow | null }

/** POST /say (§10). `heard` = the cleaned-up words; `say` = the sentence shown and spoken. */
export type SayReading = { heard: string; say: string } & (
  | { kind: 'reminder'; reminder: SayReminder }
  | { kind: 'exists'; where: string }
  | { kind: 'request'; request: FeatureAsk }
  | { kind: 'outside'; where: string | null; request: FeatureAsk } // §1.3: logged as Out of scope on leaving
);
export interface FeatureAsk { title: string; summary: string; size: FeatureRequestSize }

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');

/** The request lines (§8.18): the same words whatever Claude said. */
export function requestSay(size: FeatureRequestSize): string {
  return "Ensō can't do that yet. I can save it as a feature request for the next build."
    + (size === 'big' ? " It's a big one, so John will look at it first." : '');
}

/** The outside line (§8.18 item 4, ⚑ Q339), with where the part that fits lives when there is one. */
export function outsideSay(where: string | null): string {
  return "That's outside what Ensō is for. Ensō keeps the family's calendar, reminders, chores, lists, recipes and house."
    + (where ? ` The part that fits is in ${where}.` : '');
}

/** Clarify: what was said before, then the new words. */
export const clarified = (before: string, more: string) => `${before.trim()}\n${more.trim()}`.slice(0, SAY_TEXT_MAX);

/** "me" → me, "everyone" → nobody ticked (everyone), a name → that member; an unknown name is left out; none → me. */
function whoOf(who: unknown, meId: string, members: { id: string; name: string }[]): string[] {
  const names = Array.isArray(who) ? who.filter((x): x is string => typeof x === 'string').map((x) => x.trim().toLowerCase()) : [];
  if (names.includes('everyone')) return [];
  const ids = names.map((n) => (n === 'me' ? meId : members.find((m) => m.name.trim().toLowerCase() === n)?.id)).filter((x): x is string => !!x);
  return ids.length ? [...new Set(ids)] : [meId];
}

/** Claude's raw answer → a SayReading, or null when it is not one. A reminder's times and window are kept only when
 *  POST /reminders would take them (else the form's own); a request's lines are always `requestSay`. */
export function cleanSayReading(raw: Record<string, unknown>, o: { tz: string; now: string; meId: string; members: { id: string; name: string }[] }): SayReading | null {
  const heard = str(raw.heard, SAY_TEXT_MAX), say = str(raw.say, SAY_MAX);
  if (raw.kind === 'exists') {
    const where = str(raw.where, WHERE_MAX);
    return where ? { kind: 'exists', heard, say: say || `Ensō already does this: ${where}.`, where } : null;
  }
  if (raw.kind === 'request' || raw.kind === 'outside') {
    const title = str(raw.title, FEATURE_TITLE_MAX);
    if (!title) return null;
    const size: FeatureRequestSize = raw.size === 'small' ? 'small' : 'big'; // unsure reads as big
    const request = { title, summary: str(raw.summary, FEATURE_SUMMARY_MAX), size };
    if (raw.kind === 'request') return { kind: 'request', heard, say: requestSay(size), request };
    const where = str(raw.where, WHERE_MAX) || null;
    return { kind: 'outside', heard, say: outsideSay(where), where, request };
  }
  if (raw.kind !== 'reminder' || !raw.reminder || typeof raw.reminder !== 'object') return null;
  const r = raw.reminder as Record<string, unknown>;
  const title = str(r.title, ALERT_TITLE_MAX);
  if (!title) return null;
  const days = Array.isArray(r.days) ? r.days.filter((d): d is Weekday => isOneOf(WEEKDAY, d)) : [];
  const w = { days: windowDays(days), from: r.from, to: r.to };
  const window = days.length && !windowError(w) ? (w as ReminderWindow) : null;
  const at = !window && !reminderTimeError(r.date, r.time, o.tz, o.now);
  return {
    kind: 'reminder', heard, say: say || `I'll remind you: ${title}.`,
    reminder: { title, assignedTo: whoOf(r.who, o.meId, o.members), date: at ? (r.date as string) : null, time: at ? (r.time as string) : null, window },
  };
}
