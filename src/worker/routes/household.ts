// SPEC §10 — settings, school holidays, status, push subscriptions.
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { addDays, diffDays, isDate, isValidTimeZone } from '../../shared/time';
import { DEFAULT_DAYS_OFF, HOLIDAYS, HOLIDAY_KEYS, isHolidayKey, type HolidayKey } from '../../shared/holidays';
import { all, first, newId, nowIso, parseJson, run } from '../db';
import { body, fail, str } from '../http';
import { requireMember, requireOwner } from '../session';

export const RELAY_STALE_MS = 2 * 60_000;

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
    holidays: HOLIDAY_KEYS.map((key) => ({ key, name: HOLIDAYS[key].name })),
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

household.get('/school-holidays', requireMember, async (c) =>
  c.json(await all(c.env.DB, 'SELECT date, label FROM school_holidays ORDER BY date')));

household.put('/school-holidays', requireMember, requireOwner, async (c) => {
  const b = await body(c);
  const label = str(b.label, 80);
  const to = b.to ?? b.from;
  if (!isDate(b.from) || !isDate(to) || to < b.from) return fail(c, 400, 'invalid_input', 'from/to must be YYYY-MM-DD with from ≤ to.');
  if (!label) return fail(c, 400, 'invalid_input', 'Enter a label, e.g. "Winter break".');
  const days = diffDays(to, b.from);
  if (days > 60) return fail(c, 400, 'invalid_input', 'A school holiday range can be at most 60 days.');
  const stmts = [];
  for (let i = 0; i <= days; i++) {
    stmts.push(c.env.DB.prepare('INSERT OR REPLACE INTO school_holidays (date, label) VALUES (?, ?)').bind(addDays(b.from, i), label));
  }
  await c.env.DB.batch(stmts);
  return c.json({ ok: true, days: days + 1 });
});

household.delete('/school-holidays/:date', requireMember, requireOwner, async (c) => {
  const r = await run(c.env.DB, 'DELETE FROM school_holidays WHERE date = ?', c.req.param('date'));
  if (r.meta.changes !== 1) return fail(c, 404, 'not_found', 'No school holiday on that date.');
  return c.json({ ok: true });
});

household.get('/status', requireMember, async (c) => {
  const me = c.get('member').id;
  const s = await first<{ relay_last_seen: string | null }>(c.env.DB, 'SELECT relay_last_seen FROM settings WHERE id = 1');
  const lastSeen = s?.relay_last_seen ?? null;
  return c.json({
    relayLastSeen: lastSeen,
    relayOnline: lastSeen !== null && Date.now() - Date.parse(lastSeen) < RELAY_STALE_MS,
    mySubscriptions: await all(c.env.DB,
      'SELECT id, user_agent AS userAgent, created_at AS createdAt, last_ok_at AS lastOkAt, last_error AS lastError FROM push_subscriptions WHERE member_id = ?', me),
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
  await run(c.env.DB,
    `INSERT INTO push_subscriptions (id, member_id, endpoint, p256dh, auth, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET member_id = excluded.member_id, p256dh = excluded.p256dh, auth = excluded.auth`,
    newId('sub'), c.get('member').id, endpoint, p256dh, auth, str(b.userAgent, 300), nowIso());
  return c.json({ ok: true }, 201);
});

household.delete('/push/subscriptions/:id', requireMember, async (c) => {
  const r = await run(c.env.DB, 'DELETE FROM push_subscriptions WHERE id = ? AND member_id = ?', c.req.param('id'), c.get('member').id);
  if (r.meta.changes !== 1) return fail(c, 404, 'not_found', 'No such subscription of yours.');
  return c.json({ ok: true });
});
