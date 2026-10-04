// H-C4..H-C7 (SPEC §7E.2c) — POST /recipes/from-video asking SogoAI in-line when YouTube blocks the Worker's
// captions: read from home → saved complete with `captions`; a home failure or no configuration → "from home: …";
// `none` and `failed` never ask; one read either way. Through the real Worker with recipe-fakes (fake keys, fake
// Access credentials, the pinned https://sogoai.test) — a fetch spy that refuses every other host.
import { createExecutionContext, env } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/worker/index';
import type { Env } from '../src/worker/env';
import { HOME_CAPTIONS_OFF, homeCaptionsError } from '../src/shared/recipe-reading';
import { BASE, Client, owner } from './helpers';
import {
  TRACKS, VIDEO_ID, claudeMessage, commentsAnswer, fakeWorld, homeEnv, json3, keyedEnv, playerAnswer, videoAnswer, warmClaude,
  type World,
} from './recipe-fakes';

let o: Client;
beforeAll(async () => { o = await owner(); await warmClaude(); }, 60_000);
beforeEach(async () => {
  await env.DB.batch([env.DB.prepare('DELETE FROM recipe_emojis'), env.DB.prepare('DELETE FROM recipes'), env.DB.prepare('DELETE FROM recipe_reads')]);
});
afterEach(() => { vi.restoreAllMocks(); });

const reads = async () => (await env.DB.prepare('SELECT COUNT(*) AS n FROM recipe_reads').first<{ n: number }>())!.n;
const rowOf = (id: string) => env.DB.prepare('SELECT * FROM recipes WHERE id = ?').bind(id).first<Record<string, any>>();

const READING = { found: true, title: 'Pancakes', ingredients: ['2 eggs', '1 cup milk'], steps: ['Whisk', 'Fry'], servings: '4', time: '15 min' };
const world = (over: World = {}): World => ({
  video: { body: videoAnswer({ title: 'Cooking vlog', channelTitle: 'Chef Kai', description: 'Ingredients: 2 eggs, 1 cup milk.' }) },
  comments: { body: commentsAnswer() },
  player: { body: playerAnswer(undefined, 'LOGIN_REQUIRED') }, // blocked from Cloudflare
  claude: { body: claudeMessage(READING) },
  ...over,
});
const FROM_HOME = { ok: true, text: 'whisk two eggs with a cup of milk then fry', language: 'en' };

async function readVideo(w: World, e: Env = homeEnv()) {
  const heard = fakeWorld(w);
  const res = await worker.fetch(new Request(`${BASE}/recipes/from-video`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: o.cookie }, body: JSON.stringify({ url: `https://youtu.be/${VIDEO_ID}` }),
  }), e, createExecutionContext());
  const home = heard.filter((h) => h.host === 'sogoai.test');
  return { status: res.status, json: await res.json<any>(), heard, home };
}

describe('M4s from-video asks SogoAI in-line', () => {
  it('H-C4 blocked + home reads them → saved with captions, captionsError null, one GET home, one read', async () => {
    const r = await readVideo(world({ home: { body: FROM_HOME } }));
    expect(r.status, JSON.stringify(r.json)).toBe(201);
    expect(r.json).toMatchObject({ source: ['description', 'captions'], captionsError: null, found: true, title: 'Pancakes' });
    expect(r.home).toHaveLength(1);
    expect(r.home[0].url).toBe(`https://sogoai.test/captions?v=${VIDEO_ID}`);
    expect(r.home[0].headers.get('authorization')).toBe(`Bearer ${(env as unknown as Env).CAPTIONS_TOKEN}`);
    expect(r.home[0].headers.get('cf-access-client-id')).toBe('fake-access-id');
    expect(r.home[0].redirect).toBe('manual');
    const claude = r.heard.find((h) => h.host === 'api.anthropic.com')!;
    expect(JSON.stringify(claude.body)).toContain(FROM_HOME.text);
    expect(await reads()).toBe(1);
    expect(await rowOf(r.json.id)).toMatchObject({ captions_error: null, source: '["description","captions"]' });
    expect(Object.keys((await rowOf(r.json.id))!)).not.toContain('captions_job');
  });

  it('H-C5 blocked + home fails → "from home: …", still saved from the description, one read', async () => {
    const down = await readVideo(world({ home: { status: 502, body: 'Bad gateway' } }));
    expect(down.status).toBe(201);
    expect(down.json).toMatchObject({ source: ['description'], captionsError: 'from home: HTTP 502: Bad gateway', found: true });
    expect(await reads()).toBe(1);

    await env.DB.prepare('DELETE FROM recipes').run();
    vi.restoreAllMocks();
    const refused = await readVideo(world({ home: { body: { ok: false, kind: 'blocked', reason: 'YouTube said LOGIN_REQUIRED.' } } }));
    expect(refused.json.captionsError).toBe('from home: YouTube said LOGIN_REQUIRED.');
    expect(await reads()).toBe(2);
  });

  it('H-C6 blocked + captions from home not configured (the pinned env) → the not-set-up text; home never asked', async () => {
    const r = await readVideo(world({ home: { body: FROM_HOME } }), keyedEnv());
    expect(r.status).toBe(201);
    expect(r.json.captionsError).toBe(homeCaptionsError(HOME_CAPTIONS_OFF));
    expect(r.json.captionsError).toBe("from home: captions from home aren't set up.");
    expect(r.home).toEqual([]);
    expect(await reads()).toBe(1);
  });

  it('H-C7 captions none or failed → home is never asked', async () => {
    const none = await readVideo(world({ player: { body: playerAnswer() }, home: { body: FROM_HOME } }));
    expect([none.status, none.json.captionsError, none.home.length]).toEqual([201, 'This video has no captions.', 0]);
    await env.DB.prepare('DELETE FROM recipes').run();
    vi.restoreAllMocks();
    const failed = await readVideo(world({ player: { status: 500, body: '' }, home: { body: FROM_HOME } }));
    expect([failed.status, failed.home.length]).toEqual([201, 0]);
    expect(failed.json.captionsError).toMatch(/HTTP 500/);
  });

  it('captions read in the Worker → home is never asked', async () => {
    const r = await readVideo(world({ player: { body: playerAnswer(TRACKS) }, captions: { body: json3('whisk the eggs') }, home: { body: FROM_HOME } }));
    expect([r.status, r.home.length, r.json.captionsError]).toEqual([201, 0, null]);
  });
});
