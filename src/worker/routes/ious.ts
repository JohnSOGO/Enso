// SPEC §7B.9 — family IOUs: adding IOUs, paying back or letting go, OK / Got it (one push to the one a new or asked-again
// row waits on), declining (one push to the one who made it) and asking again, deleting, and payback plans. Every
// rule (amounts, who agrees, who sees, the queue, behind) is src/shared/ious.ts; this file validates and persists.
import { Hono, type Context } from 'hono';
import type { AppEnv } from '../env';
import {
  askAgainError, countsAtOnce, declineError, declinedMessage, DECLINED_TITLE, WAITING_TITLE, waitingMessage, waitsOn, deleteError, dirOf, reverse, tabSplit, letGoError, madeError, okError, owedCents, pairsOf, parseIouInput, parsePaymentInput,
  parsePlanInput, rawOwed, waitingPaid, canSee, centsText, type Direction, type IouKind, type IouPaymentRow, type IouPlanRow,
  type IouRow, type IouViewer,
} from '../../shared/ious';
import { isAdmin } from '../../shared/roles';
import { utcToLocal } from '../../shared/time';
import { activeMemberIds, all, first, householdTz, newId, nowIso } from '../db';
import { pushDelivery } from '../deliveries';
import { sendPushDeliveries } from '../push';
import { body, fail } from '../http';
import { requireMember } from '../session';

const TABLE: Record<IouKind, string> = { iou: 'ious', payment: 'iou_payments' };
const GONE = 'That no longer exists.';

const viewerOf = (c: Context<AppEnv>): IouViewer => { const m = c.get('member'); return { id: m.id, admin: isAdmin(m) }; };

/** The live rows, of one direction or of all. */
async function rowsOf(db: D1Database, d?: Direction) {
  const where = d ? ' AND owed_by = ? AND owed_to = ?' : '';
  const args = d ? [d.owedBy, d.owedTo] : [];
  const [ious, payments, plans] = await Promise.all([
    all<IouRow>(db, `SELECT * FROM ious WHERE deleted_at IS NULL${where}`, ...args),
    all<IouPaymentRow>(db, `SELECT * FROM iou_payments WHERE deleted_at IS NULL${where}`, ...args),
    all<IouPlanRow>(db, `SELECT * FROM iou_plans WHERE ended_at IS NULL${where}`, ...args),
  ]);
  return { ious, payments, plans };
}

async function pairsFor(c: Context<AppEnv>, d?: Direction) {
  const db = c.env.DB, tz = await householdTz(db);
  const r = await rowsOf(db, d);
  return pairsOf(r.ious, r.payments, r.plans, viewerOf(c), utcToLocal(nowIso(), tz).date, tz);
}

/** A write's answer: that direction's pair (null when nothing is left in it). */
const pairAnswer = async (c: Context<AppEnv>, d: Direction, status: 200 | 201 = 200) => c.json((await pairsFor(c, d))[0] ?? null, status);

/** Ends the direction's plan once nothing is owed there (§7B.9). */
async function endPlanIfPaid(db: D1Database, d: Direction): Promise<void> {
  const r = await rowsOf(db, d);
  if (owedCents(r.ious, r.payments) > 0) return;
  await db.prepare('UPDATE iou_plans SET ended_at = ? WHERE owed_by = ? AND owed_to = ? AND ended_at IS NULL').bind(nowIso(), d.owedBy, d.owedTo).run();
}

/** A live IOU or payment the viewer may see, or the 404 to send. */
async function loadRow(c: Context<AppEnv>, kind: IouKind): Promise<IouRow | IouPaymentRow | Response> {
  const r = await first<IouRow | IouPaymentRow>(c.env.DB, `SELECT * FROM ${TABLE[kind]} WHERE id = ? AND deleted_at IS NULL`, c.req.param('id')!);
  return r && canSee(dirOf(r), viewerOf(c)) ? r : fail(c, 404, 'not_found', GONE);
}

/** One private, phone-only push about one row (§7B.9: `iou_row_id`, so never a founder ping, the FunHouse or the house),
 *  sent only to an active member. */
async function pushOne(c: Context<AppEnv>, memberId: string, title: string, message: string, rowId: string, now: string): Promise<void> {
  if (!(await activeMemberIds(c.env.DB)).includes(memberId)) return;
  const push = pushDelivery(c.env.DB, { memberId, title, message, iouRowId: rowId }, now);
  await push.stmt.run();
  await sendPushDeliveries(c.env, [push.id], now);
}

/** ⚑ Q385 — the one a row now waits on is told once: "💵 OK?" / "💵 Got it?". */
const askOne = (c: Context<AppEnv>, kind: IouKind, row: { id: string; cents: number; how?: IouPaymentRow['how'] | null; note: string | null } & Direction, now: string) =>
  pushOne(c, waitsOn(kind, row), WAITING_TITLE[kind], waitingMessage(kind, c.get('member').display_name, row.cents, row.how ?? null, row.note), row.id, now);

export const ious = new Hono<AppEnv>();

ious.get('/ious', requireMember, async (c) => c.json({ pairs: await pairsFor(c) }));

ious.post('/ious', requireMember, async (c) => {
  const db = c.env.DB, v = viewerOf(c);
  const input = parseIouInput(await body(c), await activeMemberIds(db));
  if (typeof input === 'string') return fail(c, 400, 'invalid_input', input);
  const no = madeError(input, v);
  if (no) return fail(c, 403, 'forbidden', no);
  const now = nowIso(), back = reverse(input), at = (ok: boolean) => [ok ? now : null, ok ? v.id : null];
  const tab = input.offTab ? await rowsOf(db, back) : null;
  const part = tabSplit(input.cents, tab ? owedCents(tab.ious, tab.payments) - waitingPaid(tab.payments) : 0);
  const writes: D1PreparedStatement[] = [], asks: [IouKind, Parameters<typeof askOne>[2]][] = [];
  if (part.tab) {
    const id = newId('iop'), ok = countsAtOnce('payment', back, v.id);
    writes.push(db.prepare('INSERT INTO iou_payments (id, owed_by, owed_to, cents, how, note, created_by, ok_at, ok_by, created_at) VALUES (?, ?, ?, ?, \'tab\', ?, ?, ?, ?, ?)')
      .bind(id, back.owedBy, back.owedTo, part.tab, input.note, v.id, ...at(ok), now));
    if (!ok) asks.push(['payment', { id, ...back, cents: part.tab, how: 'tab', note: input.note }]);
  }
  if (part.iou) {
    const id = newId('iou'), ok = countsAtOnce('iou', input, v.id);
    writes.push(db.prepare('INSERT INTO ious (id, owed_by, owed_to, cents, note, created_by, ok_at, ok_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, input.owedBy, input.owedTo, part.iou, input.note, v.id, ...at(ok), now));
    if (!ok) asks.push(['iou', { id, ...input, cents: part.iou }]);
  }
  await db.batch(writes);
  if (part.tab && countsAtOnce('payment', back, v.id)) await endPlanIfPaid(db, back);
  if (asks[0]) await askOne(c, ...asks[0], now); // ⚑ Q385: one tap, one push; both rows wait on the same person
  const pairs = await pairsFor(c);
  const touched = (d: Direction) => pairs.find((p) => p.owedBy === d.owedBy && p.owedTo === d.owedTo);
  return c.json({ pairs: [touched(input), part.tab ? touched(back) : undefined].filter(Boolean) }, 201);
});

ious.post('/iou-payments', requireMember, async (c) => {
  const db = c.env.DB, v = viewerOf(c);
  const input = parsePaymentInput(await body(c), await activeMemberIds(db));
  if (typeof input === 'string') return fail(c, 400, 'invalid_input', input);
  const no = madeError(input, v) ?? (input.how === 'let_go' ? letGoError(input, v) : null);
  if (no) return fail(c, 403, 'forbidden', no);
  const r = await rowsOf(db, input);
  const room = owedCents(r.ious, r.payments) - waitingPaid(r.payments);
  if (input.cents > room) return fail(c, 409, 'iou_too_much', `That's more than the ${centsText(Math.max(0, room))} still owed.`);
  const now = nowIso(), ok = countsAtOnce('payment', input, v.id), id = newId('iop');
  await db.prepare('INSERT INTO iou_payments (id, owed_by, owed_to, cents, how, created_by, ok_at, ok_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, input.owedBy, input.owedTo, input.cents, input.how, v.id, ok ? now : null, ok ? v.id : null, now).run();
  if (ok) await endPlanIfPaid(db, input);
  else await askOne(c, 'payment', { id, ...input, note: null }, now);
  return pairAnswer(c, input, 201);
});

for (const [kind, path] of [['iou', '/ious'], ['payment', '/iou-payments']] as const) {
  ious.post(`${path}/:id/ok`, requireMember, async (c) => {
    const row = await loadRow(c, kind);
    if (row instanceof Response) return row;
    const v = viewerOf(c), no = okError(kind, row, v.id);
    if (no) return fail(c, no.status, no.status === 409 ? 'iou_state' : 'forbidden', no.text);
    await c.env.DB.prepare(`UPDATE ${TABLE[kind]} SET ok_at = ?, ok_by = ? WHERE id = ?`).bind(nowIso(), v.id, row.id).run();
    if (kind === 'payment') await endPlanIfPaid(c.env.DB, dirOf(row));
    return pairAnswer(c, dirOf(row));
  });

  ious.post(`${path}/:id/decline`, requireMember, async (c) => {
    const row = await loadRow(c, kind);
    if (row instanceof Response) return row;
    const db = c.env.DB, me = c.get('member'), no = declineError(kind, row, me.id);
    if (no) return fail(c, no.status, no.status === 409 ? 'iou_state' : 'forbidden', no.text);
    const now = nowIso();
    const done = await db.prepare(`UPDATE ${TABLE[kind]} SET declined_at = ?, declined_by = ? WHERE id = ? AND ok_at IS NULL AND declined_at IS NULL`).bind(now, me.id, row.id).run();
    if (!done.meta.changes) return fail(c, 409, 'iou_state', 'That is no longer waiting.'); // a second tap at the same moment
    await pushOne(c, row.created_by, DECLINED_TITLE, declinedMessage(kind, me.display_name, row.cents, row.note), row.id, now);
    return pairAnswer(c, dirOf(row));
  });

  ious.post(`${path}/:id/again`, requireMember, async (c) => {
    const row = await loadRow(c, kind);
    if (row instanceof Response) return row;
    const db = c.env.DB, d = dirOf(row), no = askAgainError(row, viewerOf(c).id);
    if (no) return fail(c, no.status, no.status === 409 ? 'iou_state' : 'forbidden', no.text);
    if (kind === 'payment') {
      const r = await rowsOf(db, d), room = owedCents(r.ious, r.payments) - waitingPaid(r.payments);
      if (row.cents > room) return fail(c, 409, 'iou_too_much', `That's more than the ${centsText(Math.max(0, room))} still owed.`);
    }
    await db.prepare(`UPDATE ${TABLE[kind]} SET declined_at = NULL, declined_by = NULL WHERE id = ?`).bind(row.id).run();
    await askOne(c, kind, { ...row, ...d, how: 'how' in row ? row.how : null }, nowIso());
    return pairAnswer(c, d);
  });

  ious.delete(`${path}/:id`, requireMember, async (c) => {
    const row = await loadRow(c, kind);
    if (row instanceof Response) return row;
    const db = c.env.DB, d = dirOf(row), no = deleteError(kind, row, viewerOf(c));
    if (no) return fail(c, 403, 'forbidden', no);
    if (kind === 'iou' && row.ok_at) {
      const r = await rowsOf(db, d);
      if (rawOwed(r.ious.filter((x) => x.id !== row.id), r.payments) < 0) return fail(c, 409, 'iou_covered', 'Payments already cover it; delete those first.');
    }
    await db.prepare(`UPDATE ${TABLE[kind]} SET deleted_at = ? WHERE id = ?`).bind(nowIso(), row.id).run();
    await endPlanIfPaid(db, d);
    return c.body(null, 204);
  });
}

ious.post('/iou-plans', requireMember, async (c) => {
  const db = c.env.DB, v = viewerOf(c);
  const input = parsePlanInput(await body(c), await activeMemberIds(db));
  if (typeof input === 'string') return fail(c, 400, 'invalid_input', input);
  const no = madeError(input, v);
  if (no) return fail(c, 403, 'forbidden', no);
  const r = await rowsOf(db, input);
  if (owedCents(r.ious, r.payments) === 0) return fail(c, 409, 'iou_nothing_owed', 'Nothing is owed there yet.');
  const now = nowIso();
  await db.batch([
    db.prepare('UPDATE iou_plans SET ended_at = ? WHERE owed_by = ? AND owed_to = ? AND ended_at IS NULL').bind(now, input.owedBy, input.owedTo),
    db.prepare('INSERT INTO iou_plans (id, owed_by, owed_to, cents_each, every, start_date, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(newId('ipl'), input.owedBy, input.owedTo, input.cents, input.every, input.startDate, v.id, now),
  ]);
  return pairAnswer(c, input, 201);
});

ious.delete('/iou-plans/:id', requireMember, async (c) => {
  const p = await first<IouPlanRow>(c.env.DB, 'SELECT * FROM iou_plans WHERE id = ? AND ended_at IS NULL', c.req.param('id'));
  if (!p || !canSee(dirOf(p), viewerOf(c))) return fail(c, 404, 'not_found', GONE);
  await c.env.DB.prepare('UPDATE iou_plans SET ended_at = ? WHERE id = ?').bind(nowIso(), p.id).run();
  return c.body(null, 204);
});
