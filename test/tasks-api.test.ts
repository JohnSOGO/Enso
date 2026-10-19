// SPEC §7G.7 TB7–TB14 — the 💪 Task buddy through the real Worker. Routes use the real clock, so a test finds a
// check-in's due time on its fire and ticks there (and later) through /dev/tick. Claude is a fake api.anthropic.com.
import { createExecutionContext, env } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/worker/index';
import { BASE, Client, member, owner, tickAt } from './helpers';
import { claudeMessage, keyedEnv, warmClaude } from './recipe-fakes';
import { addMinutes } from '../src/shared/time';

let o: Client, b: Client, A: string, B: string;
beforeAll(async () => {
  o = await owner(); A = (await o.get('/me')).json.id;
  const m = await member(o); b = m.client; B = m.id;
  await warmClaude();
}, 60_000);
beforeEach(async () => {
  // every test starts with no open task (one per person, Q298)
  await env.DB.exec(`UPDATE task_sessions SET ended_at = '2026-01-01T00:00:00.000Z', outcome = 'stopped' WHERE ended_at IS NULL;
    UPDATE fires SET state = 'closed', close_reason = 'stopped' WHERE substr(timer_id, 1, 5) = 'task_' AND state != 'closed'; DELETE FROM photo_reads`);
});
afterEach(() => { vi.restoreAllMocks(); });

const START = { title: 'Clean the garage', intervalMin: 15, channels: ['push', 'house'], doneLooks: ['Floor clear', 'Bikes on hooks', 'Trash out'] };
const start = async (c: Client, over: object = {}) => {
  const r = await c.post('/tasks', { ...START, ...over });
  expect(r.status, JSON.stringify(r.json)).toBe(201);
  return r.json;
};
const openFire = async (id: string) => env.DB.prepare(`SELECT * FROM fires WHERE timer_id = ? AND state != 'closed'`).bind(id).first<any>();
const deliveriesOf = async (fireId: string) =>
  (await env.DB.prepare('SELECT channel, member_id, message, alert_number FROM deliveries WHERE fire_id = ? ORDER BY alert_number, channel').bind(fireId).all<any>()).results;

describe('TB7–TB8 start and the first check-in', () => {
  it('TB7 a task_ timer hidden from /timers; its check-in goes to me only, the nudge also to the house', async () => {
    const r = await start(o);
    expect(r.said).toBe("Sounds good! I'll check on you every 15 minutes while you work on Clean the garage. Let's make some progress!");
    expect(r.task).toMatchObject({ title: 'Clean the garage', state: 'working', intervalMin: 15, limitMin: null, doneLooks: START.doneLooks, workedMin: 0 });
    const id = r.task.id;
    expect(id.startsWith('task_')).toBe(true);
    expect((await o.get('/timers')).json.some((t: any) => t.id === id)).toBe(false);
    expect((await o.patch(`/timers/${id}`, { title: 'x' })).status).toBe(404);
    const f = await openFire(id);
    expect(Date.parse(f.due_at) - Date.parse(r.task.startedAt)).toBe(15 * 60_000);
    await tickAt(o, f.due_at);
    await tickAt(o, addMinutes(f.due_at, 10));
    await tickAt(o, addMinutes(f.due_at, 20));
    const d = await deliveriesOf(f.id);
    expect(d.filter((x) => x.channel === 'push').map((x) => [x.member_id, x.alert_number, x.message])).toEqual([
      [A, 1, "Clean the garage: how's it going?"],
      [A, 2, "Still working on Clean the garage? No rush checking in. I'm here when you need me."],
    ]);
    expect(d.filter((x) => x.channel === 'house').map((x) => x.message)).toEqual(["Still working on Clean the garage? No rush checking in. I'm here when you need me."]);
    // TB10: after the nudge it waits quietly, still ringing
    expect(await openFire(id)).toMatchObject({ state: 'ringing', alert_count: 2 });
    // TB14: mine alone, with taskTimeUp; Ack refused
    expect((await o.get('/fires?state=ringing')).json.find((x: any) => x.id === f.id)).toMatchObject({ timerId: id, taskTimeUp: false });
    expect((await b.get('/fires?state=ringing')).json.some((x: any) => x.id === f.id)).toBe(false);
    const ack = await o.post(`/fires/${f.id}/actions`, { action: 'ack' });
    expect(ack.status).toBe(409);
    expect(ack.json.message).toBe("Answer this check-in with how it's going.");
    // Q308: another member's Status leaves my check-ins out
    expect((await b.get('/status')).json.recentDeliveries.some((x: any) => x.message.includes('Clean the garage'))).toBe(false);
    expect((await o.get('/status')).json.recentDeliveries.some((x: any) => x.message.includes('Clean the garage'))).toBe(true);
    // the alert card names it
    expect((await o.get('/me/alerts')).json.alerts.find((x: any) => x.fireId === f.id)).toMatchObject({ source: '💪 Task buddy' });
  });

  it('TB7 Private: the speaker never hears the title', async () => {
    const r = await start(o, { private: true });
    const f = await openFire(r.task.id);
    await tickAt(o, f.due_at);
    await tickAt(o, addMinutes(f.due_at, 10));
    const d = await deliveriesOf(f.id);
    expect(d.find((x) => x.channel === 'push').message).toBe("Your task: how's it going?");
    expect(d.filter((x) => x.channel === 'house').map((x) => x.message)).toEqual(['Time for a task check-in.']);
  });

  it('TB8 one open task each; another member is not refused, and cannot reach mine', async () => {
    const r = await start(o);
    const again = await o.post('/tasks', START);
    expect(again).toMatchObject({ status: 409, json: { error: 'busy' } });
    const other = await start(b, { title: 'Homework' });
    expect((await b.post(`/tasks/${r.task.id}/pause`)).status).toBe(404);
    expect((await o.get('/tasks')).json.active.id).toBe(r.task.id);
    expect((await b.get('/tasks')).json.active.id).toBe(other.task.id);
    expect((await o.post('/tasks', { ...START, title: '' })).status).toBe(400);
  });

  it('TB15 /status myTask: mine only, with its state (Q309)', async () => {
    expect((await o.get('/status')).json.myTask).toBeNull();
    const r = await start(o, { private: true });
    const id = r.task.id;
    expect((await o.get('/status')).json.myTask).toEqual({ title: 'Clean the garage', state: 'working' });
    expect((await b.get('/status')).json.myTask).toBeNull();
    await o.post(`/tasks/${id}/checkin`, { mood: 'break', breakMin: 15 });
    expect((await o.get('/status')).json.myTask.state).toBe('break');
    await o.post(`/tasks/${id}/resume`);
    await o.post(`/tasks/${id}/pause`);
    expect((await o.get('/status')).json.myTask.state).toBe('paused');
    await o.post(`/tasks/${id}/stop`);
    expect((await o.get('/status')).json.myTask).toBeNull();
  });
});

describe('TB9–TB12 answers, changes, the end', () => {
  it('TB9 great; struggling; a 15-minute break', async () => {
    const id = (await start(o)).task.id;
    const f1 = await openFire(id);
    const g = await o.post(`/tasks/${id}/checkin`, { mood: 'great' });
    expect(g.status, JSON.stringify(g.json)).toBe(200);
    expect(g.json.said).toBeTruthy();
    expect((await env.DB.prepare('SELECT close_reason FROM fires WHERE id = ?').bind(f1.id).first<any>()).close_reason).toBe('acked');
    const f2 = await openFire(id);
    expect(Date.parse(f2.due_at) - Date.now()).toBeGreaterThan(14 * 60_000);
    const s = await o.post(`/tasks/${id}/checkin`, { mood: 'struggling' });
    expect(s.json.said).toMatch(/“(Floor clear|Bikes on hooks|Trash out)”/);
    const brk = await o.post(`/tasks/${id}/checkin`, { mood: 'break', breakMin: 15 });
    expect(brk.json.task).toMatchObject({ state: 'break' });
    expect(Date.parse((await openFire(id)).due_at) - Date.parse(brk.json.task.breakUntil)).toBe(0);
    expect((await o.post(`/tasks/${id}/checkin`, { mood: 'break', breakMin: 7 })).status).toBe(400);
    expect((await o.post(`/tasks/${id}/checkin`, { mood: 'meh' })).status).toBe(400);
    expect(brk.json.task.checkins.map((c: any) => c.mood)).toEqual(['great', 'struggling', 'break']);
  });

  it('TB11 pause, resume, interval, more time, quiet', async () => {
    const id = (await start(o, { limitMin: 60 })).task.id;
    const p = await o.post(`/tasks/${id}/pause`);
    expect(p.json.task).toMatchObject({ state: 'paused', openFire: null });
    expect((await o.post(`/tasks/${id}/pause`)).json.error).toBe('not_working');
    const r = await o.post(`/tasks/${id}/resume`);
    expect(r.json).toMatchObject({ task: { state: 'working' }, said: expect.stringMatching(/back/i) });
    const e = await o.patch(`/tasks/${id}`, { intervalMin: 10 });
    expect(e.json.task.intervalMin).toBe(10);
    expect(Math.round((Date.parse((await openFire(id)).due_at) - Date.now()) / 60_000)).toBe(10);
    expect((await o.patch(`/tasks/${id}`, { addMin: 30 })).json.task.limitMin).toBe(90);
    expect((await o.patch(`/tasks/${id}`, { quiet: true })).json.task.channels).toEqual(['push']);
    expect((await o.patch(`/tasks/${id}`, {})).status).toBe(400);
  });

  it('TB12 finish with lines ticked; stop; recent; pick it up again', async () => {
    const id = (await start(o)).task.id;
    await o.post(`/tasks/${id}/checkin`, { mood: 'steady' });
    const f = await o.post(`/tasks/${id}/finish`, { ticked: [0, 2] });
    expect(f.json.task).toMatchObject({ state: 'ended', outcome: 'finished', doneTicked: [0, 2], openFire: null, summary: { checkins: 1, moods: '👍', doneCheck: { ticked: 2, total: 3 } } });
    expect(f.json.said).toMatch(/Clean the garage/);
    expect(await openFire(id)).toBeNull();
    expect((await o.post(`/tasks/${id}/stop`)).json.error).toBe('ended');
    const id2 = (await start(o, { title: 'Office' })).task.id;
    const st = await o.post(`/tasks/${id2}/stop`);
    expect(st.json.task).toMatchObject({ outcome: 'stopped' });
    const list = (await o.get('/tasks')).json;
    expect(list.active).toBeNull();
    expect(list.recent.slice(0, 2).map((t: any) => t.id)).toEqual([id2, id]);
    expect(list.defaults).toMatchObject({ intervalMin: 15, channels: ['push', 'house'] });
    expect((await o.post(`/tasks/${id}/again`)).json.error).toBe('not_stopped');
    const again = await o.post(`/tasks/${id2}/again`);
    expect(again.status).toBe(201);
    expect(again.json.task).toMatchObject({ title: 'Office', state: 'working' });
  });
});

describe('TB13 check-photo', () => {
  const jpeg = () => { const u = new Uint8Array(1024); u.set([0xff, 0xd8, 0xff]); return u; };
  it('the image before a prompt naming each line; one read counted; nothing kept', async () => {
    const id = (await start(o)).task.id;
    const heard: any[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(input, init);
      if (new URL(req.url).host !== 'api.anthropic.com') throw new Error(`no fake for ${req.url}`);
      heard.push(await req.json());
      return new Response(JSON.stringify(claudeMessage({ lines: [{ n: 1, looks: 'yes' }, { n: 2, looks: 'no' }, { n: 3, looks: 'unsure' }], note: 'Big progress!' })),
        { headers: { 'content-type': 'application/json' } });
    });
    const res = await worker.fetch(new Request(`${BASE}/tasks/${id}/check-photo`, {
      method: 'POST', headers: { 'content-type': 'image/jpeg', cookie: o.cookie }, body: jpeg(),
    }), keyedEnv(), createExecutionContext());
    const json = await res.json<any>();
    expect(res.status, JSON.stringify(json)).toBe(200);
    expect(json).toEqual({ lines: [{ text: 'Floor clear', looks: 'yes' }, { text: 'Bikes on hooks', looks: 'no' }, { text: 'Trash out', looks: 'unsure' }], note: 'Big progress!' });
    const content = heard[0].messages[0].content;
    expect(content[0].type).toBe('image');
    expect(content[1].text).toContain('1. Floor clear\n2. Bikes on hooks\n3. Trash out');
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM photo_reads').first<any>()).n).toBe(1);
    const none = (await start(b, { doneLooks: [] })).task.id;
    const r2 = await worker.fetch(new Request(`${BASE}/tasks/${none}/check-photo`, {
      method: 'POST', headers: { 'content-type': 'image/jpeg', cookie: b.cookie }, body: jpeg(),
    }), keyedEnv(), createExecutionContext());
    expect(r2.status).toBe(400);
  });
});
