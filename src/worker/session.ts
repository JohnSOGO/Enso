// SPEC §2.1, §6 — PBKDF2 passwords and opaque session cookies.
import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { AppEnv, SessionMember } from './env';
import { first, newId, run } from './db';
import { fail } from './http';

const ITERATIONS = 100_000; // Workers' PBKDF2 cap
const COOKIE = 'hrc_session';
const SESSION_DAYS = 90;

const b64 = (bytes: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(await pbkdf2(password, salt, ITERATIONS))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iter, salt, hash] = stored.split('$');
  if (scheme !== 'pbkdf2') return false;
  const actual = new Uint8Array(await pbkdf2(password, unb64(salt), Number(iter)));
  const expected = unb64(hash);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}

export async function sha256hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const expiry = () => new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();

export async function startSession(c: Context<AppEnv>, memberId: string): Promise<void> {
  const token = b64(crypto.getRandomValues(new Uint8Array(32)));
  await run(c.env.DB,
    'INSERT INTO sessions (id, member_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
    newId('ses'), memberId, await sha256hex(token), new Date().toISOString(), expiry());
  setCookie(c, COOKIE, token, {
    // §2.1: Secure whenever we were reached over HTTPS; a phone on the LAN dev server (plain HTTP) would drop it.
    httpOnly: true, secure: new URL(c.req.url).protocol === 'https:', sameSite: 'Lax', path: '/', maxAge: SESSION_DAYS * 86_400,
  });
}

export async function endSession(c: Context<AppEnv>): Promise<void> {
  const token = getCookie(c, COOKIE);
  if (token) await run(c.env.DB, 'DELETE FROM sessions WHERE token_hash = ?', await sha256hex(token));
  deleteCookie(c, COOKIE, { path: '/' });
}

/** Requires a valid session; slides its expiry; exposes c.get('member'). */
export const requireMember: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getCookie(c, COOKIE);
  if (!token) return fail(c, 401, 'unauthenticated', 'Please log in.');
  const hash = await sha256hex(token);
  const row = await first<SessionMember & { session_id: string; expires_at: string }>(c.env.DB,
    `SELECT s.id AS session_id, s.expires_at, m.id, m.email, m.display_name, m.color, m.role
       FROM sessions s JOIN members m ON m.id = s.member_id
      WHERE s.token_hash = ? AND m.disabled_at IS NULL`, hash);
  if (!row || row.expires_at < new Date().toISOString()) return fail(c, 401, 'unauthenticated', 'Your session has expired. Please log in again.');
  await run(c.env.DB, 'UPDATE sessions SET expires_at = ? WHERE id = ?', expiry(), row.session_id);
  c.set('member', { id: row.id, email: row.email, display_name: row.display_name, color: row.color, role: row.role });
  await next();
};

export const requireOwner: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get('member').role !== 'owner') return fail(c, 403, 'forbidden', 'Only the household owner can do that.');
  await next();
};
