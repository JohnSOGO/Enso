// Seeds a LOCAL wrangler dev instance with the accounts in dev-seed.json plus sample events and a timer.
// Usage: npm run seed:dev   (server must be running on http://localhost:8787, fresh local DB)
import { readFileSync } from 'node:fs';

const seed = JSON.parse(readFileSync(new URL('./dev-seed.json', import.meta.url), 'utf8'));
const BASE = process.env.HRC_URL ?? 'http://localhost:8787/api/v1';

async function call(cookie, method, path, body) {
  const res = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body && JSON.stringify(body) });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`);
  return { json, cookie: res.headers.get('set-cookie')?.split(';')[0] ?? cookie };
}

const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local
const plus = (n) => { const d = new Date(`${today}T12:00:00`); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA'); };

const o = await call(null, 'POST', '/setup', { setupToken: seed.setupToken, ...seed.owner });
const c = o.cookie;
const inv = await call(c, 'POST', '/invites', { displayName: seed.member.displayName });
const m = await call(null, 'POST', '/auth/signup', { code: inv.json.code, ...seed.member });

const events = [
  { title: 'Dentist', startDate: plus(2), startTime: '14:30', endTime: '15:30', assignedTo: [m.json.id] },
  { title: 'Grandma visiting', startDate: plus(5), endDate: plus(8) },
  { title: 'Soccer practice with a very long title that must truncate', startDate: plus(1), startTime: '17:00', recurrence: { freq: 'WEEKLY', interval: 2 } },
  { title: 'Pay rent', startDate: `${today.slice(0, 8)}01`, recurrence: { freq: 'MONTHLY' } },
];
for (const e of events) await call(c, 'POST', '/events', e);
await call(c, 'POST', '/alarms', { title: 'Take out trash', time: '19:00', days: ['TU'], channels: ['push', 'house'] });
await call(c, 'POST', '/alarms', { title: 'Morning meds', time: '08:00', days: ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'], channels: ['push'], renotifyMin: 10 });
await call(c, 'PUT', '/school-holidays', { from: plus(20), to: plus(24), label: 'Fall break' });
const t = await call(c, 'POST', '/timers', { title: 'Check on the dog', intervalMin: 60, channels: ['push'], renotifyMin: 15 });
await call(c, 'POST', '/timers', { title: 'Drink water', intervalMin: 90, channels: ['push'], renotifyMin: null });
await call(c, 'POST', `/timers/${t.json.id}/commands`, { cmd: 'start' });
console.log(`seeded: owner ${seed.owner.email}, member ${seed.member.email}, ${events.length} events, 2 alarms, 2 timers`);
