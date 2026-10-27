// SPEC §7B.9 acceptance IO3–IO18 through the real Worker: adding IOUs, whoever it costs agrees, payments, who sees,
// payback plans and their phone-only ping (not a founder ping), a plan ending at $0, declining / asking again, and the
// one push to the one a row waits on.
import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { Client, member, owner, tickAt } from './helpers';
import { DECLINED_TITLE, PAYBACK_TITLE, WAITING_TITLE } from '../src/shared/ious';
import { addDays, localToUtc, utcToLocal } from '../src/shared/time';
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
    const day = addDays(utcToLocal(new Date().toISOString(), tz).date, 3); // a plan day ahead of the real clock
    const p = await sam.post('/iou-plans', { owedBy: S, owedTo: M, amount: 100, every: 'week', startDate: day });
    expect(p.status, JSON.stringify(p.json)).toBe(201);
    const planId = p.json.plan.id;
    expect(p.json.plan).toMatchObject({ centsEach: 10000, nextDue: day });
    const at = (t: string) => localToUtc(day, t, tz);
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
    await tickAt(o, localToUtc(addDays(day, 7), '09:00', tz));
    expect(await pings()).toHaveLength(1);
    expect(await pairOf(sam, S, M)).toBeUndefined();
    expect((await sam.post('/iou-plans', { owedBy: S, owedTo: M, amount: 1, every: 'week', startDate: day })).status).toBe(409);
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

  it('IO15b Status shows a declined notice only to the one who got it; it is never a founder ping', async () => {
    const row = (await env.DB.prepare('SELECT id FROM ious LIMIT 1').first<{ id: string }>())!.id;
    const before = new Date(Date.now() - 1000).toISOString(), now = new Date().toISOString();
    const pings = await opsPingsSince(env.DB, before);
    await env.DB.prepare(`INSERT INTO deliveries (id, alert_number, channel, member_id, message, title, iou_row_id, status, created_at, updated_at)
      VALUES ('dlv_io15b', 1, 'push', ?, 'Sam declined your $1.00 IOU.', ?, ?, 'sent', ?, ?)`).bind(M, DECLINED_TITLE, row, now, now).run();
    const has = async (c: Client) => (await c.get('/status')).json.recentDeliveries.some((d: any) => d.id === 'dlv_io15b');
    expect(await has(mom)).toBe(true);
    expect(await has(kai)).toBe(false);
    expect(await has(sam)).toBe(false);
    expect(await opsPingsSince(env.DB, before)).toBe(pings);
  });

  it('IO16 + IO17 + IO18 a declined IOU or payment is kept, its maker told once, and can be asked again', async () => {
    const { client: lee, id: L } = await member(o);
    const { client: ma, id: A } = await member(o);
    const leeName = (await lee.get('/me')).json.displayName, maName = (await ma.get('/me')).json.displayName;
    const pushes = async (to: string) => (await env.DB.prepare('SELECT title, message, iou_row_id FROM deliveries WHERE member_id = ? AND iou_row_id IS NOT NULL').bind(to).all()).results;
    const w = (await ma.post('/ious', { owedBy: L, owedTo: A, amount: 300, note: 'tickets' })).json.pairs[0].waiting.ious[0];
    expect((await ma.post(`/ious/${w.id}/decline`)).status).toBe(403);
    expect((await lee.del(`/ious/${w.id}`)).status).toBe(403);
    const d = await lee.post(`/ious/${w.id}/decline`);
    expect(d.status, JSON.stringify(d.json)).toBe(200);
    expect(d.json).toMatchObject({ owedCents: 0, waiting: { ious: [] }, declined: { ious: [{ id: w.id, declinedBy: L }] } });
    expect(await pushes(A)).toEqual([{ title: DECLINED_TITLE, message: `${leeName} declined your $300.00 IOU · tickets.`, iou_row_id: w.id }]);
    expect((await opsPingsAfter(env.DB, null, '2000-01-01T00:00:00Z', 500)).some((x: any) => x.message?.includes('declined'))).toBe(false);
    expect((await lee.post(`/ious/${w.id}/decline`)).status).toBe(409);
    expect((await lee.post(`/ious/${w.id}/again`)).status).toBe(403);
    const again = await ma.post(`/ious/${w.id}/again`);
    expect(again.json).toMatchObject({ waiting: { ious: [{ id: w.id }] }, declined: { ious: [] } });
    expect(await pushes(A)).toHaveLength(1);
    expect((await pushes(L)).filter((x: any) => x.title === WAITING_TITLE.iou)).toHaveLength(2); // made, then asked again
    expect((await lee.post(`/ious/${w.id}/ok`)).json.owedCents).toBe(30000);
    // IO18 a payment: declined, then the rest paid, so asking again no longer fits.
    const p = (await lee.post('/iou-payments', { owedBy: L, owedTo: A, amount: 100, how: 'paid' })).json.waiting.payments[0];
    await ma.post(`/iou-payments/${p.id}/decline`);
    expect((await pushes(L)).find((x: any) => x.title === DECLINED_TITLE)).toMatchObject({ message: `${maName} declined your $100.00 payment.` });
    await ma.post('/iou-payments', { owedBy: L, owedTo: A, amount: 250, how: 'let_go' });
    const no = await lee.post(`/iou-payments/${p.id}/again`);
    expect([no.status, no.json.error]).toEqual([409, 'iou_too_much']);
    expect((await lee.del(`/iou-payments/${p.id}`)).status).toBe(204);
    expect((await pairOf(lee, L, A)).declined.payments).toEqual([]);
  });

  it('IO19 + IO20 a row waiting on someone pushes them once, phone only, private; one that counts at once pushes nobody', async () => {
    const { client: bo, id: B } = await member(o);
    const { client: cy, id: C } = await member(o);
    const boName = (await bo.get('/me')).json.displayName, cyName = (await cy.get('/me')).json.displayName;
    const asks = async (to: string) => (await env.DB.prepare('SELECT title, message, iou_row_id, channel FROM deliveries WHERE member_id = ? AND iou_row_id IS NOT NULL AND title IN (?, ?) ORDER BY created_at, id')
      .bind(to, WAITING_TITLE.iou, WAITING_TITLE.payment).all()).results;
    await bo.post('/ious', { owedBy: B, owedTo: C, amount: 50 }); // Bo owes: counts at once
    expect(await asks(C)).toEqual([]);
    const pay = (await bo.post('/iou-payments', { owedBy: B, owedTo: C, amount: 20, how: 'paid' })).json.waiting.payments[0];
    expect(await asks(C)).toEqual([{ title: WAITING_TITLE.payment, message: `${boName} paid you $20.00. Tap Got it or Decline.`, iou_row_id: pay.id, channel: 'push' }]);
    expect(await asks(B)).toEqual([]);
    await cy.post('/iou-payments', { owedBy: B, owedTo: C, amount: 5, how: 'let_go' }); // the one owed: at once
    await o.post('/ious', { owedBy: B, owedTo: C, amount: 1 }); // an admin who is neither: at once
    expect(await asks(C)).toHaveLength(1);
    expect(await asks(B)).toEqual([]);
    await bo.post('/ious', { owedBy: C, owedTo: B, amount: 0.5 }); // waits on Cy
    expect((await asks(C)).at(-1)).toMatchObject({ title: WAITING_TITLE.iou, message: `${boName} says you owe $0.50. Tap OK or Decline.` });
    const before = (await asks(B)).length;
    await cy.post('/ious', { owedBy: B, owedTo: C, amount: 30, note: 'pizza' }); // a plain IOU Cy adds waits on Bo
    expect(await asks(B)).toHaveLength(before + 1);
    expect((await asks(B)).at(-1)).toMatchObject({ message: `${cyName} says you owe $30.00 · pizza. Tap OK or Decline.` });
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM deliveries WHERE channel != 'push' AND message LIKE '%pizza%'").first<{ n: number }>())!.n).toBe(0);
    expect((await opsPingsAfter(env.DB, null, '2000-01-01T00:00:00Z', 500)).some((x: any) => x.message?.includes('Tap'))).toBe(false);
    expect((await kai.get('/status')).json.recentDeliveries.some((d: any) => d.message?.includes('Tap'))).toBe(false);
  });

  it('IO21 off the tab with the rest an IOU: one tap, one push', async () => {
    const { client: di, id: D } = await member(o);
    const { id: E } = await member(o);
    await di.post('/ious', { owedBy: D, owedTo: E, amount: 10 }); // Di owes Ed $10 (at once)
    const n = async () => (await env.DB.prepare('SELECT COUNT(*) AS n FROM deliveries WHERE member_id = ? AND iou_row_id IS NOT NULL').bind(E).first<{ n: number }>())!.n;
    // Di paid a $30 bill; Ed's $30 goes $10 off Di's tab and $20 as an IOU, both waiting on Ed.
    const r = await di.post('/ious', { owedBy: E, owedTo: D, amount: 30, offTab: true });
    expect(r.status, JSON.stringify(r.json)).toBe(201);
    expect(await n()).toBe(1);
  });
});
