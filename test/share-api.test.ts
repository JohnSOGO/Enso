// SH3–SH9 (SPEC §7H) — POST /share by Bearer key, /share/key and my 📥 Inbox.
import { SELF, env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { BASE, member, owner, type Client } from './helpers';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

beforeEach(async () => {
  const left = (await env.PHOTOS.list({ prefix: 'inbox/' })).objects.map((x) => x.key);
  if (left.length) await env.PHOTOS.delete(left);
  await env.DB.prepare('DELETE FROM inbox_items').run();
});

const share = (key: string | null, body: BodyInit, type?: string) => SELF.fetch(`${BASE}/share`, {
  method: 'POST', body, headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), ...(type ? { 'content-type': type } : {}) },
});
const makeKey = async (c: Client) => (await c.post('/share/key')).json.key as string;

describe('§7H Send to Enso', () => {
  it('SH3 no key, a wrong key, a disabled member\'s key → 401, nothing written', async () => {
    const o = await owner();
    const m = await member(o);
    const mk = await makeKey(m.client);
    expect((await o.patch(`/members/${m.id}`, { disabled: true })).status).toBe(200);
    for (const k of [null, 'enso_00000000000000000000000000000000', mk]) {
      const r = await share(k, JSON.stringify({ text: 'hi' }), 'application/json');
      expect(r.status).toBe(401);
      const j = await r.json<{ error: string; message: string }>();
      expect(j.error).toBe('unauthorized');
      expect(j.message).not.toContain(mk);
    }
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM inbox_items').first<{ n: number }>())!.n).toBe(0);
  });

  it('SH4 JSON, form text, text/plain and a form photo are saved; GET /inbox lists them newest first', async () => {
    const o = await owner();
    const k = await makeKey(o);
    const sent: { kind: string }[] = [];
    const go = async (body: BodyInit, type?: string) => {
      const r = await share(k, body, type);
      expect(r.status).toBe(201);
      const j = await r.json<{ saved: number; items: { kind: string }[]; message: string }>();
      expect(j.message).toBe('✅ Saved to your Enso Inbox');
      sent.push(j.items[0]);
      await new Promise((res) => setTimeout(res, 5));
    };
    await go(JSON.stringify({ url: 'https://example.com/a' }), 'application/json');
    const f1 = new FormData(); f1.append('text', 'buy milk');
    await go(f1);
    await go('call mom', 'text/plain');
    const f2 = new FormData(); f2.append('photo', new Blob([JPEG], { type: 'application/octet-stream' }), 'x.bin');
    await go(f2);
    expect(sent.map((x) => x.kind)).toEqual(['link', 'text', 'text', 'photo']);
    const list = (await o.get('/inbox')).json.items;
    expect(list.map((i: any) => [i.kind, i.url, i.text, i.hasPhoto])).toEqual([
      ['photo', null, null, true], ['text', null, 'call mom', false], ['text', null, 'buy milk', false], ['link', 'https://example.com/a', null, false],
    ]);
    const photo = await SELF.fetch(`${BASE}/inbox/${list[0].id}/photo`, { headers: { cookie: o.cookie } });
    expect(photo.status).toBe(200);
    expect(photo.headers.get('content-type')).toBe('image/jpeg');
  });

  it('SH5 a new key replaces the old', async () => {
    const o = await owner();
    const old = await makeKey(o);
    const now = await makeKey(o);
    expect((await share(old, 'x', 'text/plain')).status).toBe(401);
    expect((await share(now, 'x', 'text/plain')).status).toBe(201);
  });

  it('SH6 turning off the key', async () => {
    const o = await owner();
    const k = await makeKey(o);
    expect((await o.get('/share/key')).json.on).toBe(true);
    expect((await o.del('/share/key')).status).toBe(204);
    expect((await share(k, 'x', 'text/plain')).status).toBe(401);
    expect((await o.get('/share/key')).json).toEqual({ on: false, createdAt: null });
  });

  it('SH7 nothing shared, a too-big photo, the hourly limit', async () => {
    const o = await owner();
    const k = await makeKey(o);
    const r1 = await share(k, new FormData());
    expect(r1.status).toBe(400);
    expect((await r1.json<{ error: string }>()).error).toBe('nothing_shared');
    const big = new Uint8Array(13 * 1024 * 1024); big.set(JPEG);
    expect((await share(k, big, 'image/jpeg')).status).toBe(400);
    const me = (await o.get('/me')).json.id;
    const now = new Date().toISOString();
    await env.DB.batch(Array.from({ length: 60 }, (_, i) => env.DB.prepare(
      'INSERT INTO inbox_items (id, member_id, text, created_at) VALUES (?, ?, ?, ?)').bind(`inb_${i}`, me, 't', now)));
    const r3 = await share(k, 'one more', 'text/plain');
    expect(r3.status).toBe(429);
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM inbox_items').first<{ n: number }>())!.n).toBe(60);
  });

  it('SH8 and SH9 mine only; clearing removes the row and its photo', async () => {
    const o = await owner();
    const k = await makeKey(o);
    const r = await share(k, JPEG, 'image/jpeg');
    const id = (await r.json<{ items: { id: string }[] }>()).items[0].id;
    const other = await member(o);
    expect((await other.client.get('/inbox')).json.items).toEqual([]);
    expect((await SELF.fetch(`${BASE}/inbox/${id}/photo`, { headers: { cookie: other.client.cookie } })).status).toBe(404);
    expect((await other.client.del(`/inbox/${id}`)).status).toBe(404);
    expect((await env.PHOTOS.list({ prefix: 'inbox/' })).objects).toHaveLength(1);
    expect((await o.del(`/inbox/${id}`)).status).toBe(204);
    expect((await o.get('/inbox')).json.items).toEqual([]);
    expect((await env.PHOTOS.list({ prefix: 'inbox/' })).objects).toHaveLength(0);
  });
});
