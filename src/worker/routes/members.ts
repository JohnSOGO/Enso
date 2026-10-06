// SPEC §6.2, §6.3 — members and invites.
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { all, first, newId, nowIso, randomBase32, run } from '../db';
import { body, fail, str } from '../http';
import { ROLE, isOneOf } from '../../shared/vocab';
import { ADMIN_ROLE, isAdmin } from '../../shared/roles';
import { requireMember, requireOwner, sha256hex } from '../session';
import { normalizeInviteCode } from './auth';

const INVITE_DAYS = 7;

export const members = new Hono<AppEnv>();
/** §6.3 — the founder is the member setup created: the earliest created_at. Derived, never stored. */
export const FOUNDER_SQL = 'SELECT id FROM members ORDER BY created_at, id LIMIT 1';

members.get('/members', requireMember, async (c) => {
  const isOwner = isAdmin(c.get('member'));
  const founder = (await first<{ id: string }>(c.env.DB, FOUNDER_SQL))?.id;
  const rows = await all<Record<string, unknown>>(c.env.DB,
    `SELECT id, email, display_name AS displayName, color, role, disabled_at AS disabledAt FROM members ORDER BY created_at`);
  return c.json(rows.map((r) => ({ ...r, isFounder: r.id === founder, email: isOwner ? r.email : undefined })));
});

members.patch('/members/:id', requireMember, requireOwner, async (c) => {
  const b = await body(c);
  const id = c.req.param('id');
  if (b.disabled !== undefined && typeof b.disabled !== 'boolean') return fail(c, 400, 'invalid_input', 'disabled must be true or false.');
  if (b.role !== undefined && !isOneOf(ROLE, b.role)) return fail(c, 400, 'invalid_input', `role must be one of: ${ROLE.join(', ')}.`);
  if (b.disabled === undefined && b.role === undefined) return fail(c, 400, 'invalid_input', 'Send disabled and/or role.');
  const target = await first<{ id: string; disabled_at: string | null }>(c.env.DB, 'SELECT id, disabled_at FROM members WHERE id = ?', id);
  if (!target) return fail(c, 404, 'not_found', 'No such member.');
  // §6.3: the founder is protected — never demoted, never disabled.
  if ((await first<{ id: string }>(c.env.DB, FOUNDER_SQL))?.id === id) {
    if (b.disabled === true) return fail(c, 400, 'invalid_input', 'The owner cannot be disabled.');
    if (b.role !== undefined && b.role !== ADMIN_ROLE) return fail(c, 400, 'invalid_input', "The owner can't be made a regular member.");
  }
  const disabledAfter = b.disabled === undefined ? target.disabled_at !== null : b.disabled;
  if (b.role === ADMIN_ROLE && disabledAfter) return fail(c, 400, 'invalid_input', 'Enable this member before making them an admin.');
  await c.env.DB.batch([
    ...(b.role !== undefined ? [c.env.DB.prepare('UPDATE members SET role = ? WHERE id = ?').bind(b.role, id)] : []),
    ...(b.disabled !== undefined ? [c.env.DB.prepare('UPDATE members SET disabled_at = ? WHERE id = ?').bind(b.disabled ? nowIso() : null, id)] : []),
    ...(b.disabled ? [c.env.DB.prepare('DELETE FROM sessions WHERE member_id = ?').bind(id)] : []),
  ]);
  return c.json({ ok: true });
});

members.get('/invites', requireMember, requireOwner, async (c) => {
  return c.json(await all(c.env.DB,
    `SELECT i.id, i.display_name AS displayName, i.created_at AS createdAt, i.expires_at AS expiresAt,
            i.used_at AS usedAt, m.display_name AS usedBy, i.revoked_at AS revokedAt
       FROM invites i LEFT JOIN members m ON m.id = i.used_by ORDER BY i.created_at DESC`));
});

members.post('/invites', requireMember, requireOwner, async (c) => {
  const b = await body(c);
  const displayName = str(b.displayName, 60);
  if (!displayName) return fail(c, 400, 'invalid_input', 'Enter the name of the person you are inviting.');
  const raw = randomBase32(12);
  const code = `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
  const now = nowIso();
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString();
  await run(c.env.DB,
    'INSERT INTO invites (id, code_hash, display_name, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
    newId('inv'), await sha256hex(normalizeInviteCode(code)), displayName, c.get('member').id, now, expiresAt);
  return c.json({ code, expiresAt }, 201);
});

members.delete('/invites/:id', requireMember, requireOwner, async (c) => {
  const r = await run(c.env.DB, 'UPDATE invites SET revoked_at = ? WHERE id = ? AND used_by IS NULL AND revoked_at IS NULL', nowIso(), c.req.param('id'));
  if (r.meta.changes !== 1) return fail(c, 404, 'not_found', 'No open invite with that id.');
  return c.json({ ok: true });
});
