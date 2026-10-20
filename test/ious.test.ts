// SPEC §7B.9 — family IOUs, the pure rules (IO1–IO2 and the rules behind IO3–IO12; the API rows are ious-api.test.ts).
import { describe, expect, it } from 'vitest';
import {
  IOU_CENTS_MAX, behindCents, centsText, countsAtOnce, deleteError, okError, owedCents, pairsOf, parseAmount, parsePlanInput,
  pingDue, planDates, queueOf, type IouPaymentRow, type IouPlanRow, type IouRow,
} from '../src/shared/ious';

const T = '2026-10-20T16:00:00.000Z';
const iou = (id: string, cents: number, x: Partial<IouRow> = {}): IouRow => ({
  id, owed_by: 'sam', owed_to: 'mom', cents, note: null, created_by: 'sam', ok_at: T, ok_by: 'sam', deleted_at: null, created_at: T, ...x,
});
const pay = (id: string, cents: number, x: Partial<IouPaymentRow> = {}): IouPaymentRow => ({
  id, owed_by: 'sam', owed_to: 'mom', cents, how: 'paid', note: null, created_by: 'mom', ok_at: T, ok_by: 'mom', deleted_at: null, created_at: T, ...x,
});
const plan = (x: Partial<IouPlanRow> = {}): IouPlanRow => ({
  id: 'ipl_1', owed_by: 'sam', owed_to: 'mom', cents_each: 10000, every: 'week', start_date: '2026-10-23', created_by: 'sam', ended_at: null, created_at: T, ...x,
});

describe('§7B.9 IOU rules', () => {
  it('IO1 parseAmount', () => {
    expect(parseAmount('1,500.50')).toBe(150050);
    expect(parseAmount('$20')).toBe(2000);
    expect(parseAmount(20)).toBe(2000);
    expect(parseAmount('0.5')).toBe(50);
    for (const bad of ['0', '1.234', 'abc', '100000000', -5, null]) expect(typeof parseAmount(bad), String(bad)).toBe('string');
    expect(parseAmount('99,999,999.99')).toBe(IOU_CENTS_MAX);
  });
  it('IO2 centsText', () => {
    expect(centsText(150050)).toBe('$1,500.50');
    expect(centsText(5)).toBe('$0.05');
    expect(centsText(123456789)).toBe('$1,234,567.89');
  });
  it('whoever it costs agrees', () => {
    const d = { owedBy: 'sam', owedTo: 'mom' };
    expect(countsAtOnce('iou', d, 'sam')).toBe(true);
    expect(countsAtOnce('iou', d, 'mom')).toBe(false);
    expect(countsAtOnce('iou', d, 'dad')).toBe(true);
    expect(countsAtOnce('payment', d, 'mom')).toBe(true);
    expect(countsAtOnce('payment', d, 'sam')).toBe(false);
    const waiting = iou('a', 100, { created_by: 'mom', ok_at: null });
    expect(okError('iou', waiting, 'sam')).toBeNull();
    expect(okError('iou', waiting, 'mom')?.status).toBe(403);
    expect(okError('iou', iou('b', 100), 'sam')?.status).toBe(409);
    expect(deleteError('iou', waiting, { id: 'sam', admin: false })).toBeNull();
    expect(deleteError('iou', iou('b', 100), { id: 'mom', admin: false })).not.toBeNull();
    expect(deleteError('iou', iou('b', 100), { id: 'dad', admin: true })).toBeNull();
  });
  it('the queue pays the oldest first; waiting rows count for nothing', () => {
    const ious = [iou('b', 30000, { created_at: '2026-10-21T00:00:00.000Z' }), iou('a', 120000), iou('w', 500, { ok_at: null })];
    const payments = [pay('p', 130000), pay('q', 999, { ok_at: null })];
    expect(owedCents(ious, payments)).toBe(20000);
    expect(queueOf(ious, payments).map((i) => [i.id, i.paidCents])).toEqual([['a', 120000], ['b', 10000]]);
  });
  it('IO8 + IO9 pairs: the two and admins see a direction; directions are not netted', () => {
    const rows = [iou('a', 1000), iou('b', 400, { owed_by: 'mom', owed_to: 'sam', created_by: 'mom' })];
    const pairs = pairsOf(rows, [], [], { id: 'sam', admin: false }, '2026-10-20', 'UTC');
    expect(pairs.map((p) => [p.owedBy, p.owedTo, p.owedCents])).toEqual([['sam', 'mom', 1000], ['mom', 'sam', 400]]);
    expect(pairsOf(rows, [], [], { id: 'kai', admin: false }, '2026-10-20', 'UTC')).toEqual([]);
    expect(pairsOf(rows, [], [], { id: 'dad', admin: true }, '2026-10-20', 'UTC')).toHaveLength(2);
  });
  it('plans: due dates, a monthly start after the 28th refused, behind, the ping', () => {
    expect(planDates(plan(), '2026-10-20', '2026-11-07')).toEqual(['2026-10-23', '2026-10-30', '2026-11-06']);
    expect(planDates(plan({ every: '2weeks' }), '2026-10-20', '2026-11-07')).toEqual(['2026-10-23', '2026-11-06']);
    expect(typeof parsePlanInput({ owedBy: 'sam', owedTo: 'mom', amount: 10, every: 'month', startDate: '2026-10-29' }, ['sam', 'mom'])).toBe('string');
    const payments = [pay('p', 5000, { created_at: '2026-10-24T00:00:00.000Z' }), pay('old', 7000, { created_at: '2026-10-01T00:00:00.000Z' })];
    expect(behindCents(plan(), '2026-10-31', 'UTC', 100000, payments)).toBe(15000); // due Oct 23 and 30, paid 50 since
    expect(behindCents(plan(), '2026-10-31', 'UTC', 3000, payments)).toBe(3000);
    expect(behindCents(plan(), '2026-10-23', 'UTC', 100000, [])).toBe(0);
    expect(pingDue(plan(), '2026-10-23', '08:59', 100)).toBe(false);
    expect(pingDue(plan(), '2026-10-23', '09:00', 100)).toBe(true);
    expect(pingDue(plan(), '2026-10-24', '09:00', 100)).toBe(false);
    expect(pingDue(plan(), '2026-10-23', '09:00', 0)).toBe(false);
  });
});
