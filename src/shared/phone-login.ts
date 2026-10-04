// SPEC §6.6 — Sign in with my phone: the rules. Pure: `now` and the randomness are parameters, no I/O.
// The routes (src/worker/routes/phone-login.ts) persist what these decide; the PWA reads APPROVE_LOGIN_PATH.
import type { LoginRequestStatus, LoginView } from './vocab';

/** The approve page the push opens; the request id rides in the fragment (like an invite code, §6.2a). */
export const APPROVE_LOGIN_PATH = '/approve-login';
export const approveLoginUrl = (id: string) => `${APPROVE_LOGIN_PATH}#${id}`;

/** ⚑ Q131 — a request lives 2 minutes; at most 3 per email per 15 minutes. */
export const LOGIN_REQUEST_TTL_MIN = 2;
export const LOGIN_REQUESTS_PER_WINDOW = 3;
export const LOGIN_REQUEST_WINDOW_MIN = 15;
/** How much of the waiting browser's user agent is kept. */
export const USER_AGENT_MAX = 300;
/** How many random bytes matchNumbers needs. */
export const MATCH_RANDOM_BYTES = 4;

const plusMinutes = (iso: string, min: number) => new Date(Date.parse(iso) + min * 60_000).toISOString();
export const loginRequestExpiry = (now: string) => plusMinutes(now, LOGIN_REQUEST_TTL_MIN);
export const loginWindowStart = (now: string) => plusMinutes(now, -LOGIN_REQUEST_WINDOW_MIN);

/** The user agent as kept: cut to USER_AGENT_MAX, or null when there is none. */
export const keptUserAgent = (ua: unknown): string | null =>
  typeof ua === 'string' && ua.trim() ? ua.trim().slice(0, USER_AGENT_MAX) : null;

/**
 * Number matching: a 2-digit `match` (10–99) and three distinct 2-digit `choices`, one of them the match,
 * at a position the bytes choose. The two decoys are the match shifted by two distinct non-zero offsets mod 90.
 */
export function matchNumbers(bytes: ArrayLike<number>): { match: number; choices: number[] } {
  if (bytes.length < MATCH_RANDOM_BYTES) throw new Error(`matchNumbers needs ${MATCH_RANDOM_BYTES} random bytes`);
  const match = 10 + (bytes[0] % 90);
  const a = 1 + (bytes[1] % 89); // 1..89
  let b = 1 + (bytes[2] % 88); // 1..88, then shifted past a: 1..89, never a
  if (b >= a) b += 1;
  const shifted = (offset: number) => 10 + ((match - 10 + offset) % 90);
  const choices = [shifted(a), shifted(b)];
  choices.splice(bytes[3] % 3, 0, match);
  return { match, choices };
}

/** The part of a login_requests row the rules read. */
export interface LoginRequestState { memberId: string | null; status: LoginRequestStatus; match: number; expiresAt: string }

const isPast = (row: LoginRequestState, now: string) => Date.parse(now) >= Date.parse(row.expiresAt);

/** What the waiting browser is told. Expired is derived, never stored; a used request is spent → expired. */
export function pollView(row: LoginRequestState, now: string): LoginView {
  if (row.status === 'denied') return 'denied';
  if (row.status === 'used') return 'expired';
  return isPast(row, now) ? 'expired' : row.status;
}

/** What the phone is told: as pollView, except a used request did sign the browser in → approved. */
export const approveView = (row: LoginRequestState, now: string): LoginView =>
  row.status === 'used' ? 'approved' : pollView(row, now);

export type DecideRefusal = 'not_yours' | 'not_pending' | 'expired';

/**
 * The member answers on the phone: `choice` is the number tapped, or null for "This wasn't me".
 * The right number approves; a wrong one or null denies (⚑ Q132 — no second try).
 */
export function decide(row: LoginRequestState, memberId: string, choice: number | null, now: string):
  { ok: true; status: 'approved' | 'denied' } | { ok: false; refusal: DecideRefusal } {
  if (row.memberId === null || row.memberId !== memberId) return { ok: false, refusal: 'not_yours' };
  if (row.status !== 'pending') return { ok: false, refusal: 'not_pending' };
  if (isPast(row, now)) return { ok: false, refusal: 'expired' };
  return { ok: true, status: choice !== null && choice === row.match ? 'approved' : 'denied' };
}

/** The waiting browser collects its session: only an approved request, before it expires. It becomes `used`. */
export function claim(row: LoginRequestState, now: string): { ok: true } | { ok: false; refusal: 'not_approved' | 'expired' } {
  if (row.status !== 'approved') return { ok: false, refusal: 'not_approved' };
  if (isPast(row, now)) return { ok: false, refusal: 'expired' };
  return { ok: true };
}

const BROWSERS: [RegExp, string][] = [
  [/\bEdg(?:e|A|iOS)?\//, 'Edge'],
  [/\bOPR\/|\bOpera\b/, 'Opera'],
  [/\bSamsungBrowser\//, 'Samsung Internet'],
  [/\bFirefox\/|\bFxiOS\//, 'Firefox'],
  [/\bChrome\/|\bCriOS\//, 'Chrome'],
  [/\bVersion\/[\d.]+.*\bSafari\//, 'Safari'],
];
const SYSTEMS: [RegExp, string][] = [
  [/\biPhone\b/, 'iPhone'],
  [/\biPad\b/, 'iPad'],
  [/\bAndroid\b/, 'Android'],
  [/\bCrOS\b/, 'ChromeOS'],
  [/\bWindows\b/, 'Windows'],
  [/\bMacintosh\b|\bMac OS X\b/, 'Mac'],
  [/\bLinux\b/, 'Linux'],
];
export const UNKNOWN_BROWSER = 'Unknown browser';

/** "Chrome on Windows"; an unrecognised browser is "Unknown browser", an unrecognised system is left off. */
export function browserSummary(userAgent: string | null | undefined): string {
  const ua = userAgent ?? '';
  const browser = BROWSERS.find(([re]) => re.test(ua))?.[1] ?? UNKNOWN_BROWSER;
  const system = SYSTEMS.find(([re]) => re.test(ua))?.[1];
  return system ? `${browser} on ${system}` : browser;
}

/** What the approve screen shows when the place is not known. */
export const PLACE_UNKNOWN = 'Place unknown';

/** "Oceanside, US", "US", or null when neither is known (the screen then says PLACE_UNKNOWN). */
export function placeText(city: unknown, country: unknown): string | null {
  const parts = [city, country].filter((p): p is string => typeof p === 'string' && p.trim() !== '').map((p) => p.trim());
  return parts.length ? parts.join(', ') : null;
}

/** ⚑ Q135 — the push title of both notices. */
export const NOTICE_TITLE = '🔑 Ensō sign-in';
/** The login request's push body. Never the match number. */
export const loginRequestMessage = (browser: string) => `Sign-in request from ${browser} — tap to check`;
/** ⚑ Q133 — after a password sign-in. */
export const newSignInMessage = (browser: string) => `New sign-in on ${browser}`;
