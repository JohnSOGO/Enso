// M4g acceptance — things to do through the API and /dev/tick (SPEC §7C.5 D1–D10, D13).
// Simulated ticks use October 2026 dates. Edits use the real clock, so "closes its future fires"
// is asserted for a fire only while that fire is still ahead of the real now (like chores-api C10).
// The Claude API is never called: ANTHROPIC_API_KEY is pinned '' (vitest.config.ts), and the reader's
// own tests below hand the SDK a fake fetch.
import { SELF, env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { BASE, Client, member, owner, tickAt } from './helpers';
import { READS_PER_DAY } from '../src/shared/things';
import { readPhoto } from '../src/worker/photo-reader';

let o: Client, A: string, B: string;

beforeAll(async () => {
  o = await owner();
  A = (await o.get('/me')).json.id;
  B = (await member(o)).id;
});

const fairBody = (over: object = {}) => ({ title: 'Fall fair', windowStart: '2026-10-10', windowEnd: '2026-10-20', ...over });
async function createThing(body: object) {
  const r = await o.post('/things', body);
  expect(r.status, JSON.stringify(r.json)).toBe(201);
  return r.json;
}
const firesOf = async (thingId: string) =>
  (await env.DB.prepare('SELECT * FROM fires WHERE thing_id = ? ORDER BY due_at').bind(thingId).all<any>()).results;
const deliveriesOf = async (fireId: string) =>
  (await env.DB.prepare('SELECT channel, member_id, message FROM deliveries WHERE fire_id = ?').bind(fireId).all<any>()).results;
const stillAhead = (iso: string) => Date.parse(iso) > Date.now();

/** A raw (non-JSON) request, for photo bodies. */
async function raw(c: Client, method: string, path: string, body?: Uint8Array, type = 'image/jpeg') {
  return SELF.fetch(BASE + path, {
    method, body, headers: { ...(c.cookie ? { cookie: c.cookie } : {}), ...(body ? { 'content-type': type } : {}) },
  });
}
const jpeg = (size: number, seed: number) => {
  const b = new Uint8Array(size);
  for (let i = 0; i < size; i++) b[i] = (i * 31 + seed) & 255;
  b.set([0xff, 0xd8, 0xff], 0);
  return b;
};

describe('M4g things — create, list, validate (D1, D2)', () => {
  it('D1 create "Fall fair" → 201; listed under Things to do as an idea', async () => {
    const t = await createThing(fairBody());
    expect(t).toMatchObject({
      title: 'Fall fair', windowStart: '2026-10-10', windowEnd: '2026-10-20', status: 'idea', remindStart: false, remindOn: null,
      channels: ['push'], hasPhoto: false, plannedEventId: null, plannedDate: null, createdBy: A,
    });
    const list = (await o.get('/things')).json;
    expect(list.open.find((x: any) => x.id === t.id)).toMatchObject({ title: 'Fall fair', status: 'idea' });
    expect(list.closed.some((x: any) => x.id === t.id)).toBe(false);
    expect((await o.get(`/things/${t.id}`)).json).toEqual(t);
  });

  it('D2 window end before start; link ftp://x; empty title → 400 invalid_input naming the field', async () => {
    const cases: [object, RegExp][] = [
      [fairBody({ windowEnd: '2026-10-01' }), /windowEnd/],
      [fairBody({ url: 'ftp://x' }), /url/],
      [fairBody({ title: '' }), /title/],
    ];
    for (const [b, field] of cases) {
      const r = await o.post('/things', b);
      expect(r.status).toBe(400);
      expect(r.json.error).toBe('invalid_input');
      expect(r.json.message).toMatch(field);
    }
  });

  it('open things come soonest-ending first; done goes to closed and can come back as an idea', async () => {
    const late = await createThing({ title: 'Exhibit', windowEnd: '2026-11-05' });
    const any = await createThing({ title: 'Any time' });
    const soon = await createThing({ title: 'Concert', windowStart: '2026-10-14', windowEnd: '2026-10-14' });
    const order = (await o.get('/things')).json.open.map((x: any) => x.id);
    expect(order.indexOf(soon.id)).toBeLessThan(order.indexOf(late.id));
    expect(order.indexOf(late.id)).toBeLessThan(order.indexOf(any.id));

    // Any member may change any thing (§7C.1).
    const bClient = (await member(o)).client;
    expect((await bClient.patch(`/things/${late.id}`, { status: 'done' })).json.status).toBe('done');
    const list = (await o.get('/things')).json;
    expect(list.closed.find((x: any) => x.id === late.id)).toMatchObject({ status: 'done' });
    expect(list.open.some((x: any) => x.id === late.id)).toBe(false);
    expect((await o.patch(`/things/${late.id}`, { status: 'idea' })).json).toMatchObject({ status: 'idea', title: 'Exhibit' });
    const planned = await o.patch(`/things/${late.id}`, { status: 'planned' });
    expect(planned.status).toBe(400);
    expect(planned.json.message).toMatch(/Plan it/);
  });
});

describe('M4g things — reminders (D3, D4, D5)', () => {
  it('D3 remind_start + remind_on 10-15; tick 10-10 09:00 local → rings for every active member, "— starts today"; D4 10-15 → "To do: Fall fair"', async () => {
    const t = await createThing(fairBody({ remindStart: true, remindOn: '2026-10-15', channels: ['push', 'house'] }));
    await tickAt(o, '2026-10-10T16:00:00.000Z'); // 09:00 PDT
    const [start] = await firesOf(t.id);
    expect(start).toMatchObject({ kind: 'thing', occurrence_date: '2026-10-10', due_at: '2026-10-10T16:00:00.000Z', state: 'ringing' });
    const d = await deliveriesOf(start.id);
    const active = (await env.DB.prepare('SELECT id FROM members WHERE disabled_at IS NULL').all<any>()).results.map((r) => r.id);
    expect(d.filter((x) => x.channel === 'push').map((x) => x.member_id).sort()).toEqual(active.sort());
    expect(active).toEqual(expect.arrayContaining([A, B]));
    expect(d.every((x) => x.message === 'To do: Fall fair — starts today')).toBe(true);
    expect(d.filter((x) => x.channel === 'house')).toHaveLength(1);

    // The Ringing bar's feed carries it with its title and thing.
    expect((await o.get('/fires?state=ringing')).json.find((f: any) => f.id === start.id))
      .toMatchObject({ kind: 'thing', title: 'Fall fair', thingId: t.id });

    await tickAt(o, '2026-10-15T16:00:00.000Z');
    const picked = (await firesOf(t.id)).find((f) => f.occurrence_date === '2026-10-15');
    expect(picked).toMatchObject({ state: 'ringing', due_at: '2026-10-15T16:00:00.000Z' });
    expect((await deliveriesOf(picked.id)).map((x) => x.message)).toContain('To do: Fall fair');
    expect((await deliveriesOf(picked.id)).every((x) => x.message === 'To do: Fall fair')).toBe(true);

    // Done and Snooze work on it like a reminder.
    const snooze = await o.post(`/fires/${picked.id}/actions`, { action: 'snooze' });
    expect(snooze.status, JSON.stringify(snooze.json)).toBe(200);
    expect(snooze.json.fire).toMatchObject({ state: 'scheduled', alert_count: 0 });
    const done = await o.post(`/fires/${start.id}/actions`, { action: 'done' });
    expect(done.json.fire).toMatchObject({ state: 'closed', close_reason: 'done', closed_by: A });
  });

  it('D5 edit the window to start 10-12 → the 10-10 fire (if still scheduled) closes removed; the next tick plans 10-12', async () => {
    const t = await createThing(fairBody({ title: 'Harvest fair', remindStart: true }));
    await tickAt(o, '2026-10-09T12:00:00.000Z'); // 10-10 09:00 is within 36 h
    const [first] = await firesOf(t.id);
    expect(first).toMatchObject({ occurrence_date: '2026-10-10', state: 'scheduled' });

    const e = await o.patch(`/things/${t.id}`, { windowStart: '2026-10-12' });
    expect(e.status, JSON.stringify(e.json)).toBe(200);
    expect(e.json).toMatchObject({ windowStart: '2026-10-12', remindStart: true, title: 'Harvest fair' });
    const after = (await firesOf(t.id)).find((f) => f.id === first.id);
    expect(after).toMatchObject(stillAhead(first.due_at) ? { state: 'closed', close_reason: 'removed' } : { state: 'scheduled' });

    await tickAt(o, '2026-10-11T12:00:00.000Z');
    const next = (await firesOf(t.id)).find((f) => f.occurrence_date === '2026-10-12');
    expect(next).toMatchObject({ state: 'scheduled', due_at: '2026-10-12T16:00:00.000Z' });
  });
});

describe('M4g things — Plan it (D6, D7)', () => {
  it('D6 Plan it on 10-14 → an event on 10-14 with thing_id; thing planned; scheduled thing fires removed', async () => {
    const t = await createThing(fairBody({
      title: 'Pumpkin patch', remindStart: true, note: 'Bring boots', place: 'Old farm', url: 'https://patch.example',
    }));
    await tickAt(o, '2026-10-09T12:00:00.000Z');
    expect((await firesOf(t.id)).filter((f) => f.state === 'scheduled')).toHaveLength(1);

    const p = await o.post(`/things/${t.id}/plan`, { date: '2026-10-14', time: '10:00' });
    expect(p.status, JSON.stringify(p.json)).toBe(200);
    expect(p.json.thing).toMatchObject({ status: 'planned', plannedEventId: p.json.eventId, plannedDate: '2026-10-14' });
    const ev = (await o.get(`/events/${p.json.eventId}`)).json;
    expect(ev).toMatchObject({
      title: 'Pumpkin patch', startDate: '2026-10-14', startTime: '10:00', thingId: t.id, reminder: null,
      notes: 'Bring boots\nOld farm\nhttps://patch.example',
    });
    expect((await firesOf(t.id)).every((f) => f.state === 'closed' && f.close_reason === 'removed')).toBe(true);

    // A planned thing never re-plans its reminders, and cannot be planned twice.
    await tickAt(o, '2026-10-09T13:00:00.000Z');
    expect((await firesOf(t.id)).filter((f) => f.state !== 'closed')).toEqual([]);
    expect((await o.post(`/things/${t.id}/plan`, { date: '2026-10-15' })).status).toBe(409);
  });

  it('D7 Plan it on 10-25 (outside the window) → 400 with a message', async () => {
    const t = await createThing(fairBody({ title: 'Corn maze' }));
    const r = await o.post(`/things/${t.id}/plan`, { date: '2026-10-25' });
    expect(r.status).toBe(400);
    expect(r.json.message).toMatch(/2026-10-10.*2026-10-20/);
    expect((await o.get(`/things/${t.id}`)).json.status).toBe('idea');
  });
});

describe('M4g things — photos (D8, D9, D10, D13)', () => {
  it('D8 upload a 200 KB JPEG, GET it back, replace it, delete the thing → bytes round-trip; old and final objects gone', async () => {
    const t = await createThing({ title: 'Flyer thing', remindOn: '2026-12-01' });
    const first = jpeg(200 * 1024, 1);
    expect((await raw(o, 'PUT', `/things/${t.id}/photo`, first)).status).toBe(204);
    expect((await o.get(`/things/${t.id}`)).json.hasPhoto).toBe(true);
    const got = await raw(o, 'GET', `/things/${t.id}/photo`);
    expect(got.status).toBe(200);
    expect(got.headers.get('content-type')).toBe('image/jpeg');
    expect(got.headers.get('cache-control')).toBe('private, max-age=3600');
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(first);
    const oldKey = (await env.DB.prepare('SELECT photo_key FROM things WHERE id = ?').bind(t.id).first<any>()).photo_key;
    expect(oldKey).toMatch(new RegExp(`^things/${t.id}/[0-9a-z]+\\.jpg$`));

    const second = jpeg(150 * 1024, 2);
    expect((await raw(o, 'PUT', `/things/${t.id}/photo`, second)).status).toBe(204);
    expect(new Uint8Array(await (await raw(o, 'GET', `/things/${t.id}/photo`)).arrayBuffer())).toEqual(second);
    const finalKey = (await env.DB.prepare('SELECT photo_key FROM things WHERE id = ?').bind(t.id).first<any>()).photo_key;
    expect(finalKey).not.toBe(oldKey);
    expect(await env.PHOTOS.head(oldKey)).toBeNull();

    expect((await o.del(`/things/${t.id}`)).status).toBe(204);
    const keys = (await env.PHOTOS.list({ prefix: 'things/' })).objects.map((x) => x.key);
    expect(keys).not.toContain(oldKey);
    expect(keys).not.toContain(finalKey);
    expect((await o.get(`/things/${t.id}`)).status).toBe(404);
    expect((await o.get('/things')).json.open.some((x: any) => x.id === t.id)).toBe(false);
  });

  it('a photo over 4 MB or of another type → 400; the thing keeps no photo', async () => {
    const t = await createThing({ title: 'Big photo' });
    const big = await raw(o, 'PUT', `/things/${t.id}/photo`, new Uint8Array(4 * 1024 * 1024 + 1));
    expect(big.status).toBe(400);
    expect((await big.json<any>()).message).toMatch(/4 MB/);
    const gif = await raw(o, 'PUT', `/things/${t.id}/photo`, jpeg(10, 3), 'image/gif');
    expect(gif.status).toBe(400);
    expect((await o.get(`/things/${t.id}`)).json.hasPhoto).toBe(false);
    expect((await raw(o, 'GET', `/things/${t.id}/photo`)).status).toBe(404);
  });

  it('DELETE the photo alone → 204, object gone, hasPhoto false', async () => {
    const t = await createThing({ title: 'Photo then none' });
    await raw(o, 'PUT', `/things/${t.id}/photo`, jpeg(1024, 4));
    const key = (await env.DB.prepare('SELECT photo_key FROM things WHERE id = ?').bind(t.id).first<any>()).photo_key;
    expect((await raw(o, 'DELETE', `/things/${t.id}/photo`)).status).toBe(204);
    expect(await env.PHOTOS.head(key)).toBeNull();
    expect((await o.get(`/things/${t.id}`)).json.hasPhoto).toBe(false);
  });

  it('D9 GET a photo without a session → 401', async () => {
    const t = await createThing({ title: 'Private photo' });
    await raw(o, 'PUT', `/things/${t.id}/photo`, jpeg(1024, 5));
    const r = await raw(new Client(), 'GET', `/things/${t.id}/photo`);
    expect(r.status).toBe(401);
    expect((await raw(new Client(), 'POST', '/things/read-photo', jpeg(1024, 5))).status).toBe(401);
  });

  it('D10 read-photo with no API key → 503 photo_reading_off; the read is not counted; bad type → 400 first', async () => {
    const r = await raw(o, 'POST', '/things/read-photo', jpeg(2048, 6));
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: 'photo_reading_off', message: "Reading photos isn't set up yet." });
    expect((await raw(o, 'POST', '/things/read-photo', jpeg(10, 6), 'text/plain')).status).toBe(400);
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM photo_reads').first<any>()).n).toBe(0);
  });

  it('D13 a 41st read in one day → 429 with a message (the cap is checked before the key)', async () => {
    const now = new Date().toISOString();
    await env.DB.batch(Array.from({ length: READS_PER_DAY }, () =>
      env.DB.prepare('INSERT INTO photo_reads (at, member_id) VALUES (?, ?)').bind(now, A)));
    const r = await raw(o, 'POST', '/things/read-photo', jpeg(2048, 7));
    expect(r.status).toBe(429);
    const j = await r.json<any>();
    expect(j.error).toBe('rate_limited');
    expect(j.message).toMatch(new RegExp(`${READS_PER_DAY}`));
  });
});

describe('photo-reader (§7C.4) — the SDK request, over a fake transport', () => {
  const message = (over: object) => ({
    id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_sequence: null, stop_details: null,
    usage: { input_tokens: 1, output_tokens: 1 }, ...over,
  });
  const fake = (status: number, json: object, seen: { url?: string; headers?: Headers; body?: any }[] = []) =>
    (async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(input, init);
      seen.push({ url: req.url, headers: req.headers, body: await req.json() });
      return new Response(JSON.stringify(json), { status, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
  const input = { apiKey: 'test-key', bytes: jpeg(64, 8).buffer as ArrayBuffer, mediaType: 'image/jpeg', today: '2026-10-03', tz: 'America/Los_Angeles' };

  it('sends one structured-output request: opus 5.5, default refusal fallback, base64 image + dated prompt', async () => {
    const seen: any[] = [];
    const answer = { title: 'Fall fair', startDate: '2026-10-10', endDate: '2026-10-20', place: null, url: null, note: null };
    const r = await readPhoto(input, { fetch: fake(200, message({ content: [{ type: 'text', text: JSON.stringify(answer) }], stop_reason: 'end_turn' }), seen) });
    expect(r).toEqual({ ok: true, raw: answer });
    expect(seen).toHaveLength(1);
    const { url, headers, body } = seen[0];
    expect(new URL(url).pathname).toBe('/v1/messages');
    expect(headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
    expect(headers.get('x-api-key')).toBe('test-key');
    expect(body).toMatchObject({ model: 'claude-opus-5-5', fallbacks: 'default', output_config: { format: { type: 'json_schema' } } });
    expect(body.betas).toBeUndefined();
    const [image, text] = body.messages[0].content;
    expect(image).toMatchObject({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg' } });
    expect(text.text).toContain('2026-10-03');
    expect(text.text).toContain('America/Los_Angeles');
  });

  it('a refusal → refused (stop_reason checked before the output); an API error → failed with the reason', async () => {
    const refused = await readPhoto(input, { fetch: fake(200, message({
      content: [], stop_reason: 'refusal', stop_details: { type: 'refusal', category: null, explanation: 'Not this one.' },
    })) });
    expect(refused).toEqual({ ok: false, kind: 'refused', reason: 'Not this one.' });
    const failed = await readPhoto(input, { fetch: fake(400, { type: 'error', error: { type: 'invalid_request_error', message: 'bad image' } }) });
    expect(failed).toMatchObject({ ok: false, kind: 'failed' });
    expect((failed as any).reason).toMatch(/400.*bad image/);
  });

  it('a HEIC photo is refused before any request (Claude reads jpeg/png/webp/gif)', async () => {
    const seen: any[] = [];
    const r = await readPhoto({ ...input, mediaType: 'image/heic' }, { fetch: fake(200, {}, seen) });
    expect(r).toMatchObject({ ok: false, kind: 'failed' });
    expect(seen).toHaveLength(0);
  });
});
