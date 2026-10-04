// SPEC §10 — settings, status (incl. the derived House state, §9.2), /push/* (vapid-key, subscriptions, test).
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { isValidTimeZone } from '../../shared/time';
import { DEFAULT_DAYS_OFF, HOLIDAYS, HOLIDAY_KEYS, isHolidayKey, type HolidayKey } from '../../shared/holidays';
import { all, first, newId, nowIso, parseJson, run } from '../db';
import { body, fail, str } from '../http';
import { requireMember, requireOwner } from '../session';
import { NO_SUBSCRIPTION, PUSH_NOT_CONFIGURED, sendTestPush } from '../push';
import { houseState } from '../house';

export const household = new Hono<AppEnv>();

/** The household's days off (§7.3): stored keys, or the defaults when never set. */
export async function daysOff(db: D1Database): Promise<HolidayKey[]> {
  const row = await first<{ days_off: string | null }>(db, 'SELECT days_off FROM settings WHERE id = 1');
  return parseJson<string[] | null>(row?.days_off ?? null, null)?.filter(isHolidayKey) ?? DEFAULT_DAYS_OFF;
}

async function settingsView(db: D1Database) {
  const s = await first<{ household_name: string; timezone: string }>(db, 'SELECT household_name, timezone FROM settings WHERE id = 1');
  return {
    householdName: s!.household_name, timezone: s!.timezone, daysOff: await daysOff(db),
    holidays: HOLIDAY_KEYS.map((key) => ({ key, name: HOLIDAYS[key].name, emoji: HOLIDAYS[key].emoji })),
  };
}

household.get('/settings', requireMember, async (c) => c.json(await settingsView(c.env.DB)));

household.patch('/settings', requireMember, requireOwner, async (c) => {
  const b = await body(c);
  const stmts: D1PreparedStatement[] = [];
  if (b.householdName !== undefined) {
    const name = str(b.householdName, 60);
    if (!name) return fail(c, 400, 'invalid_input', 'Household name must be 1–60 characters.');
    stmts.push(c.env.DB.prepare('UPDATE settings SET household_name = ? WHERE id = 1').bind(name));
  }
  if (b.timezone !== undefined) {
    if (typeof b.timezone !== 'string' || !isValidTimeZone(b.timezone)) return fail(c, 400, 'invalid_input', 'Timezone must be an IANA name like America/Los_Angeles.');
    stmts.push(c.env.DB.prepare('UPDATE settings SET timezone = ? WHERE id = 1').bind(b.timezone));
  }
  if (b.daysOff !== undefined) {
    if (!Array.isArray(b.daysOff) || !b.daysOff.every(isHolidayKey)) return fail(c, 400, 'invalid_input', `daysOff must be a list of: ${HOLIDAY_KEYS.join(', ')}.`);
    stmts.push(c.env.DB.prepare('UPDATE settings SET days_off = ? WHERE id = 1').bind(JSON.stringify([...new Set(b.daysOff)])));
  }
  if (stmts.length) await c.env.DB.batch(stmts);
  return c.json(await settingsView(c.env.DB));
});

household.get('/status', requireMember, async (c) => {
  const me = c.get('member').id;
  return c.json({
    house: await houseState(c.env),
    mySubscriptions: await all(c.env.DB,
      'SELECT id, endpoint, user_agent AS userAgent, created_at AS createdAt, last_ok_at AS lastOkAt, last_error AS lastError FROM push_subscriptions WHERE member_id = ?', me),
    recentDeliveries: await all(c.env.DB,
      `SELECT d.id, d.channel, d.message, d.status, d.detail, d.created_at AS createdAt, m.display_name AS member
         FROM deliveries d LEFT JOIN members m ON m.id = d.member_id ORDER BY d.created_at DESC LIMIT 20`),
  });
});

household.get('/push/vapid-key', (c) => c.json({ key: c.env.VAPID_PUBLIC_KEY ?? null }));

household.post('/push/subscriptions', requireMember, async (c) => {
  const b = await body(c);
  const keys = (b.keys ?? {}) as Record<string, unknown>;
  const endpoint = str(b.endpoint, 1000), p256dh = str(keys.p256dh, 200), auth = str(keys.auth, 100);
  if (!endpoint || !endpoint.startsWith('https://') || !p256dh || !auth) return fail(c, 400, 'invalid_input', 'Not a valid push subscription.');
  // Upserted by endpoint: the same phone subscribing again keeps its row (and id).
  const row = await first<{ id: string }>(c.env.DB,
    `INSERT INTO push_subscriptions (id, member_id, endpoint, p256dh, auth, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET member_id = excluded.member_id, p256dh = excluded.p256dh, auth = excluded.auth
     RETURNING id`,
    newId('sub'), c.get('member').id, endpoint, p256dh, auth, str(b.userAgent, 300), nowIso());
  return c.json({ id: row!.id }, 201);
});

household.post('/push/test', requireMember, async (c) => {
  const r = await sendTestPush(c.env, c.get('member').id, nowIso());
  if ('sent' in r) return c.json(r);
  return fail(c, r.error === NO_SUBSCRIPTION ? 409 : r.error === PUSH_NOT_CONFIGURED ? 503 : 502, r.error, r.message);
});

household.delete('/push/subscriptions/:id', requireMember, async (c) => {
  const r = await run(c.env.DB, 'DELETE FROM push_subscriptions WHERE id = ? AND member_id = ?', c.req.param('id'), c.get('member').id);
  if (r.meta.changes !== 1) return fail(c, 404, 'not_found', 'No such subscription of yours.');
  return c.json({ ok: true });
});
