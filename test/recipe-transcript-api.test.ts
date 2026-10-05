// M4r acceptance (SPEC §7E.2b) — POST /recipes/{id}/transcript, R16–R18, through the real Worker with FAKE keys
// (recipe-fakes keyedEnv); fetch is replaced by fakes that refuse every other host. Screenshots are fake bytes:
// only the fake Claude ever sees them.
import { createExecutionContext, env } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/worker/index';
import { PASTED_MAX, RECIPE_READS_PER_DAY, SCREENSHOTS_MAX } from '../src/shared/recipe-reading';
import { PHOTO_MAX_BYTES } from '../src/shared/things';
import { BASE, Client, owner } from './helpers';
import { CHANNEL_ID, VIDEO_ID, claudeMessage, commentsAnswer, fakeWorld, keyedEnv, videoAnswer, warmClaude, type World } from './recipe-fakes';

let o: Client;
let me: string;
beforeAll(async () => { o = await owner(); me = (await o.get('/me')).json.id; await warmClaude(); }, 60_000);
beforeEach(async () => {
  await env.DB.batch([env.DB.prepare('DELETE FROM recipe_emojis'), env.DB.prepare('DELETE FROM recipes'), env.DB.prepare('DELETE FROM recipe_reads')]);
});
afterEach(() => { vi.restoreAllMocks(); });

const reads = async () => (await env.DB.prepare('SELECT COUNT(*) AS n FROM recipe_reads').first<{ n: number }>())!.n;
const rowOf = (id: string) => env.DB.prepare('SELECT * FROM recipes WHERE id = ?').bind(id).first();

/** A saved recipe: a "watch it" video one whose captions failed (the default), or as `over` says. */
async function saved(over: Record<string, unknown> = {}): Promise<string> {
  const r = { id: `rcp_${Math.random().toString(36).slice(2, 10)}`, title: 'Cooking vlog', video_id: VIDEO_ID, video_title: 'Cooking vlog',
    channel: 'Chef Kai', ingredients: '[]', steps: '[]', found: 0, source: '["description"]',
    captions_error: 'YouTube refused the captions (LOGIN_REQUIRED).', ...over };
  await env.DB.prepare(`INSERT INTO recipes (id, title, video_id, video_title, channel, ingredients, steps, found, source, captions_error,
    created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')`)
    .bind(r.id, r.title, r.video_id, r.video_title, r.channel, r.ingredients, r.steps, r.found, r.source, r.captions_error, me).run();
  return r.id;
}

/** POST /recipes/{id}/transcript through the Worker with the fake keys (or the pinned, empty ones). */
async function transcript(id: string, body: object, keyed = true) {
  const res = await worker.fetch(new Request(`${BASE}/recipes/${id}/transcript`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: o.cookie! }, body: JSON.stringify(body),
  }), keyed ? keyedEnv() : (env as any), createExecutionContext());
  return { status: res.status, json: await res.json<any>() };
}

const PASTED = '0:00\n0 seconds\nIngredients\n0:03\nso two eggs and a cup of milk\n0:09 whisk then fry';
const SHOT = { type: 'image/jpeg', data: btoa('fake jpeg bytes of a transcript') };
const READING = { found: true, title: 'Pancakes', ingredients: ['2 eggs', '1 cup milk'], steps: ['Whisk', 'Fry'], servings: null, time: null };
const happy = (over: World = {}): World => ({
  video: { body: videoAnswer({ title: 'Cooking vlog', channelTitle: 'Chef Kai', description: 'Thanks for watching!' }) },
  comments: { body: commentsAnswer([[CHANNEL_ID, 'Recipe in the video!']]) }, claude: { body: claudeMessage(READING) }, ...over,
});
const claudeBody = (heard: { host: string; body: any }[]) => heard.find((h) => h.host === 'api.anthropic.com')!.body.messages[0].content as any[];

describe('M4r transcript — R16 reading', () => {
  it('R16 pasted text: 200, found, source includes transcript, captionsError cleared, no captions attempt, one read', async () => {
    const id = await saved();
    const heard = fakeWorld(happy());
    const r = await transcript(id, { text: PASTED });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.json).toMatchObject({
      id, title: 'Pancakes', ingredients: READING.ingredients, steps: READING.steps, found: true,
      source: ['description', 'transcript', 'comments'], captionsError: null, commentsError: null, videoId: VIDEO_ID,
    });
    expect(heard.some((h) => h.path === '/youtubei/v1/player' || h.path === '/api/timedtext')).toBe(false);
    expect(await reads()).toBe(1);
    const text = claudeBody(heard).find((b) => b.type === 'text').text as string;
    expect(text).toContain('Ingredients\nso two eggs and a cup of milk\nwhisk then fry');
    expect(text).not.toContain('0:03');
  });

  it('R16 screenshots: image blocks go to Claude with the screenshots line; source includes transcript', async () => {
    const id = await saved();
    const heard = fakeWorld(happy());
    const r = await transcript(id, { screenshots: [SHOT, { ...SHOT, type: 'image/png' }] });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.json.source).toContain('transcript');
    const blocks = claudeBody(heard);
    expect(blocks.filter((b) => b.type === 'image')).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: SHOT.data } },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: SHOT.data } },
    ]);
    expect(blocks[blocks.length - 1].text).toMatch(/screenshots of this video's transcript/);
    expect(blocks[blocks.length - 1].text).toMatch(/Never invent a recipe/);
    expect(heard.some((h) => h.path === '/youtubei/v1/player')).toBe(false);
    expect(await reads()).toBe(1);
  });
});

describe('M4r transcript — R17 refusals, in order', () => {
  it('a deleted or unknown one → 404; nothing fetched', async () => {
    const heard = fakeWorld(happy());
    expect((await transcript('rcp_nope', { text: PASTED })).status).toBe(404);
    expect(heard).toEqual([]);
  });

  it('nothing to read, HEIC, too many, oversize, too long → 400; no read spent, nothing fetched', async () => {
    const id = await saved();
    const heard = fakeWorld(happy());
    const bodies = [
      {}, { text: '' }, { text: '0:00\n0:05\n1 minute, 5 seconds' }, { text: 42 }, { screenshots: [] },
      { screenshots: [{ ...SHOT, type: 'image/heic' }] }, { screenshots: Array(SCREENSHOTS_MAX + 1).fill(SHOT) },
      { screenshots: [{ ...SHOT, data: 'A'.repeat(Math.ceil((PHOTO_MAX_BYTES + 1) / 3) * 4) }] },
      { text: 'x'.repeat(PASTED_MAX + 1) },
    ];
    for (const b of bodies) {
      const r = await transcript(id, b);
      expect([r.status, r.json.error], JSON.stringify(b).slice(0, 80)).toEqual([400, 'invalid_input']);
    }
    expect(heard).toEqual([]);
    expect(await reads()).toBe(0);
  });

  it('the daily cap → 429; the keys empty → 503 with zero fetches', async () => {
    const id = await saved();
    const heard = fakeWorld(happy());
    expect((await transcript(id, { text: PASTED }, false)).json.error).toBe('recipe_reading_off');
    const now = new Date().toISOString();
    await env.DB.batch(Array.from({ length: RECIPE_READS_PER_DAY }, () =>
      env.DB.prepare('INSERT INTO recipe_reads (at, member_id) VALUES (?, ?)').bind(now, me)));
    const r = await transcript(id, { screenshots: [SHOT] });
    expect([r.status, r.json.error]).toEqual([429, 'rate_limited']);
    expect(heard).toEqual([]);
  });

  it('YouTube not found → 404 and nothing changes', async () => {
    const id = await saved();
    const before = await rowOf(id);
    fakeWorld(happy({ video: { body: videoAnswer(null) } }));
    const r = await transcript(id, { text: PASTED });
    expect([r.status, r.json.error]).toEqual([404, 'video_unavailable']);
    expect(await rowOf(id)).toEqual(before);
  });
});

describe('M4r transcript — R18 no recipe changes nothing', () => {
  it('found:false → 422 no_recipe; the hand edits survive; the read counts', async () => {
    const id = await saved();
    expect((await o.patch(`/recipes/${id}`, { title: 'My pancakes', ingredients: ['3 eggs'] })).status).toBe(200);
    const before = await rowOf(id);
    fakeWorld(happy({ claude: { body: claudeMessage({ ...READING, found: false }) } }));
    const r = await transcript(id, { text: PASTED, screenshots: [SHOT] });
    expect([r.status, r.json]).toEqual([422, { error: 'no_recipe', message: 'No recipe in that transcript — nothing was changed.' }]);
    expect(await rowOf(id)).toEqual(before);
    expect(await reads()).toBe(1);
  });
});
