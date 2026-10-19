// SPEC §8.18, §4.2zzc, §4.2zzd — feature requests: what Ensō can't do yet (or an ask outside its scope, §1.3), kept
// for the next build or for John. The limits, the status a request starts at, the status sets, who may move a request where, and how long a closed one is shown. Pure: `now` is passed in.
import { FEATURE_REQUEST_SIZE, isOneOf, type FeatureRequestSize, type FeatureRequestStatus } from './vocab';
import { addMinutes } from './time';

export const FEATURE_TEXT_MAX = 1000;
export const FEATURE_TITLE_MAX = 80;
export const FEATURE_SUMMARY_MAX = 300;
export const FEATURE_NOTE_MAX = 200;
/** Done and dismissed requests stay listed this long; rows are never deleted. */
export const FEATURE_REQUEST_SHOWN_DAYS = 30;

/** GET /feature-requests, /ops/requests (§10). */
export interface FeatureRequest {
  id: string; text: string; title: string; summary: string; size: FeatureRequestSize; status: FeatureRequestStatus;
  note: string | null; createdBy: string; createdAt: string;
}

/** ⚑ Q336, Q339 — outside the scope is logged as such; else a big one waits for John. */
export const statusFor = (size: FeatureRequestSize, outside: boolean): FeatureRequestStatus =>
  (outside ? 'outside' : size === 'big' ? 'needs_john' : 'new');

/** The build queue (GET /ops/requests, closeMove). */
export const OPEN_STATUSES = ['new', 'needs_john'] as const satisfies readonly FeatureRequestStatus[];
/** Always listed, and what Dismiss acts on: the open ones and those outside the scope, waiting for John. */
export const LISTED_STATUSES = [...OPEN_STATUSES, 'outside'] as const satisfies readonly FeatureRequestStatus[];
/** What OK to build moves to New: waiting for John, or outside the scope (OK widens it, §1.3). */
const OK_FROM = ['needs_john', 'outside'] as const satisfies readonly FeatureRequestStatus[];

export const isOpen = (status: FeatureRequestStatus) => isOneOf(OPEN_STATUSES, status);
export const isListed = (status: FeatureRequestStatus) => isOneOf(LISTED_STATUSES, status);
export const canOk = (status: FeatureRequestStatus) => isOneOf(OK_FROM, status);

/** The earliest `updated_at` a closed request may have and still be listed. */
export const shownSince = (now: string) => addMinutes(now, -FEATURE_REQUEST_SHOWN_DAYS * 1440);

const clip = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');

/** POST /feature-requests → the cleaned fields, or the 400 message. */
export function parseFeatureRequestInput(b: Record<string, unknown>): { text: string; title: string; summary: string; size: FeatureRequestSize; outside: boolean } | string {
  const text = typeof b.text === 'string' ? b.text.trim().slice(0, FEATURE_TEXT_MAX) : '';
  const title = clip(b.title, FEATURE_TITLE_MAX), summary = clip(b.summary, FEATURE_SUMMARY_MAX);
  if (!text || !title) return 'A request needs what was said and a title.';
  if (!isOneOf(FEATURE_REQUEST_SIZE, b.size)) return `size must be one of: ${FEATURE_REQUEST_SIZE.join(', ')}.`;
  return { text, title, summary, size: b.size, outside: b.outside === true };
}

export type Move = { status: FeatureRequestStatus } | { code: 400 | 403 | 409; message: string };

/** ⚑ Q337, Q339 — OK to build: the founder only, from Needs John or Out of scope to New. */
export function okMove(status: FeatureRequestStatus, founder: boolean): Move {
  if (!founder) return { code: 403, message: 'Only John can OK a request to build.' };
  return canOk(status) ? { status: 'new' } : { code: 409, message: 'That request is not waiting for John.' };
}

/** ⚑ Q337 — Dismiss: any admin, an open or out-of-scope request. */
export function dismissMove(status: FeatureRequestStatus, admin: boolean): Move {
  if (!admin) return { code: 403, message: 'Only an admin can dismiss a request.' };
  return isListed(status) ? { status: 'dismissed' } : { code: 409, message: 'That request is already closed.' };
}

/** A build session closes an open request: done (built) or dismissed (already there, or not wanted). */
export function closeMove(status: FeatureRequestStatus, to: unknown): Move {
  if (to !== 'done' && to !== 'dismissed') return { code: 400, message: "status must be 'done' or 'dismissed'." };
  return isOpen(status) ? { status: to } : { code: 409, message: 'That request is already closed.' };
}

/** ⚑ Q344 — Build now starts the build session on a request still waiting in the queue (it moves no status). */
export const canBuild = (status: FeatureRequestStatus) => status === 'new';

/** ⚑ Q344 — Build now: any admin, a New request; else the refusal. */
export function buildRefusal(status: FeatureRequestStatus, admin: boolean): { code: 403 | 409; message: string } | null {
  if (!admin) return { code: 403, message: 'Only an admin can build a request now.' };
  return canBuild(status) ? null : { code: 409, message: "That request isn't waiting to be built." };
}

export const cleanNote = (v: unknown): string | null => clip(v, FEATURE_NOTE_MAX) || null;
