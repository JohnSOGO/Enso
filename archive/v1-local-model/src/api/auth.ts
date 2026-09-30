// src/api/auth.ts — Authentication endpoints
import { Hono } from 'hono';
import { getDB, type DB } from '../lib/db';
import { generateJWT, verifyInviteCode, hashInviteCode, generateUUID } from '../lib/auth';

const auth = new Hono();

/** POST /api/v1/auth/signup-with-code */
auth.post('/signup-with-code', async (c) => {
  const db: DB = getDB();
  
  try {
    const body = await c.req.json() as {
      invite_code: string;
      email: string;
      password: string;
      display_name: string;
    };

    if (!body.invite_code || !body.email || !body.password || !body.display_name) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    // Find the invite code
    const codes = await db.query<any>(
      `SELECT * FROM invite_codes WHERE code_hash = ? AND revoked = 0 AND expires_at > datetime('now')`,
      [await hashInviteCode(body.invite_code)]
    );

    if (codes.length === 0) {
      return c.json({ error: 'Invalid or expired invite code' }, 401);
    }

    const invite = codes[0];

    // Check if email already exists in this household
    const existing = await db.query<any>(
      `SELECT id FROM members WHERE email = ? AND household_id = ?`,
      [body.email, invite.household_id]
    );

    if (existing.length > 0) {
      return c.json({ error: 'Email already registered in this household' }, 409);
    }

    // Hash password (using Web Crypto API — works in both Node and Workers)
    const passwordBuffer = new TextEncoder().encode(body.password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', passwordBuffer);
    const passwordHash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Create member
    const memberId = generateUUID();
    await db.execute(
      `INSERT INTO members (id, household_id, email, password_hash, display_name, role) VALUES (?, ?, ?, ?, ?, ?)`,
      [memberId, invite.household_id, body.email, passwordHash, body.display_name, invite.role]
    );

    // Mark invite code as used
    await db.execute(
      `UPDATE invite_codes SET used_by = ?, revoked = 1 WHERE id = ?`,
      [memberId, invite.id]
    );

    // Generate JWT
    const jwt = await generateJWT({
      sub: memberId,
      household_id: invite.household_id,
      role: invite.role as 'owner' | 'admin' | 'member',
    });

    return c.json({
      user_id: memberId,
      household_id: invite.household_id,
      jwt,
      display_name: body.display_name,
    }, 201);

  } catch (err) {
    console.error('Signup error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/** POST /api/v1/auth/login */
auth.post('/login', async (c) => {
  const db = getDB();

  try {
    const body = await c.req.json() as { email: string; password: string };

    if (!body.email || !body.password) {
      return c.json({ error: 'Missing email or password' }, 400);
    }

    // Hash the provided password
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body.password));
    const passwordHash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Find member
    const members = await db.query<any>(
      `SELECT id, household_id, role FROM members WHERE email = ? AND password_hash = ? AND status = 'active'`,
      [body.email, passwordHash]
    );

    if (members.length === 0) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    const member = members[0];

    // Generate JWT
    const jwt = await generateJWT({
      sub: member.id,
      household_id: member.household_id,
      role: member.role as 'owner' | 'admin' | 'member',
    });

    return c.json({
      user_id: member.id,
      household_id: member.household_id,
      jwt,
    });

  } catch (err) {
    console.error('Login error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/** POST /api/v1/auth/refresh */
auth.post('/refresh', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing authorization header' }, 401);
  }

  const token = authHeader.slice(7);
  // In production, validate refresh token from DB/session store.
  // For now, just re-issue the JWT (simplified).
  const payload = await import('../lib/auth').then(m => m.verifyJWT(token));
  
  if (!payload) {
    return c.json({ error: 'Invalid token' }, 401);
  }

  const newJwt = await generateJWT(payload);
  return c.json({ jwt: newJwt });
});

export default auth;
