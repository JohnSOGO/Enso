// SPEC §8.18, §1.3 — what was said to the Ensō button, as Claude read it: the wire shape POST /say answers with, the
// cleaner that checks a reminder with the same rules POST /reminders uses, the want and steps (⚑ Q380), the fixed request
// and outside lines and steps, and what Clarify sends.
// Pure: `now` and `tz` are passed in; never decides what is saved.
import { WEEKDAY, isOneOf, type FeatureRequestSize, type Weekday } from './vocab';
import { ALERT_TITLE_MAX } from './alert-limits';
import { reminderTimeError, windowDays, windowError, type ReminderWindow } from './reminders';
import { isDate, isTime } from './time';
import { FEATURE_SUMMARY_MAX, FEATURE_TITLE_MAX } from './feature-requests';

export const SAY_TEXT_MAX = 1000;
/** §8.18 part 2 ⚑ Q378 — a recorded clip POST /say/hear writes down: the types phones record, the size and length bounds. */
export const SAY_AUDIO_TYPES = ['audio/mp4', 'audio/webm', 'audio/ogg', 'audio/wav'] as const;
export const SAY_AUDIO_MAX_BYTES = 2 * 1024 * 1024;
export const SAY_CLIP_MAX_MS = 60_000;
const SAY_MAX = 400;
const WHERE_MAX = 80;
/** ⚑ Q380 — the answer's steps: at most this many, each at most this long (not the recipe STEPS_MAX). */
const SAY_STEPS_MAX = 4;
const SAY_STEP_MAX = 100;

/** What the reminder form starts from (§8.5b / §8.5c); a missing date + time leaves the form's own. */
export interface SayReminder { title: string; assignedTo: string[]; date: string | null; time: string | null; window: ReminderWindow | null }

/** What the new-event form starts from (§8.4, ⚑ Q341); `time` null = all day. */
export interface SayEvent { title: string; date: string; time: string | null; assignedTo: string[] }

/** POST /say (§10). `heard` = the cleaned-up words; `want` = the gist; `say` = the sentence spoken; `steps` = what Yes does. */
export type SayReading = { heard: string; want: string; say: string; steps: string[] } & SayKind;
type SayKind = (
  | { kind: 'reminder'; reminder: SayReminder }
  | { kind: 'event'; event: SayEvent }
  | { kind: 'exists'; where: string }
  | { kind: 'request'; request: FeatureAsk }
  | { kind: 'outside'; where: string | null; request: FeatureAsk } // §1.3: logged as Out of scope on leaving
);
type Read = { heard: string; say: string } & SayKind;
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

/** The request and outside steps (⚑ Q380), read after "I will": always these, so Ensō never promises a build. */
export function requestSteps(size: FeatureRequestSize): string[] {
  return ['save it as a feature request', size === 'big' ? 'let John look at it first' : 'leave it for the next build'];
}
export function outsideSteps(where: string | null): string[] {
  return ['log it as Out of scope for John', ...(where ? [`point you to ${where}`] : [])];
}

/** ⚑ Q380 — the question every answer but Outside ends with (MojoSOGO "ask, did I get that right?"). */
export const SAY_CHECK = 'Did I get that right?';

/** The steps said back: "I will a, b and c." */
export function sayBack(steps: string[]): string {
  const list = steps.length > 1 ? `${steps.slice(0, -1).join(', ')} and ${steps[steps.length - 1]}` : steps[0] ?? '';
  return `I will ${list.replace(/[.\s]+$/, '')}.`;
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

type CleanOpts = { tz: string; now: string; meId: string; members: { id: string; name: string }[] };

/** Claude's raw answer → a SayReading, or null when it is not one. A reminder's times and window are kept only when
 *  POST /reminders would take them (else the form's own); a request's lines and steps are always the fixed ones. */
export function cleanSayReading(raw: Record<string, unknown>, o: CleanOpts): SayReading | null {
  const r = cleanKind(raw, o);
  if (!r) return null;
  const own = Array.isArray(raw.steps) ? raw.steps.map((x) => str(x, SAY_STEP_MAX)).filter(Boolean).slice(0, SAY_STEPS_MAX) : [];
  const steps = r.kind === 'request' ? requestSteps(r.request.size)
    : r.kind === 'outside' ? outsideSteps(r.where)
    : own.length ? own : [r.say];
  const say = r.kind === 'outside' ? r.say
    : r.kind === 'request' || !own.length ? `${r.say} ${SAY_CHECK}`
    : `${sayBack(own)} ${SAY_CHECK}`;
  return { ...r, want: str(raw.want, SAY_MAX) || r.heard, say, steps };
}

function cleanKind(raw: Record<string, unknown>, o: CleanOpts): Read | null {
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
  if (raw.kind === 'event') {
    const e = (raw.event && typeof raw.event === 'object' ? raw.event : {}) as Record<string, unknown>;
    const title = str(e.title, ALERT_TITLE_MAX);
    if (!title || !isDate(e.date)) return null; // no real date: not read
    return {
      kind: 'event', heard, say: say || `I'll add ${title} to the calendar.`,
      event: { title, date: e.date, time: isTime(e.time) ? e.time : null, assignedTo: whoOf(e.who, o.meId, o.members) },
    };
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
