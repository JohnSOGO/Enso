// M2 acceptance — SPEC §11.
import { env } from 'cloudflare:test';
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
