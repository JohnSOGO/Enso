// SPEC §7B.9 acceptance IO3–IO12 through the real Worker: adding IOUs, whoever it costs agrees, payments, who sees,
// payback plans and their phone-only ping (not a founder ping), and a plan ending at $0.
import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { Client, member, owner, tickAt } from './helpers';
import { PAYBACK_TITLE } from '../src/shared/ious';
import { localToUtc } from '../src/shared/time';
import { opsPingsAfter, opsPingsSince } from '../src/worker/deliveries';

let o: Client, sam: Client, mom: Client, kai: Client, S: string, M: string, momName: string, tz: string;
beforeAll(async () => {
  o = await owner();
  ({ client: sam, id: S } = await member(o));
  ({ client: mom, id: M } = await member(o));
  ({ client: kai } = await member(o));
  momName = (await mom.get('/me')).json.displayName;
  tz = (await env.DB.prepare('SELECT timezone FROM settings WHERE id = 1').first<{ timezone: string }>())!.timezone;
});

const pairOf = async (c: Client, by: string, to: string) => (await c.get('/ious')).json.pairs.find((p: any) => p.owedBy === by && p.owedTo === to);

describe('§7B.9 family IOUs', () => {
  it('IO3 + IO4 the one who owes counts at once; the one owed waits for OK', async () => {
    const r = await sam.post('/ious', { owedBy: S, owedTo: M, amount: '1,200', note: ' phone ' });
    expect(r.status, JSON.stringify(r.json)).toBe(201);
    expect(r.json.pairs).toMatchObject([{ owedCents: 120000, items: [{ cents: 120000, note: 'phone', paidCents: 0 }] }]);
    const w = (await mom.post('/ious', { owedBy: S, owedTo: M, amount: 300, note: 'tickets' })).json.pairs[0];
    expect(w.owedCents).toBe(120000);
    const id = w.waiting.ious[0].id;
    expect((await mom.post(`/ious/${id}/ok`)).status).toBe(403);
    expect((await sam.post(`/ious/${id}/ok`)).json.owedCents).toBe(150000);
    expect((await sam.post(`/ious/${id}/ok`)).status).toBe(409);
  });

  it('IO5 + IO6 + IO7 payments: the payer waits for Got it, never more than owed, no letting go your own', async () => {
    const r = await sam.post('/iou-payments', { owedBy: S, owedTo: M, amount: 100, how: 'paid' });
    expect(r.status).toBe(201);
    expect(r.json.owedCents).toBe(150000);
    const id = r.json.waiting.payments[0].id;
    expect((await sam.post('/iou-payments', { owedBy: S, owedTo: M, amount: 1500, how: 'paid' })).status).toBe(409);
    expect((await sam.post('/iou-payments', { owedBy: S, owedTo: M, amount: 1, how: 'let_go' })).status).toBe(403);
    const ok = await mom.post(`/iou-payments/${id}/ok`);
    expect(ok.json.owedCents).toBe(140000);
    expect(ok.json.items[0].paidCents).toBe(10000);
  });

  it('IO8 + IO9 who sees; the other direction is apart', async () => {
    await mom.post('/ious', { owedBy: M, owedTo: S, amount: 40 });
    expect((await kai.get('/ious')).json.pairs).toEqual([]);
    expect((await kai.post('/ious', { owedBy: S, owedTo: M, amount: 5 })).status).toBe(403);
    expect((await pairOf(o, S, M)).owedCents).toBe(140000);
    expect((await pairOf(sam, M, S)).owedCents).toBe(4000);
  });

  it('IO10 + IO11 + IO12 a weekly plan pings at 09:00 on its day, once, phone only; it ends at $0', async () => {
    const p = await sam.post('/iou-plans', { owedBy: S, owedTo: M, amount: 100, every: 'week', startDate: '2026-10-23' });
    expect(p.status, JSON.stringify(p.json)).toBe(201);
    const planId = p.json.plan.id;
    expect(p.json.plan).toMatchObject({ centsEach: 10000, nextDue: '2026-10-23' });
    const at = (t: string) => localToUtc('2026-10-23', t, tz);
    const pings = async () => (await env.DB.prepare('SELECT member_id, channel, title, message FROM deliveries WHERE iou_plan_id = ?').bind(planId).all()).results;
    await tickAt(o, at('08:59'));
    expect(await pings()).toEqual([]);
    await tickAt(o, at('09:00'));
    expect(await pings()).toEqual([{ member_id: S, channel: 'push', title: PAYBACK_TITLE, message: `Pay ${momName} $100.00 today. $1,400.00 owed in all.` }]);
    await tickAt(o, at('10:00'));
    expect(await pings()).toHaveLength(1);
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM deliveries WHERE channel != ? AND created_at >= ?').bind('push', at('08:00')).first<{ n: number }>())!.n).toBe(0);
    expect(await opsPingsSince(env.DB, at('00:00'))).toBe(0);
    expect(await opsPingsAfter(env.DB, null, at('00:00'), 50)).toEqual([]);

    expect((await mom.post('/iou-payments', { owedBy: S, owedTo: M, amount: '1,400', how: 'let_go' })).json).toBeNull();
    expect((await env.DB.prepare('SELECT ended_at FROM iou_plans WHERE id = ?').bind(planId).first<{ ended_at: string | null }>())!.ended_at).not.toBeNull();
    await tickAt(o, localToUtc('2026-10-30', '09:00', tz));
    expect(await pings()).toHaveLength(1);
    expect(await pairOf(sam, S, M)).toBeUndefined();
    expect((await sam.post('/iou-plans', { owedBy: S, owedTo: M, amount: 1, every: 'week', startDate: '2026-10-23' })).status).toBe(409);
  });

  it('deleting: a waiting row by who made it; an OK\'d one by an admin, not while payments need it', async () => {
    const a = (await mom.post('/ious', { owedBy: M, owedTo: S, amount: 10 })).json.pairs[0]; // the one who owes: at once
    const item = a.items.find((i: any) => i.cents === 1000);
    expect((await mom.del(`/ious/${item.id}`)).status).toBe(403);
    const w = (await sam.post('/ious', { owedBy: M, owedTo: S, amount: 7 })).json.pairs[0];
    expect((await sam.del(`/ious/${w.waiting.ious[0].id}`)).status).toBe(204);
    const paid = await sam.post('/iou-payments', { owedBy: M, owedTo: S, amount: 45, how: 'paid' });
    expect(paid.json.owedCents).toBe(500);
    expect((await o.del(`/ious/${item.id}`)).status).toBe(409);
    const first = paid.json.items[0];
    expect((await o.del(`/ious/${first.id}`)).status).toBe(409);
  });

  it('IO13 + IO14 split the bill: the other owes half; off the tab it lowers what the payer owes instead', async () => {
    const { client: ann, id: A } = await member(o);
    const { client: bo, id: B } = await member(o);
    const half = (await ann.post('/ious', { owedBy: B, owedTo: A, amount: '80.01', note: 'Dinner', split: true })).json.pairs[0];
    expect(half.waiting.ious[0]).toMatchObject({ cents: 4000, note: 'Dinner' }); // Bo OKs what costs him
    await bo.post(`/ious/${half.waiting.ious[0].id}/ok`);
    await ann.post('/ious', { owedBy: A, owedTo: B, amount: 1000, note: 'phone' }); // Ann owes Bo $1,000 at once
    const r = await ann.post('/ious', { owedBy: B, owedTo: A, amount: 100, note: 'Pizza', split: true, offTab: true });
    expect(r.status, JSON.stringify(r.json)).toBe(201);
    const back = r.json.pairs.find((p: any) => p.owedBy === A);
    expect(back.waiting.payments).toMatchObject([{ cents: 5000, how: 'tab', note: 'Pizza' }]); // Bo taps Got it
    expect(r.json.pairs.find((p: any) => p.owedBy === B).owedCents).toBe(4000); // no new IOU for Bo
    expect((await bo.post(`/iou-payments/${back.waiting.payments[0].id}/ok`)).json.owedCents).toBe(95000);
    // Recorded by Bo himself it counts at once; past the tab the rest is an IOU.
    const big = (await bo.post('/ious', { owedBy: B, owedTo: A, amount: 9600, offTab: true })).json.pairs;
    expect(big.find((p: any) => p.owedBy === A)).toBeUndefined();
    expect(big.find((p: any) => p.owedBy === B).owedCents).toBe(4000 + 960000 - 95000);
    expect((await bo.post('/iou-payments', { owedBy: A, owedTo: B, amount: 1, how: 'tab' })).status).toBe(400);
  });

  it('IO15 Status shows a payback ping only to the one who got it', async () => {
    const plan = (await env.DB.prepare('SELECT id FROM iou_plans WHERE owed_by = ? LIMIT 1').bind(S).first<{ id: string }>())!.id;
    const now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO deliveries (id, alert_number, channel, member_id, message, title, iou_plan_id, status, created_at, updated_at)
      VALUES ('dlv_io15', 1, 'push', ?, 'Pay Mom $1.00 today.', ?, ?, 'sent', ?, ?)`).bind(S, PAYBACK_TITLE, plan, now, now).run();
    const has = async (c: Client) => (await c.get('/status')).json.recentDeliveries.some((d: any) => d.id === 'dlv_io15');
    expect(await has(sam)).toBe(true);
    expect(await has(kai)).toBe(false);
    expect(await has(o)).toBe(false);
  });
});
