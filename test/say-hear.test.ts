// SPEC §8.18 SY12 — POST /say/hear: a recorded clip written down by a fake Workers AI binding (never the real one:
// vitest runs with remoteBindings off).
import { createExecutionContext, env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import worker from '../src/worker/index';
import type { Env } from '../src/worker/env';
import { HEAR_MODEL, type SpeechAi } from '../src/worker/speech-to-text';
import { SAY_AUDIO_MAX_BYTES } from '../src/shared/say-reading';
import { BASE, Client, owner } from './helpers';

let o: Client;
beforeAll(async () => { o = await owner(); }, 60_000);

function fakeAi(answer: () => unknown) {
  const calls: { model: string; audio: string }[] = [];
  const ai: SpeechAi = { run: async (model, input) => { calls.push({ model, audio: input.audio }); return answer(); } };
  return { ai, calls };
}

async function hear(e: Env, clip: BodyInit, type = 'audio/mp4', cookie: string | null = o.cookie) {
  const res = await worker.fetch(new Request(`${BASE}/say/hear`, {
    method: 'POST', body: clip, headers: { 'content-type': type, ...(cookie ? { cookie } : {}) },
  }), e, createExecutionContext());
  return { status: res.status, json: await res.json<any>() };
}

describe('SY12 POST /say/hear', () => {
  const clip = new Uint8Array([1, 2, 3, 250]);
  it('writes a clip down and sends the AI the clip as base64', async () => {
    const f = fakeAi(() => ({ text: '  Remind me   at nine. ' }));
    const r = await hear({ ...env, AI: f.ai } as Env, clip, 'audio/mp4; codecs=mp4a.40.2');
    expect(r).toEqual({ status: 200, json: { text: 'Remind me at nine.' } });
    expect(f.calls).toEqual([{ model: HEAR_MODEL, audio: btoa(String.fromCharCode(1, 2, 3, 250)) }]);
  });
  it('is for members, takes audio only, not empty or too big', async () => {
    const f = fakeAi(() => ({ text: 'x' }));
    const e = { ...env, AI: f.ai } as Env;
    expect((await hear(e, clip, 'audio/mp4', null)).status).toBe(401);
    expect((await hear(e, clip, 'image/jpeg')).status).toBe(400);
    expect((await hear(e, new Uint8Array(0))).status).toBe(400);
    expect((await hear(e, new Uint8Array(SAY_AUDIO_MAX_BYTES + 1))).status).toBe(400);
    expect(f.calls).toHaveLength(0);
  });
  it('a failing AI is a 502, no AI binding a 503', async () => {
    const bad = fakeAi(() => { throw new Error('boom'); });
    expect(await hear({ ...env, AI: bad.ai } as Env, clip)).toMatchObject({ status: 502, json: { error: 'hear_failed' } });
    expect(await hear({ ...env, AI: undefined } as Env, clip)).toMatchObject({ status: 503, json: { error: 'hear_off' } });
  });
});
