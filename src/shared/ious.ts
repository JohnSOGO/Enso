// SPEC §7B.9 — family IOUs: who owes whom how much (whole US cents), the amounts as typed and shown, whoever it costs
// agrees, the queue in each direction (never netted), payback plans (their due dates, behind, the ping), who may see
// or do what, and the wire types. Ensō records money; it never moves it. Pure; imports only vocab, time and recurrence.
import { IOU_PAY_HOW, IOU_PLAN_EVERY, isOneOf, type IouPayHow, type IouPlanEvery } from './vocab';
import { occurrences, type Recurrence } from './recurrence';
import { addDays, isDate, localToUtc } from './time';

export const IOU_NOTE_MAX = 120;
/** ⚑ Q356 — no amount limit: this only guards a slip of the thumb and keeps whole cents exact. */
export const IOU_CENTS_MAX = 9_999_999_999;
export const PLAN_PING_TIME = '09:00';
export const PAYBACK_TITLE = '💵 Payback due';

/** An `ious` row (§4.2zzf). */
export interface IouRow {
  id: string; owed_by: string; owed_to: string; cents: number; note: string | null; created_by: string;
  ok_at: string | null; ok_by: string | null; deleted_at: string | null; created_at: string;
}
/** An `iou_payments` row. */
export interface IouPaymentRow {
  id: string; owed_by: string; owed_to: string; cents: number; how: IouPayHow; note: string | null; created_by: string;
  ok_at: string | null; ok_by: string | null; deleted_at: string | null; created_at: string;
}
/** An `iou_plans` row. */
export interface IouPlanRow {
  id: string; owed_by: string; owed_to: string; cents_each: number; every: IouPlanEvery; start_date: string;
  created_by: string; ended_at: string | null; created_at: string;
}

export interface IouItem { id: string; cents: number; note: string | null; createdBy: string; createdAt: string; okAt: string | null; paidCents: number }
export interface IouPayment { id: string; cents: number; how: IouPayHow; note: string | null; createdBy: string; createdAt: string; okAt: string | null }
export interface IouPlan { id: string; centsEach: number; every: IouPlanEvery; startDate: string; nextDue: string | null; behindCents: number }
/** One direction: `owedBy` owes `owedTo`. */
export interface IouPair {
  owedBy: string; owedTo: string; owedCents: number; items: IouItem[];
  waiting: { ious: IouItem[]; payments: IouPayment[] }; payments: IouPayment[]; plan: IouPlan | null;
}

export interface Direction { owedBy: string; owedTo: string }
export interface IouViewer { id: string; admin: boolean }
export type IouKind = 'iou' | 'payment';
type Okable = Pick<IouRow, 'owed_by' | 'owed_to' | 'created_by' | 'ok_at'>;

export const dirOf = (r: Pick<IouRow, 'owed_by' | 'owed_to'>): Direction => ({ owedBy: r.owed_by, owedTo: r.owed_to });
/** The other way: the one owed owes the one who owes. */
export const reverse = (d: Direction): Direction => ({ owedBy: d.owedTo, owedTo: d.owedBy });

/** Dollars as typed ("1,500.50", "$20", 20) → whole cents, or a message. */
export function parseAmount(v: unknown): number | string {
  const t = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.replace(/[\s,$]/g, '') : '';
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(t);
  if (!m) return 'amount must be dollars, like 20 or 1,500.50.';
  const cents = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  if (cents <= 0) return 'amount must be more than $0.';
  if (cents > IOU_CENTS_MAX) return `amount can be at most ${centsText(IOU_CENTS_MAX)}.`;
  return cents;
}

/** Whole cents → "$1,500.50"; the only money formatter. */
export function centsText(cents: number): string {
  const dollars = String(Math.floor(cents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `$${dollars}.${String(cents % 100).padStart(2, '0')}`;
}

function parseDirection(b: Record<string, unknown>, activeIds: readonly string[]): Direction | string {
  if (typeof b.owedBy !== 'string' || !activeIds.includes(b.owedBy)) return 'owedBy must be an active member.';
  if (typeof b.owedTo !== 'string' || !activeIds.includes(b.owedTo)) return 'owedTo must be an active member.';
  if (b.owedBy === b.owedTo) return 'Someone can\'t owe themselves.';
  return { owedBy: b.owedBy, owedTo: b.owedTo };
}

/** The direction and the amount, or a message naming the field. */
function parseBase(b: Record<string, unknown>, activeIds: readonly string[]): (Direction & { cents: number }) | string {
  const d = parseDirection(b, activeIds);
  if (typeof d === 'string') return d;
  const cents = parseAmount(b.amount);
  return typeof cents === 'string' ? cents : { ...d, cents };
}

/** An IOU: the amount, or with `split` the bill's total (the one who owes owes half, the odd cent stays with the payer);
 *  `offTab` takes it off the payer's tab with the one who owes, as far as that tab goes (⚑ Q357, Q358). */
export function parseIouInput(b: Record<string, unknown>, activeIds: readonly string[]): (Direction & { cents: number; note: string | null; offTab: boolean }) | string {
  const base = parseBase(b, activeIds);
  if (typeof base === 'string') return base;
  if (b.note != null && typeof b.note !== 'string') return 'note must be text.';
  const note = typeof b.note === 'string' ? b.note.trim() : '';
  if (note.length > IOU_NOTE_MAX) return `note can be at most ${IOU_NOTE_MAX} characters.`;
  if ((b.split != null && typeof b.split !== 'boolean') || (b.offTab != null && typeof b.offTab !== 'boolean')) return 'split and offTab must be true or false.';
  const cents = b.split ? Math.floor(base.cents / 2) : base.cents;
  if (cents <= 0) return 'Half of that is less than a cent.';
  return { ...base, cents, note: note || null, offTab: b.offTab === true };
}

/** How much of an IOU comes off the payer's tab (what they owe the other way, less payments waiting there), and what is
 *  left over as an IOU. */
export const tabSplit = (cents: number, tabRoom: number): { tab: number; iou: number } => {
  const tab = Math.min(cents, Math.max(0, tabRoom));
  return { tab, iou: cents - tab };
};

export function parsePaymentInput(b: Record<string, unknown>, activeIds: readonly string[]): (Direction & { cents: number; how: IouPayHow }) | string {
  const base = parseBase(b, activeIds);
  if (typeof base === 'string') return base;
  if (!isOneOf(IOU_PAY_HOW, b.how)) return `how must be one of: ${IOU_PAY_HOW.join(', ')}.`;
  if (b.how === 'tab') return 'Taking off a tab comes from ＋ IOU (offTab).';
  return { ...base, how: b.how };
}

export function parsePlanInput(b: Record<string, unknown>, activeIds: readonly string[]): (Direction & { cents: number; every: IouPlanEvery; startDate: string }) | string {
  const base = parseBase(b, activeIds);
  if (typeof base === 'string') return base;
  if (!isOneOf(IOU_PLAN_EVERY, b.every)) return `every must be one of: ${IOU_PLAN_EVERY.join(', ')}.`;
  if (!isDate(b.startDate)) return 'startDate must be a date (YYYY-MM-DD).';
  if (b.every === 'month' && Number(b.startDate.slice(8)) > 28) return 'A monthly plan starts on the 1st to the 28th, so no month is skipped.';
  return { ...base, every: b.every, startDate: b.startDate };
}

const isParty = (d: Direction, id: string) => id === d.owedBy || id === d.owedTo;

/** Who sees a direction: its two people and every admin. */
export const canSee = (d: Direction, v: IouViewer): boolean => v.admin || isParty(d, v.id);

/** Why I may not add an IOU, payment or plan in this direction, or null. */
export const madeError = (d: Direction, v: IouViewer): string | null =>
  canSee(d, v) ? null : 'Only the two of them or an admin can do that.';

/** The one who owes can't let their own debt go. */
export const letGoError = (d: Direction, v: IouViewer): string | null =>
  v.id === d.owedBy ? 'You can\'t let your own debt go.' : null;

/** Whose OK a row needs: an IOU costs the one who owes, a payment the one owed. */
export const waitsOn = (kind: IouKind, d: Direction): string => (kind === 'iou' ? d.owedBy : d.owedTo);

/** Whoever it costs agrees (⚑ Q351): a row counts at once unless the other one of the two made it. */
export const countsAtOnce = (kind: IouKind, d: Direction, creatorId: string): boolean =>
  creatorId !== (kind === 'iou' ? d.owedTo : d.owedBy);

/** Why I may not OK this row, with its status, or null. */
export function okError(kind: IouKind, r: Okable, viewerId: string): { status: 403 | 409; text: string } | null {
  if (r.ok_at) return { status: 409, text: 'That is already OK\'d.' };
  if (viewerId !== waitsOn(kind, dirOf(r))) return { status: 403, text: 'Only the one it waits on can OK it.' };
  return null;
}

/** Why I may not delete this row (⚑ Q355), or null: waiting → who made it, the one it waits on, or an admin; OK'd → an admin. */
export function deleteError(kind: IouKind, r: Okable, v: IouViewer): string | null {
  if (v.admin) return null;
  if (r.ok_at) return 'Only an admin can delete it once it is OK\'d.';
  if (v.id === r.created_by || v.id === waitsOn(kind, dirOf(r))) return null;
  return 'Only the one who added it, the one it waits on, or an admin can delete it.';
}

type Counted = { cents: number; ok_at: string | null; deleted_at: string | null };
const counted = <T extends Counted>(rows: readonly T[]) => rows.filter((r) => r.ok_at && !r.deleted_at);
const sum = (rows: readonly { cents: number }[]) => rows.reduce((n, r) => n + r.cents, 0);
const byAge = <T extends { created_at: string; id: string }>(a: T, b: T) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);

/** One direction's OK'd IOUs minus its OK'd payments; below 0 only when a delete would break the records. */
export const rawOwed = (ious: readonly Counted[], payments: readonly Counted[]): number => sum(counted(ious)) - sum(counted(payments));
export const owedCents = (ious: readonly Counted[], payments: readonly Counted[]): number => Math.max(0, rawOwed(ious, payments));

/** The money still waiting to be paid back in one direction: payments not yet OK'd. */
export const waitingPaid = (payments: readonly IouPaymentRow[]): number => sum(payments.filter((p) => !p.ok_at && !p.deleted_at));

const itemOf = (r: IouRow, paidCents: number): IouItem =>
  ({ id: r.id, cents: r.cents, note: r.note, createdBy: r.created_by, createdAt: r.created_at, okAt: r.ok_at, paidCents });
const paymentOf = (r: IouPaymentRow): IouPayment =>
  ({ id: r.id, cents: r.cents, how: r.how, note: r.note, createdBy: r.created_by, createdAt: r.created_at, okAt: r.ok_at });

/** One direction's OK'd IOUs oldest first, payments paying them off oldest first. */
export function queueOf(ious: readonly IouRow[], payments: readonly IouPaymentRow[]): IouItem[] {
  let left = sum(counted(payments));
  return counted(ious).sort(byAge).map((r) => { const paid = Math.min(r.cents, left); left -= paid; return itemOf(r, paid); });
}

const RECURRENCE: Record<IouPlanEvery, Recurrence> = {
  week: { freq: 'WEEKLY' }, '2weeks': { freq: 'WEEKLY', interval: 2 }, month: { freq: 'MONTHLY' },
};
type PlanFacts = Pick<IouPlanRow, 'every' | 'start_date'>;

/** A plan's due dates in [from, to], through the one recurrence format (§4.3). */
export const planDates = (p: PlanFacts, from: string, to: string): string[] =>
  occurrences({ start_date: p.start_date, recurrence: RECURRENCE[p.every], exdates: [] }, from, to);

export const nextDue = (p: PlanFacts, today: string): string | null => planDates(p, today, addDays(today, 62))[0] ?? null;

/** Due on the dates before today, minus the payments OK'd since the start; never below 0 nor above what is owed. */
export function behindCents(p: PlanFacts & Pick<IouPlanRow, 'cents_each'>, today: string, tz: string, owed: number, payments: readonly IouPaymentRow[]): number {
  const before = addDays(today, -1);
  const due = before < p.start_date ? 0 : planDates(p, p.start_date, before).length * p.cents_each;
  const since = localToUtc(p.start_date, '00:00', tz);
  const paid = sum(counted(payments).filter((x) => x.created_at >= since));
  return Math.max(0, Math.min(due - paid, owed));
}

/** A live plan with something owed, due today, at or after PLAN_PING_TIME. */
export const pingDue = (p: PlanFacts & Pick<IouPlanRow, 'ended_at'>, today: string, localTime: string, owed: number): boolean =>
  !p.ended_at && owed > 0 && localTime >= PLAN_PING_TIME && planDates(p, today, today).length > 0;

export const paybackMessage = (toName: string, dueCents: number, owed: number) =>
  `Pay ${toName} ${centsText(dueCents)} today. ${centsText(owed)} owed in all.`;

/** The directions the viewer may see with something owed, waiting or a live plan, most owed first. */
export function pairsOf(ious: readonly IouRow[], payments: readonly IouPaymentRow[], plans: readonly IouPlanRow[], v: IouViewer, today: string, tz: string): IouPair[] {
  const keys = new Map<string, Direction>();
  for (const r of [...ious, ...payments, ...plans]) if (canSee(dirOf(r), v)) keys.set(`${r.owed_by}|${r.owed_to}`, dirOf(r));
  const out: IouPair[] = [];
  for (const d of keys.values()) {
    const mine = <T extends Pick<IouRow, 'owed_by' | 'owed_to'>>(rows: readonly T[]) => rows.filter((r) => r.owed_by === d.owedBy && r.owed_to === d.owedTo);
    const is = mine(ious).filter((r) => !r.deleted_at), ps = mine(payments).filter((r) => !r.deleted_at);
    const owed = owedCents(is, ps);
    const p = mine(plans).find((x) => !x.ended_at);
    const waiting = { ious: is.filter((r) => !r.ok_at).sort(byAge).map((r) => itemOf(r, 0)), payments: ps.filter((r) => !r.ok_at).sort(byAge).map(paymentOf) };
    if (owed === 0 && !waiting.ious.length && !waiting.payments.length && !p) continue;
    out.push({
      ...d, owedCents: owed, items: queueOf(is, ps), waiting, payments: counted(ps).sort(byAge).reverse().map(paymentOf),
      plan: p ? { id: p.id, centsEach: p.cents_each, every: p.every, startDate: p.start_date, nextDue: nextDue(p, today), behindCents: behindCents(p, today, tz, owed, ps) } : null,
    });
  }
  return out.sort((a, b) => b.owedCents - a.owedCents || a.owedBy.localeCompare(b.owedBy) || a.owedTo.localeCompare(b.owedTo));
}
