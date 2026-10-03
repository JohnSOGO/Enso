// M2 acceptance — SPEC §11.
import { SELF, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { Client, OWNER, member, owner } from './helpers';

describe('accounts', () => {
  it('setup works once, then 410', async () => {
    const o = await owner();
    expect((await o.get('/me')).json.role).toBe('owner');
    const again = await new Client().post('/setup', { setupToken: env.SETUP_TOKEN, ...OWNER, email: 'x@example.com' });
    expect(again.status).toBe(410);
    expect(again.json.message).toBeTruthy();
  });

  it('a used code is invalid_code', async () => {
    const o = await owner();
    const inv = await o.post('/invites', { displayName: 'Kid' });
    expect(inv.json.code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    const first = await new Client().post('/auth/signup', { code: inv.json.code.toLowerCase(), email: 'kid@example.com', password: 'kid-password-1', displayName: 'Kid' });
    expect(first.status).toBe(201);
    const second = await new Client().post('/auth/signup', { code: inv.json.code, email: 'kid2@example.com', password: 'kid-password-1', displayName: 'Kid 2' });
    expect(second.json.error).toBe('invalid_code');
  });

  it('an expired code is invalid_code', async () => {
    const o = await owner();
    const inv = await o.post('/invites', { displayName: 'Late' });
    await env.DB.prepare(`UPDATE invites SET expires_at = '2000-01-01T00:00:00.000Z' WHERE display_name = 'Late'`).run();
    const r = await new Client().post('/auth/signup', { code: inv.json.code, email: 'late@example.com', password: 'late-password-1', displayName: 'Late' });
    expect(r.json.error).toBe('invalid_code');
  });

  it('a revoked code is invalid_code', async () => {
    const o = await owner();
    const inv = await o.post('/invites', { displayName: 'Revoked' });
    const list = await o.get('/invites');
    const id = list.json.find((i: any) => i.displayName === 'Revoked').id;
    expect((await o.del(`/invites/${id}`)).status).toBe(200);
    const r = await new Client().post('/auth/signup', { code: inv.json.code, email: 'rev@example.com', password: 'rev-password-12', displayName: 'Rev' });
    expect(r.json.error).toBe('invalid_code');
  });

  it('a member cannot create an invite', async () => {
    const o = await owner();
    const m = await member(o);
    expect((await m.client.post('/invites', { displayName: 'x' })).status).toBe(403);
  });

  it('members get distinct palette colors', async () => {
    const o = await owner();
    const a = await member(o), b = await member(o);
    const colors = (await o.get('/members')).json.map((m: any) => m.color);
    expect(new Set(colors).size).toBe(colors.length);
    expect(a.id).not.toBe(b.id);
  });

  it('the 6th bad login is 429', async () => {
    const c = new Client();
    const statuses = [];
    for (let i = 0; i < 6; i++) statuses.push((await c.post('/auth/login', { email: 'nobody@example.com', password: 'wrong-password' })).status);
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
  });

  it('a disabled member cannot log in and loses their session', async () => {
    const o = await owner();
    const inv = await o.post('/invites', { displayName: 'Gone' });
    const m = new Client();
    const s = await m.post('/auth/signup', { code: inv.json.code, email: 'gone@example.com', password: 'gone-password-1', displayName: 'Gone' });
    expect((await o.patch(`/members/${s.json.id}`, { disabled: true })).status).toBe(200);
    expect((await m.get('/me')).status).toBe(401);
    expect((await new Client().post('/auth/login', { email: 'gone@example.com', password: 'gone-password-1' })).status).toBe(401);
  });

  it('logout ends the session', async () => {
    const o = await owner();
    expect((await o.post('/auth/logout')).status).toBe(204);
    expect((await o.get('/me')).status).toBe(401);
  });

  it('every error has a non-empty message', async () => {
    const r = await new Client().get('/me');
    expect(r.status).toBe(401);
    expect(r.json.message.length).toBeGreaterThan(0);
  });
});

describe('invite preview (SPEC §6.2a, M4d)', () => {
  const hex = async (s: string) =>
    [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const preview = (code: string, c = new Client()) => c.post('/auth/invite-preview', { code });
  const signup = (code: string, email: string, displayName: string) =>
    new Client().post('/auth/signup', { code, email, password: 'joiner-password-1', displayName });

  it('I1 preview a fresh code → 200 with the four fields; the invite is still unused', async () => {
    const o = await owner();
    const inv = await o.post('/invites', { displayName: 'I1 Kai' });
    const r = await preview(inv.json.code);
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ displayName: 'I1 Kai', householdName: expect.any(String), invitedBy: OWNER.displayName, expiresAt: inv.json.expiresAt });
    const row = (await o.get('/invites')).json.find((i: any) => i.displayName === 'I1 Kai');
    expect(row.usedAt).toBeNull();
    expect(row.usedBy).toBeNull();
  });

  it('I2 preview with dashes removed, lower-case and I/L/O swapped in → 200', async () => {
    const o = await owner();
    await o.post('/invites', { displayName: 'I2 Known' });
    // Give the invite a known code with 1s and 0s in it, so the I/L/O swaps are really exercised.
    await env.DB.prepare(`UPDATE invites SET code_hash = ? WHERE display_name = 'I2 Known'`).bind(await hex('AB10CD10EF10')).run();
    const r = await preview('abiocdloeflo');
    expect(r.status).toBe(200);
    expect(r.json.displayName).toBe('I2 Known');
  });

  it('I3 a used, an expired, a revoked and a made-up code → each 400 invalid_code, identical message', async () => {
    const o = await owner();
    const used = await o.post('/invites', { displayName: 'I3 Used' });
    expect((await signup(used.json.code, 'i3-used@example.com', 'I3 Used')).status).toBe(201);
    const expired = await o.post('/invites', { displayName: 'I3 Late' });
    await env.DB.prepare(`UPDATE invites SET expires_at = '2000-01-01T00:00:00.000Z' WHERE display_name = 'I3 Late'`).run();
    const revoked = await o.post('/invites', { displayName: 'I3 Revoked' });
    const id = (await o.get('/invites')).json.find((i: any) => i.displayName === 'I3 Revoked').id;
    expect((await o.del(`/invites/${id}`)).status).toBe(200);
    const results = [];
    for (const code of [used.json.code, expired.json.code, revoked.json.code, 'ZZZZ-ZZZZ-ZZZZ']) results.push(await preview(code));
    for (const r of results) {
      expect(r.status).toBe(400);
      expect(r.json.error).toBe('invalid_code');
    }
    expect(new Set(results.map((r) => r.json.message)).size).toBe(1);
    expect(results[0].json.message.length).toBeGreaterThan(0);
    // …and it is the same message signup gives.
    expect((await signup('ZZZZ-ZZZZ-ZZZZ', 'i3-nobody@example.com', 'Nobody')).json.message).toBe(results[0].json.message);
  });

  it('I4 signup after preview → 201; a second preview of that code → 400 invalid_code', async () => {
    const o = await owner();
    const inv = await o.post('/invites', { displayName: 'I4 Shelly' });
    expect((await preview(inv.json.code)).status).toBe(200);
    expect((await signup(inv.json.code, 'i4-shelly@example.com', 'Shelly B')).status).toBe(201);
    const again = await preview(inv.json.code);
    expect(again.status).toBe(400);
    expect(again.json.error).toBe('invalid_code');
  });

  it('I5 preview without a session, and with a member session → both allowed', async () => {
    const o = await owner();
    const m = await member(o);
    const inv = await o.post('/invites', { displayName: 'I5 Sam' });
    expect((await preview(inv.json.code)).status).toBe(200);
    expect((await preview(inv.json.code, m.client)).status).toBe(200);
  });

  it('I6 GET /invites after I4 → usedBy is the new member\'s name, usedAt set', async () => {
    const o = await owner();
    const inv = await o.post('/invites', { displayName: 'I6 Shelly' });
    expect((await preview(inv.json.code)).status).toBe(200);
    expect((await signup(inv.json.code, 'i6-shelly@example.com', 'Shelly B')).status).toBe(201);
    const row = (await o.get('/invites')).json.find((i: any) => i.displayName === 'I6 Shelly');
    expect(row.usedBy).toBe('Shelly B');
    expect(typeof row.usedAt).toBe('string');
  });
});

describe('session cookie (SPEC §2.1)', () => {
  const login = async (origin: string) => {
    await owner(); // make sure the owner exists
    const res = await SELF.fetch(`${origin}/api/v1/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(OWNER),
    });
    expect(res.status).toBe(200);
    return res.headers.get('set-cookie') ?? '';
  };

  it('is Secure over HTTPS', async () => {
    expect(await login('https://hrc.test')).toMatch(/;\s*Secure/i);
  });

  it('is not Secure over plain HTTP (a phone on the LAN dev server would drop it)', async () => {
    const cookie = await login('http://192.168.0.72:8787');
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).not.toMatch(/;\s*Secure/i);
  });
});

describe('admins (SPEC §6.3)', () => {
  const founderId = async (o: Client) => (await o.get('/members')).json.find((m: any) => m.isFounder).id;
  const canInvite = async (c: Client) => (await c.post('/invites', { displayName: 'probe' })).status;

  it('A1 founder makes member M an admin → M can create an invite', async () => {
    const o = await owner();
    const m = await member(o);
    expect(await canInvite(m.client)).toBe(403);
    expect((await o.patch(`/members/${m.id}`, { role: 'owner' })).status).toBe(200);
    expect(await canInvite(m.client)).toBe(201);
  });

  it('A2 admin M makes member N an admin, then removes N', async () => {
    const o = await owner();
    const m = await member(o);
    await o.patch(`/members/${m.id}`, { role: 'owner' });
    const n = await member(o);
    expect((await m.client.patch(`/members/${n.id}`, { role: 'owner' })).status).toBe(200);
    expect(await canInvite(n.client)).toBe(201);
    expect((await m.client.patch(`/members/${n.id}`, { role: 'member' })).status).toBe(200);
    expect(await canInvite(n.client)).toBe(403);
  });

  it('A3 nobody can demote or disable the founder', async () => {
    const o = await owner();
    const m = await member(o);
    await o.patch(`/members/${m.id}`, { role: 'owner' });
    const f = await founderId(o);
    for (const [who, b] of [[m.client, { role: 'member' }], [m.client, { disabled: true }], [o, { role: 'member' }], [o, { disabled: true }]] as const) {
      const r = await who.patch(`/members/${f}`, b);
      expect(r.status).toBe(400);
      expect(r.json.error).toBe('invalid_input');
      expect(r.json.message).toBeTruthy();
    }
  });

  it('A4 a regular member cannot make themselves admin', async () => {
    const o = await owner();
    const m = await member(o);
    const r = await m.client.patch(`/members/${m.id}`, { role: 'owner' });
    expect(r.status).toBe(403);
    expect(r.json.error).toBe('forbidden');
  });

  it('A5 a disabled member cannot be made an admin', async () => {
    const o = await owner();
    const m = await member(o);
    await o.patch(`/members/${m.id}`, { disabled: true });
    const r = await o.patch(`/members/${m.id}`, { role: 'owner' });
    expect(r.status).toBe(400);
    expect(r.json.message).toMatch(/Enable/);
  });

  it('A6 GET /members carries role and isFounder; exactly one founder', async () => {
    const o = await owner();
    await member(o);
    const list = (await o.get('/members')).json;
    expect(list.every((m: any) => typeof m.isFounder === 'boolean' && typeof m.role === 'string')).toBe(true);
    expect(list.filter((m: any) => m.isFounder)).toHaveLength(1);
    expect(list.find((m: any) => m.isFounder).email).toBe(OWNER.email);
  });

  it('A7 an admin removing their own admin role loses owner-only access on the next request', async () => {
    const o = await owner();
    const m = await member(o);
    await o.patch(`/members/${m.id}`, { role: 'owner' });
    expect((await m.client.patch(`/members/${m.id}`, { role: 'member' })).status).toBe(200);
    expect(await canInvite(m.client)).toBe(403);
  });
});
