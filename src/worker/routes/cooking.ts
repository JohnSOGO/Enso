// SPEC §7D.8, §10 — cooking timers: /cooking, one batch per change. The rules are src/shared/cooking.ts; the rows cook-rows.ts.
import { Hono, type Context } from 'hono';
import type { AppEnv } from '../env';
import type { FireRow } from '../../shared/engine';
import { machineState } from '../../shared/machines';
import {
  closeCook, cookLabel, cookRefusalText, createCook, editCook, offCook, parseCreate, parseEdit, startCook, stopCook,
  type CookResult, type CookRow,
} from '../../shared/cooking';
import { activeMemberIds, first, newId, nowIso } from '../db';
import { body, fail } from '../http';
import { requireMember } from '../session';
import { cookWrites, openCookFire, openCooks } from '../cook-rows';

const cookView = (r: CookRow, now: string) => ({
  id: r.id, kind: r.cook_kind, name: r.name, label: cookLabel(r), state: machineState(r, now), minutes: r.minutes,
  startedAt: r.started_at, doneAt: r.done_at, alertId: r.alert_id, startedBy: r.started_by,
});
const listView = async (db: D1Database, now: string) => (await openCooks(db)).map((r) => cookView(r, now));

/** Answers a refusal, or saves the change and answers every open timer — 409 `conflict` if another tap won. */
async function save(c: Context<AppEnv>, before: CookRow | null, r: CookResult, now: string, status: 200 | 201 = 200) {
  const db = c.env.DB;
  if ('error' in r) return fail(c, 409, r.error, cookRefusalText(r));
  try {
    await db.batch(cookWrites(db, before, r));
  } catch (e) {
    if (!/UNIQUE|constraint/i.test(String(e))) throw e;
    return fail(c, 409, 'conflict', `Someone else just changed ${cookLabel(r.row)} — have another look.`);
  }
  return c.json(await listView(db, now), status);
}

/** The open timer named in the path and its open fire — or a 404 (unknown, closed, or a fixed machine). */
async function load(c: Context<AppEnv>): Promise<{ row: CookRow; fire: FireRow | null } | Response> {
  const id = c.req.param('id') ?? '';
  const row = await first<CookRow>(c.env.DB, 'SELECT * FROM machines WHERE id = ? AND cook_kind IS NOT NULL AND closed_at IS NULL', id);
  if (!row) return fail(c, 404, 'not_found', 'That cooking timer is closed or gone.');
  return { row, fire: await openCookFire(c.env.DB, id) };
}

export const cooking = new Hono<AppEnv>();

cooking.get('/cooking', requireMember, async (c) => c.json(await listView(c.env.DB, nowIso())));

cooking.post('/cooking', requireMember, async (c) => {
  const me = c.get('member').id;
  const input = parseCreate(await body(c), await activeMemberIds(c.env.DB), me);
  if (typeof input === 'string') return fail(c, 400, 'invalid_input', input);
  const now = nowIso();
  return save(c, null, createCook(newId('cook'), input, me, now), now, 201);
});

cooking.patch('/cooking/:id', requireMember, async (c) => {
  const m = await load(c);
  if (m instanceof Response) return m;
  const patch = parseEdit(await body(c), await activeMemberIds(c.env.DB));
  if (typeof patch === 'string') return fail(c, 400, 'invalid_input', patch);
  const now = nowIso();
  return save(c, m.row, editCook(m.row, patch, m.fire, c.get('member').id, now), now);
});

const ACTIONS = {
  off: (r: CookRow, f: FireRow | null, by: string, now: string) => offCook(r, f, by, now),
  stop: (r: CookRow, f: FireRow | null, by: string, now: string) => stopCook(r, f, by, now),
  start: (r: CookRow, _f: FireRow | null, by: string, now: string) => startCook(r, by, now),
  close: (r: CookRow, f: FireRow | null, by: string, now: string) => closeCook(r, f, by, now),
} satisfies Record<string, (r: CookRow, f: FireRow | null, by: string, now: string) => CookResult>;

for (const [action, step] of Object.entries(ACTIONS)) {
  cooking.post(`/cooking/:id/${action}`, requireMember, async (c) => {
    const m = await load(c);
    if (m instanceof Response) return m;
    const now = nowIso();
    return save(c, m.row, step(m.row, m.fire, c.get('member').id, now), now);
  });
}
