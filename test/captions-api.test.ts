// M4s acceptance (SPEC §7E.2c) — captions from home: POST /captions/claim and /captions/report through the real
// Worker, the queue in from-video, the give-up rule, and a transcript re-read ending a pending job. Fakes only:
// recipe-fakes' keyedEnv (fake keys, the pinned TEST-ONLY CAPTIONS_TOKEN) and a fetch spy refusing every other host.
import { createExecutionContext, env } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/worker/index';
import type { Env } from '../src/worker/env';
import { giveUpCaptionsJobs } from '../src/worker/captions-jobs';
import {
  CAPTIONS_CLAIM_STALE_MIN, CAPTIONS_JOB_ATTEMPTS, CAPTIONS_JOB_GIVE_UP_MIN, HOME_CAPTIONS_EDITED, HOME_CAPTIONS_GAVE_UP,
  HOME_CAPTIONS_NO_RECIPE,
} from '../src/shared/recipe-reading';
import { BASE, Client, owner } from './helpers';
import {
  CHANNEL_ID, TRACKS, VIDEO_ID, claudeMessage, commentsAnswer, fakeWorld, json3, keyedEnv, playerAnswer, videoAnswer, warmClaude,
  type World,
} from './recipe-fakes';

let o: Client;
let me: string;
beforeAll(async () => { o = await owner(); me = (await o.get('/me')).json.id; await warmClaude(); }, 60_000);
beforeEach(async () => {
  await env.DB.batch([env.DB.prepare('DELETE FROM recipe_emojis'), env.DB.prepare('DELETE FROM recipes'), env.DB.prepare('DELETE FROM recipe_reads')]);
});
afterEach(() => { vi.restoreAllMocks(); });

const TOKEN = (env as unknown as Env).CAPTIONS_TOKEN!;
const ago = (min: number, from = Date.now()) => new Date(from - min * 60_000).toISOString();
const reads = async () => (await env.DB.prepare('SELECT COUNT(*) AS n FROM recipe_reads').first<{ n: number }>())!.n;
const rowOf = (id: string) => env.DB.prepare('SELECT * FROM recipes WHERE id = ?').bind(id).first<Record<string, any>>();
const JOB_CLEARED = { captions_job: null, captions_queued_at: null, captions_claimed_at: null, captions_attempts: 0 };

/** A video recipe saved by from-video with captions blocked, its job as `over` says (queued a minute ago by default). */
async function saved(over: Record<string, unknown> = {}): Promise<string> {
  const queued = ago(1);
  const r = {
    id: `rcp_${Math.random().toString(36).slice(2, 10)}`, video_id: VIDEO_ID, ingredients: '[]', steps: '[]', found: 0,
    source: '["description"]', captions_error: "YouTube's player said LOGIN_REQUIRED.", captions_job: 'queued', captions_queued_at: queued,
    captions_claimed_at: null, captions_attempts: 0, updated_at: queued, deleted_at: null, ...over,
  };
  await env.DB.prepare(`INSERT INTO recipes (id, title, video_id, video_title, channel, ingredients, steps, found, source, captions_error,
    captions_job, captions_queued_at, captions_claimed_at, captions_attempts, created_by, created_at, updated_at, deleted_at)
    VALUES (?, 'Cooking vlog', ?, 'Cooking vlog', 'Chef Kai', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(r.id, r.video_id, r.ingredients, r.steps, r.found, r.source, r.captions_error, r.captions_job, r.captions_queued_at,
      r.captions_claimed_at, r.captions_attempts, me, r.updated_at, r.updated_at, r.deleted_at).run();
  return r.id;
}

/** A POST to the helper's door with the bearer (the pinned test token unless `token` says otherwise). */
async function door(path: string, body?: object, opts: { token?: string | null; env?: Partial<Env> } = {}) {
  const token = opts.token === undefined ? TOKEN : opts.token;
  const res = await worker.fetch(new Request(`${BASE}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(token === null ? {} : { authorization: `Bearer ${token}` }) },
    body: body ? JSON.stringify(body) : undefined,
  }), { ...keyedEnv(), ...opts.env }, createExecutionContext());
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}
const claim = (opts?: Parameters<typeof door>[2]) => door('/captions/claim', undefined, opts);
const report = (recipeId: string, result: unknown) => door('/captions/report', { recipeId, result });

const HOME_TEXT = 'so two eggs and a cup of milk then whisk and fry';
const READING = { found: true, title: 'Pancakes', ingredients: ['2 eggs', '1 cup milk'], steps: ['Whisk', 'Fry'], servings: null, time: null };
const happy = (over: World = {}): World => ({
  video: { body: videoAnswer({ title: 'Cooking vlog', channelTitle: 'Chef Kai', description: 'Thanks for watching!' }) },
  comments: { body: commentsAnswer([[CHANNEL_ID, 'Enjoy!']]) }, claude: { body: claudeMessage(READING) }, ...over,
});

describe('M4s the door — H-C1 auth', () => {
  it('CAPTIONS_TOKEN empty → 503 captions_helper_off on both routes, whatever the bearer', async () => {
    for (const r of [await claim({ env: { CAPTIONS_TOKEN: '' } }), await door('/captions/report', {}, { env: { CAPTIONS_TOKEN: '' } })]) {
      expect([r.status, r.json.error]).toEqual([503, 'captions_helper_off']);
    }
    expect((await claim({ env: { CAPTIONS_TOKEN: undefined }, token: '' })).status).toBe(503);
  });

  it('no bearer, a wrong one, a session cookie → 401; nothing claimed', async () => {
    const id = await saved();
    for (const token of [null, '', 'wrong-token', `${TOKEN}x`]) {
      const r = await claim({ token });
      expect([r.status, r.json.error], String(token)).toEqual([401, 'unauthorized']);
    }
    expect((await o.post('/captions/claim')).status).toBe(401);
    expect((await rowOf(id))!.captions_job).toBe('queued');
  });
});

describe('M4s claim — H-C2..H-C5', () => {
  it('H-C2 no job → 204', async () => {
    await saved({ captions_job: null, captions_queued_at: null });
    expect((await claim()).status).toBe(204);
  });

  it('H-C3 a queued job → 200 { recipeId, videoId } to exactly one of two claims side by side', async () => {
    const id = await saved();
    const both = await Promise.all([claim(), claim()]);
    expect(both.map((r) => r.status).sort()).toEqual([200, 204]);
    expect(both.find((r) => r.status === 200)!.json).toEqual({ recipeId: id, videoId: VIDEO_ID });
    expect(await rowOf(id)).toMatchObject({ captions_job: 'claimed', captions_attempts: 1 });
    expect((await claim()).status).toBe(204); // a fresh claim is not stale
  });

  it('the oldest queued job first; a deleted recipe is never claimed', async () => {
    const newer = await saved({ captions_queued_at: ago(5) });
    const older = await saved({ video_id: 'aaaaaaaaaaa', captions_queued_at: ago(7) });
    await saved({ video_id: 'bbbbbbbbbbb', captions_queued_at: ago(9), deleted_at: ago(1) });
    expect((await claim()).json).toEqual({ recipeId: older, videoId: 'aaaaaaaaaaa' });
    expect((await claim()).json).toEqual({ recipeId: newer, videoId: VIDEO_ID });
    expect((await claim()).status).toBe(204);
  });

  it('H-C4 a claim older than the stale time is claimed again, attempts + 1', async () => {
    const id = await saved({ captions_job: 'claimed', captions_queued_at: ago(5), captions_claimed_at: ago(CAPTIONS_CLAIM_STALE_MIN + 1), captions_attempts: 1 });
    expect((await claim()).json).toEqual({ recipeId: id, videoId: VIDEO_ID });
    expect(await rowOf(id)).toMatchObject({ captions_job: 'claimed', captions_attempts: 2 });
  });

  it('H-C5 a stale claim with its attempts used up is given up first → 204, the give-up text', async () => {
    const id = await saved({ captions_job: 'claimed', captions_queued_at: ago(10), captions_claimed_at: ago(CAPTIONS_CLAIM_STALE_MIN + 1), captions_attempts: CAPTIONS_JOB_ATTEMPTS });
    expect((await claim()).status).toBe(204);
    expect(await rowOf(id)).toMatchObject({ ...JOB_CLEARED, captions_error: HOME_CAPTIONS_GAVE_UP });
    expect(HOME_CAPTIONS_GAVE_UP).toBe("Couldn't get captions from home: the home PC didn't answer in 30 minutes.");
  });
});

describe('M4s report — H-C6..H-C10', () => {
  const claimed = async () => { const id = await saved(); expect((await claim()).status).toBe(200); return id; };

  it('H-C6 ok → re-read from the captions: source has captions, captionsError null, job cleared, no read counted', async () => {
    const id = await claimed();
    const heard = fakeWorld(happy());
    const r = await report(id, { ok: true, text: HOME_TEXT, language: 'en' });
    expect([r.status, r.json]).toEqual([200, { outcome: 'reread' }]);
    const got = (await o.get(`/recipes/${id}`)).json;
    expect(got).toMatchObject({ title: 'Pancakes', ingredients: READING.ingredients, found: true, captionsError: null, captionsPending: false });
    expect(got.source).toContain('captions');
    expect(got.source).not.toContain('transcript');
    expect(await rowOf(id)).toMatchObject(JOB_CLEARED);
    expect(await reads()).toBe(0);
    expect(heard.some((h) => h.path === '/youtubei/v1/player')).toBe(false);
    const prompt = heard.find((h) => h.host === 'api.anthropic.com')!.body.messages[0].content;
    expect(JSON.stringify(prompt)).toContain(HOME_TEXT);
  });

  it('H-C7 ok:false → captions_error "from home: …", job cleared, nothing fetched', async () => {
    const id = await claimed();
    const heard = fakeWorld(happy());
    const r = await report(id, { ok: false, kind: 'blocked', reason: 'YouTube refused the captions (HTTP 429).' });
    expect([r.status, r.json]).toEqual([200, { outcome: 'captions_failed' }]);
    expect(await rowOf(id)).toMatchObject({ ...JOB_CLEARED, captions_error: 'from home: YouTube refused the captions (HTTP 429).' });
    expect(heard).toEqual([]);
  });

  it('H-C8 no recipe in the captions → content untouched, the no-recipe text, job cleared', async () => {
    const id = await claimed();
    const before = await rowOf(id);
    fakeWorld(happy({ claude: { body: claudeMessage({ ...READING, found: false }) } }));
    const r = await report(id, { ok: true, text: HOME_TEXT, language: 'en' });
    expect([r.status, r.json]).toEqual([200, { outcome: 'no_recipe' }]);
    expect(await rowOf(id)).toEqual({ ...before, ...JOB_CLEARED, captions_error: HOME_CAPTIONS_NO_RECIPE });
    expect(await reads()).toBe(0);
  });

  it('H-C9 edited by hand after queueing → not replaced, the edited text, nothing fetched', async () => {
    const id = await claimed();
    expect((await o.patch(`/recipes/${id}`, { title: 'My pancakes', ingredients: ['3 eggs'] })).status).toBe(200);
    const heard = fakeWorld(happy());
    const r = await report(id, { ok: true, text: HOME_TEXT, language: 'en' });
    expect([r.status, r.json]).toEqual([200, { outcome: 'edited' }]);
    expect(await rowOf(id)).toMatchObject({ ...JOB_CLEARED, title: 'My pancakes', ingredients: '["3 eggs"]', captions_error: HOME_CAPTIONS_EDITED });
    expect(heard).toEqual([]);
  });

  it('a re-read that fails → "from home: {reason}", content untouched', async () => {
    const id = await claimed();
    fakeWorld(happy({ video: { body: videoAnswer(null) } }));
    const r = await report(id, { ok: true, text: HOME_TEXT, language: 'en' });
    expect([r.status, r.json]).toEqual([200, { outcome: 'reread_failed' }]);
    expect((await rowOf(id))!.captions_error).toMatch(/^from home: /);
    expect(await rowOf(id)).toMatchObject({ ...JOB_CLEARED, found: 0 });
  });

  it('H-C10 not claimed, unknown, ended → 409 not_claimed; a bad body → 400', async () => {
    const heard = fakeWorld(happy());
    const queued = await saved();
    const ok = { ok: true, text: HOME_TEXT, language: 'en' };
    expect((await report(queued, ok)).json).toMatchObject({ error: 'not_claimed' });
    expect((await report('rcp_nope', ok)).status).toBe(409);
    expect((await claim()).status).toBe(200);
    expect((await report(queued, { ok: false, kind: 'none', reason: 'This video has no captions.' })).status).toBe(200);
    expect((await report(queued, ok)).status).toBe(409); // ended already
    for (const bad of [null, 'text', { ok: true, text: '' }, { ok: false, kind: 'quota', reason: 'x' }, { ok: false, kind: 'none', reason: ' ' }, { ok: 'yes' }]) {
      const r = await report(queued, bad);
      expect([r.status, r.json.error], JSON.stringify(bad)).toEqual([400, 'invalid_input']);
    }
    expect((await door('/captions/report', { result: ok })).status).toBe(400);
    expect(heard).toEqual([]);
  });
});

describe('M4s give up — H-C11', () => {
  it('queued longer than the give-up time → ended with the text; a younger one untouched', async () => {
    const at = Date.parse('2026-10-04T12:00:00.000Z');
    const id = await saved({ captions_queued_at: ago(0, at), updated_at: ago(0, at) });
    expect(await giveUpCaptionsJobs(env.DB, ago(-(CAPTIONS_JOB_GIVE_UP_MIN - 1), at))).toBe(0);
    expect((await rowOf(id))!.captions_job).toBe('queued');
    expect(await giveUpCaptionsJobs(env.DB, ago(-(CAPTIONS_JOB_GIVE_UP_MIN + 1), at))).toBe(1);
    expect(await rowOf(id)).toMatchObject({ ...JOB_CLEARED, captions_error: HOME_CAPTIONS_GAVE_UP });
  });
});

describe('M4s queueing — H-C12, H-C13', () => {
  async function readVideo(world: World, over: Partial<Env> = {}) {
    fakeWorld(world);
    const res = await worker.fetch(new Request(`${BASE}/recipes/from-video`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: o.cookie }, body: JSON.stringify({ url: `https://youtu.be/${VIDEO_ID}` }),
    }), { ...keyedEnv(), ...over }, createExecutionContext());
    return { status: res.status, json: await res.json<any>() };
  }
  const blocked: World = { ...happy(), player: { body: playerAnswer(undefined, 'LOGIN_REQUIRED') } };

  it('captions blocked → saved from the description with a job queued (captionsPending)', async () => {
    const r = await readVideo(blocked);
    expect(r.status, JSON.stringify(r.json)).toBe(201);
    expect(r.json).toMatchObject({ captionsPending: true, found: true });
    expect(r.json.captionsError).toMatch(/LOGIN_REQUIRED/);
    expect(await rowOf(r.json.id)).toMatchObject({ captions_job: 'queued', captions_attempts: 0 });
    expect((await claim()).json).toEqual({ recipeId: r.json.id, videoId: VIDEO_ID });
  });

  it('captions none → no job; blocked with CAPTIONS_TOKEN empty → no job', async () => {
    const none = await readVideo({ ...happy(), player: { body: playerAnswer() } });
    expect([none.status, none.json.captionsPending]).toEqual([201, false]);
    await env.DB.prepare('DELETE FROM recipes').run();
    vi.restoreAllMocks();
    const off = await readVideo(blocked, { CAPTIONS_TOKEN: '' });
    expect([off.status, off.json.captionsPending]).toEqual([201, false]);
    expect((await rowOf(off.json.id))!.captions_job).toBeNull();
  });

  it('captions read in the Worker → no job', async () => {
    const r = await readVideo({ ...happy(), player: { body: playerAnswer(TRACKS) }, captions: { body: json3('whisk the eggs') } });
    expect([r.status, r.json.captionsPending]).toEqual([201, false]);
  });

  it('H-C13 a transcript re-read on a recipe with a pending job ends the job', async () => {
    const id = await saved();
    fakeWorld(happy());
    const res = await worker.fetch(new Request(`${BASE}/recipes/${id}/transcript`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: o.cookie }, body: JSON.stringify({ text: HOME_TEXT }),
    }), keyedEnv(), createExecutionContext());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ captionsPending: false, captionsError: null });
    expect(await rowOf(id)).toMatchObject(JOB_CLEARED);
    expect((await claim()).status).toBe(204);
  });
});
