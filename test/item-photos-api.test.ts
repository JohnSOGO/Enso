// M4u acceptance (SPEC §7A.3) — snap an item through the real Worker. The read: SogoAI first (a fake helper at the
// pinned https://sogoai.test), the Claude API only when SogoAI gives no name (a fake api.anthropic.com), counted
// against the photo_reads budget only then. A fetch spy refuses every other host, and the keys are fake (recipe-fakes).
// The photo: R2 put / get / delete, replace, and an item's or a list's delete removing the objects (checked in the bucket).
import { SELF, createExecutionContext, env } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/worker/index';
import type { Env } from '../src/worker/env';
import { READS_PER_DAY } from '../src/shared/things';
import { SHOPPING_LIST_ID } from '../src/shared/lists';
import { BASE, Client, owner } from './helpers';
import { claudeMessage, homeEnv, keyedEnv, warmClaude } from './recipe-fakes';

let o: Client;
beforeAll(async () => { o = await owner(); await warmClaude(); }, 60_000);
beforeEach(async () => {
  await env.DB.exec('DELETE FROM photo_reads; DELETE FROM list_items; DELETE FROM lists WHERE created_by IS NOT NULL; UPDATE lists SET deleted_at = NULL');
  const left = (await env.PHOTOS.list({ prefix: 'list-items/' })).objects.map((x) => x.key);
  if (left.length) await env.PHOTOS.delete(left); // the bucket outlives each test; every test starts with none
});
afterEach(() => { vi.restoreAllMocks(); });

const jpeg = (size: number, seed: number) => {
  const b = new Uint8Array(size);
  for (let i = 0; i < size; i++) b[i] = (i * 31 + seed) & 255;
  b.set([0xff, 0xd8, 0xff], 0);
  return b;
};

type Reply = { status?: number; body: object | string };
interface Heard { host: string; path: string; headers: Headers; body: Uint8Array }

/** The fake SogoAI helper and the fake Claude API; any other host fails the test. */
function fakes(w: { home?: Reply; claude?: Reply }) {
  const heard: Heard[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    heard.push({ host: url.host, path: url.pathname, headers: req.headers, body: new Uint8Array(await req.arrayBuffer()) });
    const reply = url.host === 'sogoai.test' && url.pathname === '/identify' ? w.home
      : url.host === 'api.anthropic.com' && url.pathname === '/v1/messages' ? w.claude : undefined;
    if (!reply) throw new Error(`a test tried to reach ${url.host}${url.pathname} — no fake for it`);
    const json = typeof reply.body !== 'string';
    return new Response(json ? JSON.stringify(reply.body) : (reply.body as string),
      { status: reply.status ?? 200, headers: { 'content-type': json ? 'application/json' : 'text/plain' } });
  });
  return heard;
}

/** POST /list-items/read-photo through the Worker with `e`. */
async function read(e: Env, w: { home?: Reply; claude?: Reply }, photo = jpeg(2048, 1), type = 'image/jpeg') {
  const heard = fakes(w);
  const res = await worker.fetch(new Request(`${BASE}/list-items/read-photo`, {
    method: 'POST', headers: { 'content-type': type, cookie: o.cookie }, body: photo,
  }), e, createExecutionContext());
  return { status: res.status, json: await res.json<any>(), heard };
}

const reads = async () => (await env.DB.prepare('SELECT COUNT(*) AS n FROM photo_reads').first<{ n: number }>())!.n;
const objects = async () => (await env.PHOTOS.list({ prefix: 'list-items/' })).objects.map((x) => x.key);
const SOGO = (text: string): Reply => ({ body: { ok: true, text } });
const CLAUDE = (name: string): Reply => ({ body: claudeMessage({ name }) });
/** Claude configured, SogoAI not (the pinned Access secrets are empty). */
const claudeOnly = keyedEnv;
/** SogoAI configured, no Claude key. */
const homeNoKey = (): Env => ({ ...homeEnv(), ANTHROPIC_API_KEY: '' });

describe('M4u read-photo — SogoAI first, Claude only when it gives no name', () => {
  it('SN1 SogoAI names it → via sogoai; one POST with the Access headers, the bearer and the image; nothing counted or stored', async () => {
    const photo = jpeg(3000, 2);
    const r = await read(homeEnv(), { home: SOGO('  "Heinz Tomato Ketchup 32 oz."\n') }, photo);
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.json).toEqual({ name: 'Heinz Tomato Ketchup 32 oz', via: 'sogoai' });
    expect(r.heard.map((h) => `${h.host}${h.path}`)).toEqual(['sogoai.test/identify']);
    const h = r.heard[0];
    expect(h.headers.get('authorization')).toBe(`Bearer ${(env as unknown as Env).CAPTIONS_TOKEN}`);
    expect(h.headers.get('cf-access-client-id')).toBe('fake-access-id');
    expect(h.headers.get('cf-access-client-secret')).toBe('fake-access-secret');
    expect(h.headers.get('content-type')).toBe('image/jpeg');
    expect(h.body).toEqual(photo);
    expect(await reads()).toBe(0);
    expect(await objects()).toEqual([]);
  });

  it('SN2 SogoAI says UNKNOWN / fails / answers a failure / is not configured → Claude names it, via claude, one read each', async () => {
    const cases: [string, Env, Reply | undefined][] = [
      ['UNKNOWN', homeEnv(), SOGO('UNKNOWN')],
      ['a 502', homeEnv(), { status: 502, body: 'bad gateway' }],
      ['ok: false', homeEnv(), { body: { ok: false, kind: 'off', reason: "IDENTIFY_MODEL isn't set on SogoAI." } }],
      ['not configured', claudeOnly(), undefined],
    ];
    let n = 0;
    for (const [what, e, home] of cases) {
      const r = await read(e, { home, claude: CLAUDE('Dawn dish soap 19 oz') });
      expect(r.status, `${what}: ${JSON.stringify(r.json)}`).toBe(200);
      expect(r.json, what).toEqual({ name: 'Dawn dish soap 19 oz', via: 'claude' });
      expect(r.heard.filter((h) => h.host === 'sogoai.test'), what).toHaveLength(home ? 1 : 0);
      expect(r.heard.filter((h) => h.host === 'api.anthropic.com'), what).toHaveLength(1);
      expect(await reads(), what).toBe(++n);
    }
  });

  it('SN3 at the daily cap and SogoAI gives no name → 429, Claude never asked', async () => {
    const now = new Date().toISOString();
    const me = (await o.get('/me')).json.id;
    await env.DB.batch(Array.from({ length: READS_PER_DAY }, () =>
      env.DB.prepare('INSERT INTO photo_reads (at, member_id) VALUES (?, ?)').bind(now, me)));
    const r = await read(homeEnv(), { home: SOGO('UNKNOWN') });
    expect(r.status).toBe(429);
    expect(r.json.error).toBe('rate_limited');
    expect(r.json.message).toMatch(String(READS_PER_DAY));
    expect(r.heard.some((h) => h.host === 'api.anthropic.com')).toBe(false);
    // A name from SogoAI is still free at the cap.
    expect((await read(homeEnv(), { home: SOGO('Milk') })).json).toEqual({ name: 'Milk', via: 'sogoai' });
  });

  it('SN4 no ANTHROPIC_API_KEY and SogoAI gives no name → 503 photo_reading_off, nothing counted', async () => {
    const r = await read(homeNoKey(), { home: SOGO('UNKNOWN') });
    expect(r.status).toBe(503);
    expect(r.json).toEqual({ error: 'photo_reading_off', message: "Reading photos isn't set up yet." });
    expect(await reads()).toBe(0);
  });

  it('SN5 Claude cannot tell either → 422 item_unknown, one read counted', async () => {
    const r = await read(homeEnv(), { home: SOGO('UNKNOWN'), claude: CLAUDE('UNKNOWN') });
    expect(r.status).toBe(422);
    expect(r.json).toEqual({ error: 'item_unknown', message: "Couldn't tell what that is — type it in." });
    expect(await reads()).toBe(1);
  });

  it("SN6 Claude fails → 502 naming Claude's reason and SogoAI's; a refusal → 422", async () => {
    const r = await read(homeEnv(), { home: { status: 502, body: 'tunnel down' }, claude: { status: 400, body: { type: 'error', error: { type: 'invalid_request_error', message: 'bad image' } } } });
    expect(r.status).toBe(502);
    expect(r.json.error).toBe('photo_reading_failed');
    expect(r.json.message).toMatch(/^Couldn't read that photo: Claude API error 400/);
    expect(r.json.message).toContain('(SogoAI: HTTP 502: tunnel down)');
    const refused = await read(claudeOnly(), { claude: { body: claudeMessage(null, { stop_reason: 'refusal' }) } });
    expect(refused.status).toBe(422);
    expect(refused.json.error).toBe('photo_refused');
  });

  it('SN7 no session → 401; a bad type → 400 before anyone is asked', async () => {
    const anon = await SELF.fetch(`${BASE}/list-items/read-photo`, { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: jpeg(10, 3) });
    expect(anon.status).toBe(401);
    const r = await read(homeEnv(), {}, jpeg(10, 3), 'text/plain');
    expect(r.status).toBe(400);
    expect(r.heard).toEqual([]);
  });
});

/** A raw request through SELF, for photo bodies. */
const raw = (method: string, path: string, body?: Uint8Array, type = 'image/jpeg') => SELF.fetch(BASE + path, {
  method, body, headers: { cookie: o.cookie, ...(body ? { 'content-type': type } : {}) },
});
const addItem = async (text: string, list = SHOPPING_LIST_ID) => (await o.post(`/lists/${list}/items`, { text })).json;
const keyOf = async (id: string) => (await env.DB.prepare('SELECT photo_key FROM list_items WHERE id = ?').bind(id).first<{ photo_key: string | null }>())!.photo_key;
const itemIn = async (id: string, list = SHOPPING_LIST_ID) => {
  const d = (await o.get(`/lists/${list}`)).json;
  return [...d.open, ...d.checked].find((i: any) => i.id === id);
};

describe('M4u a list item photo — R2, private', () => {
  it('SN8 PUT, GET, replace: bytes round-trip, private cache, the old object gone, hasPhoto true, the key on no wire', async () => {
    const { item } = await addItem('Ketchup');
    expect(item).toMatchObject({ hasPhoto: false });
    const first = jpeg(200 * 1024, 4);
    expect((await raw('PUT', `/list-items/${item.id}/photo`, first)).status).toBe(204);
    const got = await raw('GET', `/list-items/${item.id}/photo`);
    expect(got.status).toBe(200);
    expect(got.headers.get('content-type')).toBe('image/jpeg');
    expect(got.headers.get('cache-control')).toBe('private, max-age=3600');
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(first);
    const oldKey = (await keyOf(item.id))!;
    expect(oldKey).toMatch(new RegExp(`^list-items/${item.id}/[0-9a-z]+\\.jpg$`));

    const second = jpeg(150 * 1024, 5);
    expect((await raw('PUT', `/list-items/${item.id}/photo`, second)).status).toBe(204);
    expect(new Uint8Array(await (await raw('GET', `/list-items/${item.id}/photo`)).arrayBuffer())).toEqual(second);
    const newKey = (await keyOf(item.id))!;
    expect(newKey).not.toBe(oldKey);
    expect(await env.PHOTOS.head(oldKey)).toBeNull();
    expect(await objects()).toEqual([newKey]);

    const shown = await itemIn(item.id);
    expect(shown).toMatchObject({ hasPhoto: true });
    expect(typeof shown.updatedAt).toBe('string');
    const everything = JSON.stringify([(await o.get(`/lists/${SHOPPING_LIST_ID}`)).json, (await o.patch(`/list-items/${item.id}`, { note: 'big one' })).json]);
    expect(everything).not.toContain(newKey);
    expect(everything).not.toContain('photo_key');
  });

  it('SN9 GET with no photo → 404; GET / PUT / DELETE on a deleted item → 404; DELETE the photo → 204, gone, hasPhoto false', async () => {
    const { item } = await addItem('Batteries AA');
    const none = await raw('GET', `/list-items/${item.id}/photo`);
    expect(none.status).toBe(404);
    expect(await none.json()).toEqual({ error: 'not_found', message: 'This item has no photo.' });
    expect((await raw('PUT', `/list-items/${item.id}/photo`, jpeg(10, 6), 'image/gif')).status).toBe(400);
    expect((await raw('PUT', `/list-items/${item.id}/photo`, new Uint8Array(4 * 1024 * 1024 + 1))).status).toBe(400);

    await raw('PUT', `/list-items/${item.id}/photo`, jpeg(1024, 6));
    const key = (await keyOf(item.id))!;
    expect((await raw('DELETE', `/list-items/${item.id}/photo`)).status).toBe(204);
    expect(await env.PHOTOS.head(key)).toBeNull();
    expect(await keyOf(item.id)).toBeNull();
    expect(await itemIn(item.id)).toMatchObject({ hasPhoto: false });

    expect((await o.del(`/list-items/${item.id}`)).status).toBe(204);
    expect((await raw('GET', `/list-items/${item.id}/photo`)).status).toBe(404);
    const put = await raw('PUT', `/list-items/${item.id}/photo`, jpeg(1024, 7));
    expect(put.status).toBe(404);
    expect((await put.json<any>()).message).toBe('That item is no longer on the list.');
    expect((await raw('DELETE', `/list-items/${item.id}/photo`)).status).toBe(404);
    expect(await objects()).toEqual([]);
  });

  it('SN10 deleting an item deletes its photo; deleting a list deletes all its items\' photos', async () => {
    const { item } = await addItem('Paper towels');
    await raw('PUT', `/list-items/${item.id}/photo`, jpeg(1024, 8));
    const key = (await keyOf(item.id))!;
    expect((await o.del(`/list-items/${item.id}`)).status).toBe(204);
    expect(await env.PHOTOS.head(key)).toBeNull();
    expect(await keyOf(item.id)).toBeNull();

    const list = (await o.post('/lists', { name: 'Hardware store' })).json;
    const ids: string[] = [];
    for (const t of ['Nails', 'Screws', 'Glue']) {
      const { item: i } = await addItem(t, list.id);
      ids.push(i.id);
      await raw('PUT', `/list-items/${i.id}/photo`, jpeg(512, ids.length));
    }
    await o.patch(`/list-items/${ids[2]}`, { checked: true }); // a bought item's photo goes too
    expect(await objects()).toHaveLength(3);
    const keep = await addItem('Milk'); // another list's photo stays
    await raw('PUT', `/list-items/${keep.item.id}/photo`, jpeg(512, 9));
    expect((await o.del(`/lists/${list.id}`)).status).toBe(204);
    expect(await objects()).toEqual([await keyOf(keep.item.id)]);
    for (const id of ids) expect(await keyOf(id)).toBeNull();
  });

  it('SN11 a bought item keeps its photo; adding it again re-opens it with the photo', async () => {
    const { item } = await addItem('Coffee beans');
    const photo = jpeg(2048, 10);
    await raw('PUT', `/list-items/${item.id}/photo`, photo);
    await o.patch(`/list-items/${item.id}`, { checked: true });
    expect(await itemIn(item.id)).toMatchObject({ hasPhoto: true });
    const again = await o.post(`/lists/${SHOPPING_LIST_ID}/items`, { text: 'coffee BEANS' });
    expect(again.json.result).toBe('reopened');
    expect(again.json.item).toMatchObject({ id: item.id, hasPhoto: true, checkedAt: null });
    expect(new Uint8Array(await (await raw('GET', `/list-items/${item.id}/photo`)).arrayBuffer())).toEqual(photo);
  });
});
