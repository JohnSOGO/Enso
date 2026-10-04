// SPEC §6 — setup, signup, invite preview, login, logout, me.
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { MEMBER_PALETTE } from '../../shared/vocab';
import { all, first, newId, nowIso, run } from '../db';
import { body, fail, str } from '../http';
import { endSession, hashPassword, requireMember, sha256hex, startSession, verifyPassword } from '../session';
import { sendSignInNotice } from './phone-login';
import { speakersError } from '../../shared/speakers';
import { choiceOf } from '../speaker-choices';

export const MIN_PASSWORD = 10;
const FAIL_WINDOW_MIN = 15;
const FAIL_LIMIT = 5;

/** §6.2 — uppercase, strip dashes/spaces, I/L→1, O→0. */
export function normalizeInviteCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');
}

/** §6.2 — wrong, expired, used and revoked codes all get this ONE message (preview and signup alike). */
const INVALID_CODE_MESSAGE = 'That invite code is not valid. Ask an admin of the household for a new one.';

interface UsableInvite { id: string; displayName: string; expiresAt: string; invitedBy: string | null }

/** §6.2/§6.2a — the invite a code opens, if it is unused, unrevoked and unexpired at `now`. Never writes. */
async function usableInvite(db: D1Database, code: unknown, now: string): Promise<UsableInvite | null> {
  if (typeof code !== 'string') return null;
  return first<UsableInvite>(db,
    `SELECT i.id, i.display_name AS displayName, i.expires_at AS expiresAt, m.display_name AS invitedBy
       FROM invites i LEFT JOIN members m ON m.id = i.created_by
      WHERE i.code_hash = ? AND i.used_by IS NULL AND i.revoked_at IS NULL AND i.expires_at > ?`,
    await sha256hex(normalizeInviteCode(code)), now);
}

async function nextColor(db: D1Database): Promise<string> {
  const used = new Set((await all<{ color: string }>(db, 'SELECT color FROM members')).map((r) => r.color));
  return MEMBER_PALETTE.find((c) => !used.has(c)) ?? MEMBER_PALETTE[used.size % MEMBER_PALETTE.length];
}

function credentialsError(b: Record<string, unknown>): string | null {
  const email = str(b.email, 254);
  if (!email || !/^[^\s@]+@[^\s@]+$/.test(email)) return 'Enter a valid email address.';
  if (typeof b.password !== 'string' || b.password.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
  if (!str(b.displayName, 60)) return 'Enter a display name (up to 60 characters).';
  return null;
}

async function createMember(db: D1Database, b: Record<string, unknown>, role: 'owner' | 'member') {
  const id = newId('mem');
  const now = nowIso();
  await db.batch([
    db.prepare('INSERT INTO members (id, email, display_name, color, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, str(b.email), str(b.displayName, 60), await nextColor(db), role, await hashPassword(b.password as string), now),
    db.prepare('INSERT INTO member_prefs (member_id) VALUES (?)').bind(id),
  ]);
  return id;
}

export async function memberView(db: D1Database, id: string) {
  const row = await first<Record<string, unknown> & { houseSpeakers: string | null }>(db,
    `SELECT m.id, m.email, m.display_name AS displayName, m.color, m.role,
            p.show_public_holidays AS showPublicHolidays,
            p.show_options_expiration AS showOptionsExpiration,
            p.house_speakers AS houseSpeakers
       FROM members m LEFT JOIN member_prefs p ON p.member_id = m.id WHERE m.id = ?`, id);
  return row && { ...row, houseSpeakers: choiceOf(row.houseSpeakers) };
}

export const auth = new Hono<AppEnv>();

auth.get('/setup', async (c) => {
  const row = await first<{ n: number }>(c.env.DB, 'SELECT COUNT(*) AS n FROM members');
  return c.json({ needed: (row?.n ?? 0) === 0 });
});

auth.post('/setup', async (c) => {
  const row = await first<{ n: number }>(c.env.DB, 'SELECT COUNT(*) AS n FROM members');
  if ((row?.n ?? 0) > 0) return fail(c, 410, 'setup_done', 'This household is already set up. Log in instead.');
  const b = await body(c);
  if (!c.env.SETUP_TOKEN || b.setupToken !== c.env.SETUP_TOKEN) return fail(c, 403, 'bad_setup_token', 'That setup token is not correct.');
  const err = credentialsError(b);
  if (err) return fail(c, 400, 'invalid_input', err);
  const id = await createMember(c.env.DB, b, 'owner');
  await startSession(c, id);
  return c.json(await memberView(c.env.DB, id), 201);
});

/** §6.2a — public and read-only: who is inviting whom, before joining. Never uses the invite. */
auth.post('/auth/invite-preview', async (c) => {
  const b = await body(c);
  const invite = await usableInvite(c.env.DB, b.code, nowIso());
  if (!invite) return fail(c, 400, 'invalid_code', INVALID_CODE_MESSAGE);
  const s = await first<{ household_name: string }>(c.env.DB, 'SELECT household_name FROM settings WHERE id = 1');
  return c.json({ displayName: invite.displayName, householdName: s?.household_name ?? null, invitedBy: invite.invitedBy, expiresAt: invite.expiresAt });
});

auth.post('/auth/signup', async (c) => {
  const b = await body(c);
  const err = credentialsError(b);
  if (err) return fail(c, 400, 'invalid_input', err);
  const invalid = () => fail(c, 400, 'invalid_code', INVALID_CODE_MESSAGE);
  const now = nowIso();
  const invite = await usableInvite(c.env.DB, b.code, now);
  if (!invite) return invalid();
  if (await first(c.env.DB, 'SELECT id FROM members WHERE email = ?', str(b.email))) {
    return fail(c, 409, 'email_taken', 'An account with that email already exists.');
  }
  const id = await createMember(c.env.DB, b, 'member');
  const claimed = await run(c.env.DB, 'UPDATE invites SET used_by = ?, used_at = ? WHERE id = ? AND used_by IS NULL', id, now, invite.id);
  if (claimed.meta.changes !== 1) {
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM member_prefs WHERE member_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM members WHERE id = ?').bind(id),
    ]);
    return invalid();
  }
  await startSession(c, id);
  return c.json(await memberView(c.env.DB, id), 201);
});

auth.post('/auth/login', async (c) => {
  const b = await body(c);
  const email = str(b.email, 254) ?? '';
  const since = new Date(Date.now() - FAIL_WINDOW_MIN * 60_000).toISOString();
  const recent = await first<{ n: number }>(c.env.DB, 'SELECT COUNT(*) AS n FROM login_failures WHERE email = ? AND at > ?', email, since);
  if ((recent?.n ?? 0) >= FAIL_LIMIT) {
    return fail(c, 429, 'rate_limited', `Too many failed attempts. Try again in ${FAIL_WINDOW_MIN} minutes.`);
  }
  const m = await first<{ id: string; password_hash: string; disabled_at: string | null }>(c.env.DB,
    'SELECT id, password_hash, disabled_at FROM members WHERE email = ?', email);
  const ok = m && !m.disabled_at && typeof b.password === 'string' && (await verifyPassword(b.password, m.password_hash));
  if (!ok) {
    await run(c.env.DB, 'INSERT INTO login_failures (email, at) VALUES (?, ?)', email, nowIso());
    return fail(c, 401, 'bad_credentials', 'Email or password is not correct.');
  }
  await run(c.env.DB, 'DELETE FROM login_failures WHERE email = ?', email);
  await startSession(c, m.id);
  await sendSignInNotice(c.env, m.id, c.req.header('user-agent'), nowIso()); // §6.6 ⚑ Q133
  return c.json(await memberView(c.env.DB, m.id));
});

auth.post('/auth/logout', async (c) => {
  await endSession(c);
  return c.body(null, 204);
});

auth.get('/me', requireMember, async (c) => c.json(await memberView(c.env.DB, c.get('member').id)));

auth.patch('/me', requireMember, async (c) => {
  const b = await body(c);
  const id = c.get('member').id;
  const stmts: D1PreparedStatement[] = [];
  if (b.displayName !== undefined) {
    const name = str(b.displayName, 60);
    if (!name) return fail(c, 400, 'invalid_input', 'Display name must be 1–60 characters.');
    stmts.push(c.env.DB.prepare('UPDATE members SET display_name = ? WHERE id = ?').bind(name, id));
  }
  if (b.color !== undefined) {
    if (typeof b.color !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(b.color)) return fail(c, 400, 'invalid_input', 'Color must look like #RRGGBB.');
    stmts.push(c.env.DB.prepare('UPDATE members SET color = ? WHERE id = ?').bind(b.color, id));
  }
  for (const [key, col] of [['showPublicHolidays', 'show_public_holidays'], ['showOptionsExpiration', 'show_options_expiration']] as const) {
    if (b[key] !== undefined) {
      if (typeof b[key] !== 'boolean') return fail(c, 400, 'invalid_input', `${key} must be true or false.`);
      stmts.push(c.env.DB.prepare(`UPDATE member_prefs SET ${col} = ? WHERE member_id = ?`).bind(b[key] ? 1 : 0, id));
    }
  }
  if (b.houseSpeakers !== undefined) {
    const err = speakersError(b.houseSpeakers);
    if (err) return fail(c, 400, 'invalid_input', err);
    stmts.push(c.env.DB.prepare('UPDATE member_prefs SET house_speakers = ? WHERE member_id = ?')
      .bind(b.houseSpeakers === null ? null : JSON.stringify(b.houseSpeakers), id));
  }
  if (stmts.length) await c.env.DB.batch(stmts);
  return c.json(await memberView(c.env.DB, id));
});
