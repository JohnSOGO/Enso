import { Hono } from 'hono';
import type { AppEnv, Env } from './env';
import { fail } from './http';
import { first } from './db';
import { tick } from './tick';
import { auth } from './routes/auth';
import { members } from './routes/members';
import { events } from './routes/events';
import { alerts } from './routes/alerts';
import { household } from './routes/household';
import { relay } from './routes/relay';

const api = new Hono<AppEnv>();

api.get('/health', async (c) => {
  let db = false;
  try { db = (await first<{ ok: number }>(c.env.DB, 'SELECT 1 AS ok'))?.ok === 1; } catch { db = false; }
  return c.json({ ok: true, db });
});

api.route('/', auth);
api.route('/', members);
api.route('/', events);
api.route('/', alerts);
api.route('/', household);
api.route('/', relay);

api.post('/dev/tick', async (c) => {
  if (c.env.DEV_ENDPOINTS !== '1') return fail(c, 404, 'not_found', 'Not found.');
  const now = c.req.query('now') ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(now))) return fail(c, 400, 'invalid_input', 'now must be an ISO timestamp.');
  return c.json(await tick(c.env, new Date(now).toISOString()));
});

const app = new Hono<AppEnv>();
app.route('/api/v1', api);
app.notFound((c) => fail(c, 404, 'not_found', `No route for ${c.req.method} ${c.req.path}.`));
app.onError((err, c) => {
  console.error(err);
  return fail(c, 500, 'internal', `Server error: ${err.message}`);
});

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(tick(env, new Date().toISOString()).then((s) => {
      if (s.alerts || s.materialized) console.log('tick', JSON.stringify(s));
    }));
  },
} satisfies ExportedHandler<Env>;
