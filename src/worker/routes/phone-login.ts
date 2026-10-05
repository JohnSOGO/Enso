// SPEC §6.6 — /auth/phone-login: a browser waits while the member approves it on their phone (number matching).
// Every well-formed email gets the identical 202 and waiting cookie; only a usable member under the limit gets a
// push, after the response. The waiting cookie alone collects the session, once (a guarded one-row claim). The
// rules — expiry, who may answer, what a tap means — are src/shared/phone-login.ts; this file persists them.
import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { AppEnv, Env } from '../env';
import {
  LOGIN_REQUESTS_PER_WINDOW, MATCH_RANDOM_BYTES, NOTICE_TITLE, PLACE_UNKNOWN, approveLoginUrl, approveView, browserSummary,
  claim, decide, keptUserAgent, loginRequestExpiry, loginRequestMessage, loginWindowStart, matchNumbers, newSignInMessage,
  placeText, pollView, type DecideRefusal, type LoginRequestState,
} from '../../shared/phone-login';
import type { LoginRequestStatus, NoticeKind } from '../../shared/vocab';
import { first, newId, nowIso, run } from '../db';
import { body, fail, str } from '../http';
import { pushDelivery } from '../deliveries';
import { sendPushDeliveries } from '../push';
import { requireMember, sha256hex, startSession } from '../session';

export const phoneLogin = new Hono<AppEnv>();

/** The waiting browser's cookie: its own name, sent only to /auth/phone-login, outliving the request a little. */
const WAITING_COOKIE = 'hrc_phone_login';
const WAITING_PATH = '/api/v1/auth/phone-login';
const WAITING_MAX_AGE_S = 10 * 60;

interface Row {
  id: string; member_id: string | null; match_number: number; choices: string; status: LoginRequestStatus;
  user_agent: string | null; place: string | null; created_at: string; expires_at: string;
}
const stateOf = (r: Row): LoginRequestState => ({ memberId: r.member_id, status: r.status, match: r.match_number, expiresAt: r.expires_at });
const byId = (db: D1Database, id: string) => first<Row>(db, 'SELECT * FROM login_requests WHERE id = ?', id);
const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

/** One fire-less push delivery that is a sign-in notice (§6.6), written, then sent. Never a house row. */
async function sendNotice(env: Env, memberId: string, notice: NoticeKind, message: string, url: string | null, now: string) {
  const { id, stmt } = pushDelivery(env.DB, { memberId, message, title: NOTICE_TITLE, notice, url }, now);
  await stmt.run();
  await sendPushDeliveries(env, [id], now);
}

/**
 * ⚑ Q133 — "New sign-in on {browser}" after a password sign-in: only to a member with a phone subscribed (with none
 * there is nobody to tell, so no row). A failure here is logged and never fails the sign-in.
 */
export async function sendSignInNotice(env: Env, memberId: string, userAgent: string | null | undefined, now: string): Promise<void> {
  try {
    const phones = await first<{ n: number }>(env.DB, 'SELECT COUNT(*) AS n FROM push_subscriptions WHERE member_id = ?', memberId);
    if (!phones?.n) return;
    await sendNotice(env, memberId, 'new_sign_in', newSignInMessage(browserSummary(keptUserAgent(userAgent))), null, now);
  } catch (err) {
    console.error('new sign-in notice not sent', err);
  }
}

phoneLogin.post('/auth/phone-login', async (c) => {
  const b = await body(c);
  const email = str(b.email, 254);
  if (!email || !/^[^\s@]+@[^\s@]+$/.test(email)) return fail(c, 400, 'invalid_input', 'Enter a valid email address.');
  const db = c.env.DB;
  const now = nowIso();
  const m = await first<{ id: string; disabled_at: string | null }>(db, 'SELECT id, disabled_at FROM members WHERE email = ?', email);
  const recent = (await first<{ n: number }>(db,
    'SELECT COUNT(*) AS n FROM login_requests WHERE email = ? AND created_at >= ?', email, loginWindowStart(now)))!.n;
  // No usable member, or over the limit → a decoy: member_id NULL, so nobody can approve it and it only expires.
  const memberId = m && !m.disabled_at && recent < LOGIN_REQUESTS_PER_WINDOW ? m.id : null;

  const { match, choices } = matchNumbers(crypto.getRandomValues(new Uint8Array(MATCH_RANDOM_BYTES)));
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const id = newId('lgn');
  const expiresAt = loginRequestExpiry(now);
  const ua = keptUserAgent(c.req.header('user-agent'));
  const cf = c.req.raw.cf as { city?: unknown; country?: unknown } | undefined;
  await db.batch([
    // At most one pending request per member: the old one is denied, never deleted (it is the rate-limit count).
    db.prepare(`UPDATE login_requests SET status = 'denied', decided_at = ? WHERE member_id = ? AND status = 'pending'`).bind(now, memberId),
    db.prepare(
      `INSERT INTO login_requests (id, member_id, email, waiting_token_hash, match_number, choices, status, user_agent, place, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`)
      .bind(id, memberId, email, await sha256hex(token), match, JSON.stringify(choices), ua, placeText(cf?.city, cf?.country), now, expiresAt),
  ]);
  setCookie(c, WAITING_COOKIE, token, {
    httpOnly: true, secure: new URL(c.req.url).protocol === 'https:', sameSite: 'Lax', path: WAITING_PATH, maxAge: WAITING_MAX_AGE_S,
  });
  if (memberId) {
    c.executionCtx.waitUntil(sendNotice(c.env, memberId, 'login', loginRequestMessage(browserSummary(ua)), approveLoginUrl(id), now)
      .catch((err) => console.error('sign-in request push not sent', err)));
  }
  return c.json({ match, expiresAt }, 202);
});

/** The waiting browser polls; an approved request is claimed here, once, and only then is a session started. */
phoneLogin.get('/auth/phone-login', async (c) => {
  const db = c.env.DB;
  const token = getCookie(c, WAITING_COOKIE);
  const row = token ? await first<Row>(db, 'SELECT * FROM login_requests WHERE waiting_token_hash = ?', await sha256hex(token)) : null;
  if (!row) return fail(c, 404, 'not_found', 'No sign-in request is waiting in this browser.');
  const now = nowIso();
  if (row.member_id && claim(stateOf(row), now).ok) {
    const took = await run(db,
      `UPDATE login_requests SET status = 'used', used_at = ? WHERE id = ? AND status = 'approved' AND expires_at > ?`, now, row.id, now);
    if (took.meta.changes === 1) {
      await startSession(c, row.member_id);
      deleteCookie(c, WAITING_COOKIE, { path: WAITING_PATH });
      return c.json({ status: 'approved' });
    }
    return c.json({ status: pollView(stateOf((await byId(db, row.id))!), now) }); // another poll won the claim
  }
  return c.json({ status: pollView(stateOf(row), now) });
});

const REFUSAL: Record<DecideRefusal, [404 | 409, string, string]> = {
  not_yours: [404, 'not_found', "This sign-in request isn't for you, or it is gone."],
  not_pending: [409, 'not_pending', 'This request was already answered.'],
  expired: [409, 'expired', 'This request has expired.'],
};
const refuse = (c: Context<AppEnv>, r: DecideRefusal) => fail(c, REFUSAL[r][0], REFUSAL[r][1], REFUSAL[r][2]);

phoneLogin.get('/auth/phone-login/:id', requireMember, async (c) => {
  const row = await byId(c.env.DB, c.req.param('id'));
  if (!row || row.member_id === null || row.member_id !== c.get('member').id) return refuse(c, 'not_yours');
  return c.json({
    id: row.id, browser: browserSummary(row.user_agent), place: row.place ?? PLACE_UNKNOWN, createdAt: row.created_at,
    expiresAt: row.expires_at, status: approveView(stateOf(row), nowIso()), choices: JSON.parse(row.choices) as number[],
  });
});

/** The member's answer: a number tapped, or null for "This wasn't me". */
async function answer(c: Context<AppEnv>, choice: number | null) {
  const db = c.env.DB;
  const now = nowIso();
  const row = await byId(db, c.req.param('id') ?? '');
  const d = row ? decide(stateOf(row), c.get('member').id, choice, now) : ({ ok: false, refusal: 'not_yours' } as const);
  if (!d.ok) return refuse(c, d.refusal);
  const r = await run(db, `UPDATE login_requests SET status = ?, decided_at = ? WHERE id = ? AND status = 'pending'`, d.status, now, row!.id);
  if (r.meta.changes !== 1) return refuse(c, 'not_pending');
  return c.json({ status: d.status });
}

phoneLogin.post('/auth/phone-login/:id/approve', requireMember, async (c) => {
  const b = await body(c);
  if (!Number.isInteger(b.number)) return fail(c, 400, 'invalid_input', 'Pick one of the numbers.');
  return answer(c, b.number as number);
});

phoneLogin.post('/auth/phone-login/:id/deny', requireMember, (c) => answer(c, null));
