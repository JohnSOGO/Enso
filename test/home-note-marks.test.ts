// NA3, NA4 (SPEC §8.4a) — home/note-marks.ts over a fake PC model manager and a fake LM Studio (never a real network):
// off without a model or a manager, busy while it changes models or the model isn't loaded (LM Studio not asked), one
// LM Studio POST with no ttl when ready, failed honestly; never a lease, load or unload. Then the helper's
// POST /note-marks: its checks, its report, and a log line that never holds the notes or the token.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { noteMarks, NOTE_MARKS_TIMEOUT_MS } from '../home/note-marks';
import { MODEL_MANAGER_URL } from '../home/model-manager';
import { LM_STUDIO_URL } from '../home/lm-studio';
import { handle, NOTE_MARKS_BODY_MAX } from '../home/captions-helper';
import { NOTE_MARKS_PROMPT, NOTE_MARKS_SCHEMA, NOTE_MARKS_TEXT_MAX } from '../src/shared/note-marks';

const MODEL = 'photo-polish';
const NOTES = "Gate code 4471. Sam's allergy is peanuts.";
const MARKS = [{ text: 'Gate code 4471', kind: 'key' }, { text: "Sam's allergy is peanuts", kind: 'key' }];

const LOADED = { busy: null, mem: { lmStudio: [{ identifier: MODEL, key: 'qwen3-vl-8b' }] } };
type Reply = object | 'throw' | { status: number };

/** The manager and LM Studio in one fetch, recording every request. */
function pc(manager: Reply = LOADED, lm: Reply = { choices: [{ message: { content: JSON.stringify({ marks: MARKS }) } }] }) {
  const seen: { method: string; url: string; body: any; signal: AbortSignal | null | undefined }[] = [];
  const answer = (r: Reply) => {
    if (r === 'throw') throw new Error('connect ECONNREFUSED');
    if ('status' in r && Object.keys(r).length === 1) return new Response('nope', { status: (r as { status: number }).status });
    return Response.json(r);
  };
  const f: typeof fetch = async (input, init) => {
    const req = new Request(input, init);
    seen.push({ method: req.method, url: req.url, body: await req.clone().json().catch(() => null), signal: init?.signal });
    if (req.url === `${MODEL_MANAGER_URL}/state`) return answer(manager);
    if (req.url === LM_STUDIO_URL) return answer(lm);
    throw new Error(`unexpected ${req.method} ${req.url}`);
  };
  return { f, seen };
}

afterEach(() => { vi.restoreAllMocks(); });

describe('NA3 noteMarks', () => {
  it('ready → GET /state, then one LM Studio POST: the model, the prompt, temperature 0, the json_schema, no ttl → the marks', async () => {
    const { f, seen } = pc();
    expect(await noteMarks(NOTES, { model: MODEL, fetch: f })).toEqual({ ok: true, marks: MARKS });
    expect(seen.map((s) => `${s.method} ${s.url}`)).toEqual([`GET ${MODEL_MANAGER_URL}/state`, `POST ${LM_STUDIO_URL}`]);
    const body = seen[1].body;
    expect(body).toMatchObject({
      model: MODEL, temperature: 0, stream: false, response_format: NOTE_MARKS_SCHEMA,
      messages: [{ role: 'system', content: NOTE_MARKS_PROMPT }, { role: 'user', content: NOTES }],
    });
    expect('ttl' in body).toBe(false);
    expect(seen[1].signal).toBeTruthy();
    expect(NOTE_MARKS_TIMEOUT_MS).toBe(15_000);
  });

  it('no IDENTIFY_MODEL → off, nothing called', async () => {
    const { f, seen } = pc();
    expect(await noteMarks(NOTES, { model: undefined, fetch: f })).toMatchObject({ ok: false, kind: 'off' });
    expect(seen).toHaveLength(0);
  });

  it('the manager unreachable or failing → off; changing models or the model not loaded → busy; LM Studio never asked', async () => {
    const cases: [Reply, string][] = [
      ['throw', 'off'],
      [{ status: 500 }, 'off'],
      [{ ...LOADED, busy: { action: 'unload' } }, 'busy'],
      [{ busy: null, mem: { lmStudio: [{ identifier: 'qwen-uncensored' }] } }, 'busy'],
      [{ busy: null, mem: {} }, 'busy'],
    ];
    for (const [manager, kind] of cases) {
      const { f, seen } = pc(manager);
      const r = await noteMarks(NOTES, { model: MODEL, fetch: f });
      expect(r, JSON.stringify(manager)).toMatchObject({ ok: false, kind });
      expect(seen.map((s) => s.url)).toEqual([`${MODEL_MANAGER_URL}/state`]);
    }
  });

  it('LM Studio non-2xx, down, or not JSON → failed with the reason', async () => {
    for (const lm of [{ status: 500 }, 'throw', { choices: [{ message: { content: 'sure! here you go' } }] }] as Reply[]) {
      const { f } = pc(LOADED, lm);
      const r = await noteMarks(NOTES, { model: MODEL, fetch: f });
      expect(r, JSON.stringify(lm)).toMatchObject({ ok: false, kind: 'failed' });
      expect((r as { reason: string }).reason.length).toBeGreaterThan(0);
    }
  });

  it('never a lease, load or unload: only GET /state and the chat call are ever made', async () => {
    const { f, seen } = pc();
    await noteMarks(NOTES, { model: MODEL, fetch: f });
    expect(seen.every((s) => s.url === `${MODEL_MANAGER_URL}/state` || s.url === LM_STUDIO_URL)).toBe(true);
  });
});

describe('NA4 handle /note-marks', () => {
  const TOKEN = 'helper-test-token-never-logged';
  const enc = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));
  type Over = { method?: string; authorization?: string | null; contentType?: string; body?: Uint8Array | 'too_large' };
  const req = (over: Over = {}, f = pc().f) => handle({
    method: over.method ?? 'POST', url: '/note-marks', contentType: over.contentType ?? 'application/json',
    body: over.body ?? enc({ text: NOTES }),
    ...(over.authorization === null ? {} : { authorization: over.authorization ?? `Bearer ${TOKEN}` }),
  }, { token: TOKEN, fetch: f, model: MODEL });
  const logs = () => {
    const out = vi.spyOn(console, 'log').mockImplementation(() => {});
    return () => out.mock.calls.map((args) => args.map(String).join(' '));
  };

  it('a good request → 200 with the report; its log line counts the marks and holds no notes or token', async () => {
    const lines = logs();
    const r = await req();
    expect(r).toEqual({ status: 200, body: { ok: true, marks: MARKS } });
    expect(lines()).toHaveLength(1);
    expect(lines()[0]).toContain('note-marks → 2 marks');
    for (const l of lines()) {
      expect(l).not.toContain('4471');
      expect(l).not.toContain('peanuts');
      expect(l).not.toContain(TOKEN);
    }
  });

  it('401 / 405 / 400 / 413, and LM Studio never asked before the checks pass', async () => {
    logs();
    const cases: [Over, number][] = [
      [{ authorization: null }, 401],
      [{ authorization: 'Bearer wrong' }, 401],
      [{ method: 'GET' }, 405],
      [{ contentType: 'text/plain' }, 400],
      [{ body: new TextEncoder().encode('not json') }, 400],
      [{ body: enc({ text: '   ' }) }, 400],
      [{ body: enc({}) }, 400],
      [{ body: 'too_large' }, 413],
      [{ body: new Uint8Array(NOTE_MARKS_BODY_MAX + 1) }, 413],
      [{ body: enc({ text: 'x'.repeat(NOTE_MARKS_TEXT_MAX + 1) }) }, 413],
    ];
    for (const [over, status] of cases) {
      const lm = pc();
      const r = await req(over, lm.f);
      expect(r.status, JSON.stringify(over).slice(0, 80)).toBe(status);
      expect(lm.seen, JSON.stringify(over).slice(0, 80)).toHaveLength(0);
    }
  });
});
