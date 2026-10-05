// SPEC §9.4 — POST /ops/notify: a Claude Code session pushes a message to the founder's phone. No session:
// a Bearer OPS_NOTIFY_TOKEN, compared in constant time (unset → 503, never open). One fire-less `push`
// delivery with its own title, sent at once. No house row, ever. The token and the header are never
// logged, and never put in a message or a detail.
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { OPS_NOTIFY_PER_HOUR, opsNotifyError, opsTitle, opsWindowStart } from '../../shared/ops';
import { all, first, nowIso } from '../db';
import { opsPingsSince, pushDelivery } from '../deliveries';
import { body, fail } from '../http';
import { sendPushDeliveries } from '../push';
import { FOUNDER_SQL } from './members';

export const ops = new Hono<AppEnv>();

const digest = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));

/** Constant time: the SHA-256 of each (equal lengths), every byte compared. */
async function sameSecret(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

ops.post('/ops/notify', async (c) => {
  const token = c.env.OPS_NOTIFY_TOKEN;
  if (!token) return fail(c, 503, 'ops_notify_off', 'Pinging the phone is not set up on this server.');
  const given = /^Bearer (.+)$/.exec(c.req.header('authorization') ?? '')?.[1] ?? '';
  if (!(await sameSecret(given, token))) return fail(c, 401, 'unauthorized', 'A valid ops token is required.');

  const b = await body(c);
  const err = opsNotifyError({ text: b.text, title: b.title });
  if (err) return fail(c, 400, 'invalid_input', err);
  const db = c.env.DB;
  const founder = (await first<{ id: string }>(db, FOUNDER_SQL))?.id;
  if (!founder) return fail(c, 409, 'no_recipients', 'There is no founder to ping yet.');
  const now = nowIso();

  const recent = await opsPingsSince(db, opsWindowStart(now));
  if (recent >= OPS_NOTIFY_PER_HOUR) {
    return fail(c, 429, 'rate_limited', `At most ${OPS_NOTIFY_PER_HOUR} pings an hour — try again later.`);
  }

  const { id, stmt } = pushDelivery(db, { memberId: founder, message: (b.text as string).trim(), title: opsTitle(b.title) }, now);
  await stmt.run();
  await sendPushDeliveries(c.env, [id], now);

  const deliveries = await all<{ id: string; status: string; detail: string | null }>(db,
    'SELECT id, status, detail FROM deliveries WHERE id = ?', id);
  return c.json({ deliveries }, 201);
});
