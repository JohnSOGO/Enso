import { Hono } from 'hono';
import type { AppEnv, Env } from './env';
import { fail } from './http';
import { first } from './db';
import { tick } from './tick';
import { auth } from './routes/auth';
import { members } from './routes/members';
import { events } from './routes/events';
import { optins } from './routes/optins';
import { alerts } from './routes/alerts';
import { alarms } from './routes/alarms';
import { household } from './routes/household';
import { lists } from './routes/lists';
import { chores } from './routes/chores';
import { things } from './routes/things';
import { thingPhotos } from './routes/thing-photos';
import { announce } from './routes/announce';
import { machines } from './routes/machines';
import { recipes } from './routes/recipes';

const api = new Hono<AppEnv>();

// The API is a system of record: never let a browser or iOS heuristically cache it. A route that
// set its own Cache-Control (a thing's photo, §7C.3) keeps it.
api.use('*', async (c, next) => {
  await next();
  if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'no-store');
});

api.get('/health', async (c) => {
  let db = false;
  try { db = (await first<{ ok: number }>(c.env.DB, 'SELECT 1 AS ok'))?.ok === 1; } catch { db = false; }
  return c.json({ ok: true, db });
});

api.route('/', auth);
api.route('/', members);
api.route('/', events);
api.route('/', optins);
api.route('/', alerts);
api.route('/', alarms);
api.route('/', household);
api.route('/', lists);
api.route('/', chores);
api.route('/', thingPhotos); // before things: /things/read-photo must not match /things/:id
api.route('/', things);
api.route('/', announce);
api.route('/', machines);
api.route('/', recipes);

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
