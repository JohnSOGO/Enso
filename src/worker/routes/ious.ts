// SPEC §7B.9 — family IOUs: adding IOUs, paying back or letting go, OK / Got it, deleting, and payback plans. Every
// rule (amounts, who agrees, who sees, the queue, behind) is src/shared/ious.ts; this file validates and persists.
import { Hono, type Context } from 'hono';
import type { AppEnv } from '../env';
import {
  countsAtOnce, deleteError, dirOf, reverse, tabSplit, letGoError, madeError, okError, owedCents, pairsOf, parseIouInput, parsePaymentInput,
  parsePlanInput, rawOwed, waitingPaid, canSee, centsText, type Direction, type IouKind, type IouPaymentRow, type IouPlanRow,
  type IouRow, type IouViewer,
} from '../../shared/ious';
import { isAdmin } from '../../shared/roles';
import { utcToLocal } from '../../shared/time';
import { activeMemberIds, all, first, householdTz, newId, nowIso } from '../db';
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
  const writes: D1PreparedStatement[] = [];
  if (part.tab) {
    writes.push(db.prepare('INSERT INTO iou_payments (id, owed_by, owed_to, cents, how, note, created_by, ok_at, ok_by, created_at) VALUES (?, ?, ?, ?, \'tab\', ?, ?, ?, ?, ?)')
      .bind(newId('iop'), back.owedBy, back.owedTo, part.tab, input.note, v.id, ...at(countsAtOnce('payment', back, v.id)), now));
  }
  if (part.iou) {
    writes.push(db.prepare('INSERT INTO ious (id, owed_by, owed_to, cents, note, created_by, ok_at, ok_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(newId('iou'), input.owedBy, input.owedTo, part.iou, input.note, v.id, ...at(countsAtOnce('iou', input, v.id)), now));
  }
  await db.batch(writes);
  if (part.tab && countsAtOnce('payment', back, v.id)) await endPlanIfPaid(db, back);
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
  const now = nowIso(), ok = countsAtOnce('payment', input, v.id);
  await db.prepare('INSERT INTO iou_payments (id, owed_by, owed_to, cents, how, created_by, ok_at, ok_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(newId('iop'), input.owedBy, input.owedTo, input.cents, input.how, v.id, ok ? now : null, ok ? v.id : null, now).run();
  if (ok) await endPlanIfPaid(db, input);
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
