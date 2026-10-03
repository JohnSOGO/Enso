// SPEC §5.4, §5.5, §10 — timers and fires (the things that ring).
import { Hono, type Context } from 'hono';
import type { AppEnv } from '../env';
import { ACTION, CHANNEL, TIMER_CMD, isOneOf, type Channel } from '../../shared/vocab';
import { applyAction, applyTimerCmd, type FireRow } from '../../shared/engine';
import { all, first, newId, nowIso, parseJson, run } from '../db';
import { body, fail, intIn, str } from '../http';
import { requireMember } from '../session';
import { choreFireContext } from '../../shared/chores';
import { insertFire, loadChoreRun, sourceOf, updateFire } from '../tick';
import { completeStep } from './chores';

interface TimerRow {
  id: string; title: string; interval_min: number; channels: string; renotify_min: number | null; max_alerts: number;
  assigned_to: string; running: number; created_by: string; created_at: string; updated_at: string; deleted_at: string | null;
}

async function timerView(db: D1Database, t: TimerRow) {
  const open = await first<{ id: string; due_at: string; state: string; alert_count: number }>(db,
    `SELECT id, due_at, state, alert_count FROM fires WHERE timer_id = ? AND state != 'closed'`, t.id);
  return {
    id: t.id, title: t.title, intervalMin: t.interval_min, channels: parseJson<Channel[]>(t.channels, []),
    renotifyMin: t.renotify_min, maxAlerts: t.max_alerts, assignedTo: parseJson<string[]>(t.assigned_to, []),
    running: t.running === 1, createdBy: t.created_by, openFire: open ?? null,
  };
}

function parseTimerInput(b: Record<string, unknown>) {
  const title = str(b.title, 120);
  if (!title) return 'Title is required (up to 120 characters).';
  const interval = intIn(b.intervalMin, 1, 1440);
  if (interval === null) return 'Interval must be 1–1440 minutes.';
  if (!Array.isArray(b.channels) || b.channels.length === 0 || !b.channels.every((ch) => isOneOf(CHANNEL, ch))) {
    return `Channels must be a non-empty list of: ${CHANNEL.join(', ')}.`;
  }
  const renotify = b.renotifyMin === null ? null : b.renotifyMin === undefined ? 15 : intIn(b.renotifyMin, 1, 240);
  if (renotify === null && b.renotifyMin !== null) return 'Repeat-alert interval must be 1–240 minutes.';
  const maxAlerts = b.maxAlerts === undefined ? 4 : intIn(b.maxAlerts, 1, 20);
  if (maxAlerts === null) return 'maxAlerts must be 1–20.';
  const assigned = b.assignedTo ?? [];
  if (!Array.isArray(assigned) || !assigned.every((x) => typeof x === 'string')) return 'assignedTo must be a list of member ids.';
  return { title, interval_min: interval, channels: JSON.stringify([...new Set(b.channels)]), renotify_min: renotify, max_alerts: maxAlerts, assigned_to: JSON.stringify(assigned) };
}

async function loadTimer(c: Context<AppEnv>, forWrite: boolean): Promise<TimerRow | Response> {
  const t = await first<TimerRow>(c.env.DB, 'SELECT * FROM timers WHERE id = ? AND deleted_at IS NULL', c.req.param('id'));
  if (!t) return fail(c, 404, 'not_found', 'That timer no longer exists.');
  const me = c.get('member');
  if (forWrite && t.created_by !== me.id && me.role !== 'owner') return fail(c, 403, 'forbidden', 'Only the creator or an admin can change this timer.');
  return t;
}

export const alerts = new Hono<AppEnv>();

alerts.get('/timers', requireMember, async (c) => {
  const rows = await all<TimerRow>(c.env.DB, 'SELECT * FROM timers WHERE deleted_at IS NULL ORDER BY created_at');
  return c.json(await Promise.all(rows.map((t) => timerView(c.env.DB, t))));
});

alerts.post('/timers', requireMember, async (c) => {
  const input = parseTimerInput(await body(c));
  if (typeof input === 'string') return fail(c, 400, 'invalid_input', input);
  const id = newId('tmr'), now = nowIso();
  await run(c.env.DB,
    `INSERT INTO timers (id, title, interval_min, channels, renotify_min, max_alerts, assigned_to, running, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    id, input.title, input.interval_min, input.channels, input.renotify_min, input.max_alerts, input.assigned_to, c.get('member').id, now, now);
  return c.json(await timerView(c.env.DB, (await first<TimerRow>(c.env.DB, 'SELECT * FROM timers WHERE id = ?', id))!), 201);
});

alerts.patch('/timers/:id', requireMember, async (c) => {
  const t = await loadTimer(c, true);
  if (t instanceof Response) return t;
  const current = await timerView(c.env.DB, t);
  const input = parseTimerInput({ ...current, ...(await body(c)) });
  if (typeof input === 'string') return fail(c, 400, 'invalid_input', input);
  await run(c.env.DB,
    `UPDATE timers SET title = ?, interval_min = ?, channels = ?, renotify_min = ?, max_alerts = ?, assigned_to = ?, updated_at = ? WHERE id = ?`,
    input.title, input.interval_min, input.channels, input.renotify_min, input.max_alerts, input.assigned_to, nowIso(), t.id);
  return c.json(await timerView(c.env.DB, (await first<TimerRow>(c.env.DB, 'SELECT * FROM timers WHERE id = ?', t.id))!));
});

alerts.delete('/timers/:id', requireMember, async (c) => {
  const t = await loadTimer(c, true);
  if (t instanceof Response) return t;
  const now = nowIso();
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE timers SET deleted_at = ?, running = 0, updated_at = ? WHERE id = ?').bind(now, now, t.id),
    c.env.DB.prepare(`UPDATE fires SET state = 'closed', close_reason = 'removed', closed_at = ? WHERE timer_id = ? AND state != 'closed'`).bind(now, t.id),
  ]);
  return c.json({ ok: true });
});

alerts.post('/timers/:id/commands', requireMember, async (c) => {
  const t = await loadTimer(c, false);
  if (t instanceof Response) return t;
  const b = await body(c);
  if (!isOneOf(TIMER_CMD, b.cmd)) return fail(c, 400, 'invalid_input', `cmd must be one of: ${TIMER_CMD.join(', ')}.`);
  const now = nowIso();
  const open = await first<FireRow>(c.env.DB, `SELECT * FROM fires WHERE timer_id = ? AND state != 'closed'`, t.id);
  const r = applyTimerCmd({ id: t.id, running: t.running === 1 }, open, b.cmd, t.interval_min, c.get('member').id, now);
  const stmts = [c.env.DB.prepare('UPDATE timers SET running = ?, updated_at = ? WHERE id = ?').bind(r.timer.running ? 1 : 0, now, t.id)];
  if (r.closeFire) stmts.push(updateFire(c.env.DB, r.closeFire));
  if (r.newFire) stmts.push(insertFire(c.env.DB, r.newFire));
  await c.env.DB.batch(stmts);
  return c.json(await timerView(c.env.DB, (await first<TimerRow>(c.env.DB, 'SELECT * FROM timers WHERE id = ?', t.id))!));
});

alerts.get('/fires', requireMember, async (c) => {
  const state = c.req.query('state') ?? 'ringing';
  if (state !== 'ringing' && state !== 'open') return fail(c, 400, 'invalid_input', 'state must be ringing or open.');
  const rows = await all<Record<string, unknown> & { kind: string; choreRunId: string | null }>(c.env.DB,
    `SELECT f.id, f.kind, f.due_at AS dueAt, f.state, f.alert_count AS alertCount, f.occurrence_date AS occurrenceDate,
            f.event_id AS eventId, f.timer_id AS timerId, f.chore_run_id AS choreRunId, COALESCE(e.title, t.title) AS title,
            e.start_time AS startTime
       FROM fires f LEFT JOIN events e ON e.id = f.event_id LEFT JOIN timers t ON t.id = f.timer_id
      WHERE ${state === 'ringing' ? "f.state = 'ringing'" : "f.state != 'closed'"}
      ORDER BY f.due_at DESC`);
  const out = [];
  for (const { choreRunId, ...r } of rows) {
    if (r.kind !== 'chore') { out.push(r); continue; }
    // §10: chore fires carry their run, the current step's person, and the step title (multi-step only).
    const cr = await loadChoreRun(c.env.DB, choreRunId);
    const ctx = cr && choreFireContext(cr.chore, cr.run);
    out.push({
      ...r, title: cr?.chore.title ?? null, choreRunId, personId: ctx?.personId ?? null,
      ...(ctx && ctx.stepCount > 1 ? { stepTitle: ctx.stepTitle } : {}),
    });
  }
  return c.json(out);
});

alerts.post('/fires/:id/actions', requireMember, async (c) => {
  const b = await body(c);
  if (!isOneOf(ACTION, b.action)) return fail(c, 400, 'invalid_input', `action must be one of: ${ACTION.join(', ')}.`);
  const fire = await first<FireRow>(c.env.DB, 'SELECT * FROM fires WHERE id = ?', c.req.param('id'));
  if (!fire) return fail(c, 404, 'not_found', 'That alert no longer exists.');
  const src = await sourceOf(c.env.DB, fire);
  if (!src) return fail(c, 404, 'not_found', 'That alert no longer has an event or timer.');
  const now = nowIso();
  const r = applyAction(fire, b.action, src.cfg, c.get('member').id, now);
  if ('error' in r) return fail(c, 409, 'invalid_action', `Cannot ${b.action} this ${fire.kind} right now (it is ${fire.state}).`);
  if (fire.kind === 'chore') {
    // Done on a chore fire advances its run one step (§7B.3); that closes this fire and may plan the next.
    const s = await completeStep(c.env.DB, fire.chore_run_id!, c.get('member').id, now);
    if ('error' in s) return fail(c, 409, 'invalid_action', `Cannot ${b.action} this chore right now (${s.error}).`);
    return c.json({ fire: s.change.closeFire ?? r.fire, next: s.change.newFire ?? null });
  }
  const stmts = [updateFire(c.env.DB, r.fire)];
  if (r.next) stmts.push(insertFire(c.env.DB, r.next));
  await c.env.DB.batch(stmts);
  return c.json({ fire: r.fire, next: r.next ?? null });
});
