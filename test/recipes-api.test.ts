// M4o acceptance (SPEC §7E) — the /recipes routes. The read-from-video pipeline runs through the real
// Worker with FAKE keys (recipe-fakes keyedEnv) and fetch replaced by fakes that refuse every other host;
// with the pinned config (keys empty) it must not fetch at all. R11 posts every produced ingredient to
// the real Shopping route.
import { SELF, createExecutionContext, env } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/worker/index';
import {
  INGREDIENT_MAX, RECIPE_READS_PER_DAY, cleanRecipeReading, parseRecipeInput, type Recipe, type RecipeInput,
} from '../src/shared/recipes';
import { SHOPPING_LIST_ID } from '../src/shared/lists';
import { BASE, Client, owner } from './helpers';
import {
  TRACKS, VIDEO_ID, claudeMessage, fakeWorld, json3, keyedEnv, videoAnswer, warmClaude, watchPage, type World,
} from './recipe-fakes';

let o: Client;
beforeAll(async () => { o = await owner(); await warmClaude(); }, 60_000);
beforeEach(async () => {
  await env.DB.batch([env.DB.prepare('DELETE FROM recipes'), env.DB.prepare('DELETE FROM recipe_reads')]);
});
afterEach(() => { vi.restoreAllMocks(); });

const LINK = `https://youtu.be/${VIDEO_ID}?si=share`;
const reads = async () => (await env.DB.prepare('SELECT COUNT(*) AS n FROM recipe_reads').first<{ n: number }>())!.n;

/** POST /recipes/from-video through the Worker with the fake keys. */
async function readVideo(url: string, c: Client = o) {
  const res = await worker.fetch(new Request(`${BASE}/recipes/from-video`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(c.cookie ? { cookie: c.cookie } : {}) }, body: JSON.stringify({ url }),
  }), keyedEnv(), createExecutionContext());
  return { status: res.status, json: await res.json<any>() };
}

const PANCAKES = { title: 'Fluffy Pancakes!!', channelTitle: 'Chef Kai', description: 'Ingredients: 2 eggs, 1 cup milk, 1 cup flour.' };
const READING = { found: true, title: 'Pancakes', ingredients: ['2 eggs', '1 cup milk', '1 cup flour'], steps: ['Whisk', 'Fry'], servings: '4', time: '15 min' };
const happy = (over: World = {}): World => ({
  video: { body: videoAnswer(PANCAKES) }, watch: { body: watchPage(TRACKS) }, captions: { body: json3('whisk the eggs then fry') },
  claude: { body: claudeMessage(READING) }, ...over,
});

describe('M4o from-video — checks before anything is fetched', () => {
  it('R2 keys empty (the pinned config) → 503 recipe_reading_off, zero fetches, no read counted', async () => {
    const heard = fakeWorld(happy());
    const r = await o.post('/recipes/from-video', { url: LINK });
    expect(r.status).toBe(503);
    expect(r.json).toEqual({ error: 'recipe_reading_off', message: "Reading recipes from videos isn't set up yet." });
    expect(heard).toEqual([]);
    expect(await reads()).toBe(0);
  });

  it('R3 an unreadable link → 400; no session → 401; nothing fetched', async () => {
    const heard = fakeWorld(happy());
    expect((await readVideo('https://vimeo.com/123')).status).toBe(400);
    expect((await readVideo(LINK, new Client())).status).toBe(401);
    expect(heard).toEqual([]);
  });

  it('R5 the daily cap → 429 with a message, before any fetch', async () => {
    const now = new Date().toISOString(), me = (await o.get('/me')).json.id;
    await env.DB.batch(Array.from({ length: RECIPE_READS_PER_DAY }, () =>
      env.DB.prepare('INSERT INTO recipe_reads (at, member_id) VALUES (?, ?)').bind(now, me)));
    const heard = fakeWorld(happy());
    const r = await readVideo(LINK);
    expect(r.status).toBe(429);
    expect(r.json.error).toBe('rate_limited');
    expect(r.json.message).toMatch(String(RECIPE_READS_PER_DAY));
    expect(heard).toEqual([]);
  });
});

describe('M4o from-video — reading', () => {
  it('R6 happy path: saved from the description and captions, one read counted', async () => {
    const heard = fakeWorld(happy());
    const r = await readVideo(LINK);
    expect(r.status, JSON.stringify(r.json)).toBe(201);
    expect(r.json).toMatchObject({
      title: 'Pancakes', videoId: VIDEO_ID, videoTitle: PANCAKES.title, channel: 'Chef Kai',
      watchUrl: `https://www.youtube.com/watch?v=${VIDEO_ID}`, thumbnailUrl: `https://i.ytimg.com/vi/${VIDEO_ID}/hqdefault.jpg`,
      ingredients: READING.ingredients, steps: READING.steps, servings: '4', time: '15 min', found: true,
      source: ['description', 'captions'], captionsError: null,
    });
    expect(await reads()).toBe(1);
    const claude = heard.find((h) => h.host === 'api.anthropic.com')!;
    expect(claude.body.messages[0].content[0].text).toContain('whisk the eggs then fry');
    expect(claude.body.messages[0].content[0].text).toContain(PANCAKES.description);
    expect((await o.get('/recipes')).json.map((x: Recipe) => x.id)).toEqual([r.json.id]);
  });

  it('R7 captions blocked → still saved from the description, captionsError visible', async () => {
    fakeWorld(happy({ watch: { status: 429, body: 'Too many requests' } }));
    const r = await readVideo(LINK);
    expect(r.status).toBe(201);
    expect(r.json.source).toEqual(['description']);
    expect(r.json.captionsError).toMatch(/refused.*429/);
    expect(r.json.found).toBe(true);
  });

  it('R8 no description and no captions → Claude is not asked; found:false with the video title', async () => {
    const heard = fakeWorld(happy({ video: { body: videoAnswer({ title: 'Cooking vlog', channelTitle: 'Kai', description: '' }) }, watch: { body: watchPage() } }));
    const r = await readVideo(LINK);
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ title: 'Cooking vlog', ingredients: [], steps: [], found: false, source: [], captionsError: 'This video has no captions.' });
    expect(heard.some((h) => h.host === 'api.anthropic.com')).toBe(false);
    expect(await reads()).toBe(1); // the read is counted at step 8, before the Claude decision
  });

  it('R9 Claude says found:false but lists ingredients → saved with none', async () => {
    fakeWorld(happy({ claude: { body: claudeMessage({ ...READING, found: false }) } }));
    const r = await readVideo(LINK);
    expect(r.json).toMatchObject({ found: false, ingredients: [], steps: [], title: PANCAKES.title });
  });

  it('R9 a refusal → 422; a Claude failure → 502; YouTube not found → 404; quota → 502 — nothing saved', async () => {
    fakeWorld(happy({ claude: { body: claudeMessage(null, { stop_reason: 'refusal', stop_details: { type: 'refusal', category: null, explanation: 'no' } }) } }));
    expect((await readVideo(LINK)).json.error).toBe('recipe_refused');
    vi.restoreAllMocks();
    fakeWorld(happy({ claude: { status: 400, body: { type: 'error', error: { type: 'invalid_request_error', message: 'bad' } } } }));
    const failed = await readVideo(LINK);
    expect([failed.status, failed.json.error]).toEqual([502, 'recipe_reading_failed']);
    vi.restoreAllMocks();
    const heard = fakeWorld(happy({ video: { body: videoAnswer(null) } }));
    const gone = await readVideo(LINK);
    expect([gone.status, gone.json.error]).toEqual([404, 'video_unavailable']);
    expect(heard.map((h) => h.host)).toEqual(['www.googleapis.com']); // no captions, no Claude after a failed lookup
    vi.restoreAllMocks();
    fakeWorld(happy({ video: { status: 403, body: { error: { errors: [{ reason: 'quotaExceeded' }] } } } }));
    const quota = await readVideo(LINK);
    expect([quota.status, quota.json.error]).toEqual([502, 'youtube_failed']);
    expect((await o.get('/recipes')).json).toEqual([]);
  });

  it('R4 the same video again → 409 duplicate with its recipeId; no read spent, nothing fetched', async () => {
    fakeWorld(happy());
    const first = await readVideo(LINK);
    vi.restoreAllMocks();
    const heard = fakeWorld(happy());
    const again = await readVideo(`https://www.youtube.com/watch?v=${VIDEO_ID}&t=42s`);
    expect(again.status).toBe(409);
    expect(again.json).toMatchObject({ error: 'duplicate', recipeId: first.json.id });
    expect(again.json.message).toBeTruthy();
    expect(heard).toEqual([]);
    expect(await reads()).toBe(1);
  });
});

describe('M4o recipes CRUD', () => {
  it('a typed recipe: 201, source typed, no video; bad input → 400 naming the field', async () => {
    const r = await o.post('/recipes', { title: 'Lentil soup', ingredients: ['1 cup lentils', ' '], steps: ['Simmer'] });
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ title: 'Lentil soup', ingredients: ['1 cup lentils'], found: true, source: ['typed'], videoId: null, watchUrl: null, thumbnailUrl: null });
    const bad = await o.post('/recipes', { title: 'x', ingredients: ['y'.repeat(INGREDIENT_MAX + 1)] });
    expect([bad.status, bad.json.error]).toEqual([400, 'invalid_input']);
    expect(bad.json.message).toMatch(/ingredients/);
  });

  it('R10 a hand edit adding ingredients sets found; PATCH merges; DELETE is soft and frees the video', async () => {
    fakeWorld(happy({ claude: { body: claudeMessage({ ...READING, found: false }) } }));
    const read = await readVideo(LINK);
    expect(read.json.found).toBe(false);
    const edited = await o.patch(`/recipes/${read.json.id}`, { ingredients: ['2 eggs', '1 cup milk'] });
    expect(edited.status).toBe(200);
    expect(edited.json).toMatchObject({ found: true, ingredients: ['2 eggs', '1 cup milk'], title: PANCAKES.title, videoId: VIDEO_ID, source: read.json.source });
    const emptied = await o.patch(`/recipes/${read.json.id}`, { ingredients: [], steps: [] });
    expect(emptied.json.found).toBe(false);
    expect((await o.patch(`/recipes/${read.json.id}`, { title: '' })).status).toBe(400);

    expect((await o.del(`/recipes/${read.json.id}`)).status).toBe(204);
    expect((await o.get(`/recipes/${read.json.id}`)).status).toBe(404);
    expect((await o.del(`/recipes/${read.json.id}`)).status).toBe(404);
    expect((await o.get('/recipes')).json).toEqual([]);
    vi.restoreAllMocks();
    fakeWorld(happy());
    expect((await readVideo(LINK)).status).toBe(201); // the deleted one no longer holds the video
  });
});

describe('R11 producer vs consumer — every ingredient the recipe rules can produce fits a Shopping item', () => {
  it('each is accepted by the real POST /lists/{shopping}/items and kept as sent', async () => {
    const hostile = [
      'Milk', `  ${'x'.repeat(300)}`, 'a\n\tb   c', `${'é'.repeat(119)}  `, `a${'🍅'.repeat(70)}`, '🍅'.repeat(60), 'y'.repeat(INGREDIENT_MAX),
      ` ${'z'.repeat(INGREDIENT_MAX)} `, '   ', '', '1/2 tsp salt\r\n', 'Ünïcödé — “quotes” & <tags>',
    ];
    const produced = [
      ...cleanRecipeReading({ found: true, ingredients: [...hostile, 42, null] }, 'v').ingredients,
      ...(parseRecipeInput({ title: 't', ingredients: hostile.filter((h) => h.replace(/\s+/g, ' ').trim().length <= INGREDIENT_MAX) }) as RecipeInput).ingredients,
    ];
    expect(produced.length).toBeGreaterThan(15);
    for (const text of new Set(produced)) {
      const r = await o.post(`/lists/${SHOPPING_LIST_ID}/items`, { text });
      expect([200, 201], `${JSON.stringify(text)} → ${JSON.stringify(r.json)}`).toContain(r.status);
      expect(r.json.item.text).toBe(text);
    }
  });
});

it('SELF stays pinned: the test env has the recipe keys empty', () => {
  expect((env as any).YOUTUBE_API_KEY).toBe('');
  expect(SELF).toBeDefined();
});
