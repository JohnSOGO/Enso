// SPEC §8.18, §4.2zzc — feature requests: what Ensō can't do yet, kept for the next build. The limits, the status a
// size starts at, who may move a request where, and how long a closed one is shown. Pure: `now` is passed in.
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

/** ⚑ Q336 — a big one waits for John. */
export const statusForSize = (size: FeatureRequestSize): FeatureRequestStatus => (size === 'big' ? 'needs_john' : 'new');

export const isOpen = (status: FeatureRequestStatus) => status === 'new' || status === 'needs_john';

/** The earliest `updated_at` a closed request may have and still be listed. */
export const shownSince = (now: string) => addMinutes(now, -FEATURE_REQUEST_SHOWN_DAYS * 1440);

const clip = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');

/** POST /feature-requests → the cleaned fields, or the 400 message. */
export function parseFeatureRequestInput(b: Record<string, unknown>): { text: string; title: string; summary: string; size: FeatureRequestSize } | string {
  const text = typeof b.text === 'string' ? b.text.trim().slice(0, FEATURE_TEXT_MAX) : '';
  const title = clip(b.title, FEATURE_TITLE_MAX), summary = clip(b.summary, FEATURE_SUMMARY_MAX);
  if (!text || !title) return 'A request needs what was said and a title.';
  if (!isOneOf(FEATURE_REQUEST_SIZE, b.size)) return `size must be one of: ${FEATURE_REQUEST_SIZE.join(', ')}.`;
  return { text, title, summary, size: b.size };
}

export type Move = { status: FeatureRequestStatus } | { code: 400 | 403 | 409; message: string };

/** ⚑ Q337 — OK to build: the founder only, from Needs John to New. */
export function okMove(status: FeatureRequestStatus, founder: boolean): Move {
  if (!founder) return { code: 403, message: 'Only John can OK a request to build.' };
  return status === 'needs_john' ? { status: 'new' } : { code: 409, message: 'That request is not waiting for John.' };
}

/** ⚑ Q337 — Dismiss: any admin, an open request. */
export function dismissMove(status: FeatureRequestStatus, admin: boolean): Move {
  if (!admin) return { code: 403, message: 'Only an admin can dismiss a request.' };
  return isOpen(status) ? { status: 'dismissed' } : { code: 409, message: 'That request is already closed.' };
}

/** A build session closes an open request: done (built) or dismissed (already there, or not wanted). */
export function closeMove(status: FeatureRequestStatus, to: unknown): Move {
  if (to !== 'done' && to !== 'dismissed') return { code: 400, message: "status must be 'done' or 'dismissed'." };
  return isOpen(status) ? { status: to } : { code: 409, message: 'That request is already closed.' };
}

export const cleanNote = (v: unknown): string | null => clip(v, FEATURE_NOTE_MAX) || null;
