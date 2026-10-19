// SPEC §8.18 — feature requests: GET (admins), POST (any member, after Yes in the Ensō popup), OK to build (the
// founder), Dismiss (admins) and Build now (admins, ⚑ Q344: starts the build session through build-fire.ts). Validates and persists through feature-request-rows.ts; the moves are
// shared/feature-requests.ts.
import { Hono, type Context } from 'hono';
import type { AppEnv } from '../env';
import { buildRefusal, dismissMove, okMove, parseFeatureRequestInput, type Move } from '../../shared/feature-requests';
import { buildFireConfigOf, fireBuild } from '../build-fire';
import { isAdmin } from '../../shared/roles';
import { FOUNDER_SQL, first, nowIso } from '../db';
import { body, fail } from '../http';
import { requireMember } from '../session';
import { insertFeatureRequest, listFeatureRequests, loadFeatureRequest, setStatus } from '../feature-request-rows';

export const featureRequests = new Hono<AppEnv>();

featureRequests.get('/feature-requests', requireMember, async (c) => {
  if (!isAdmin(c.get('member'))) return fail(c, 403, 'forbidden', 'Only an admin can see feature requests.');
  return c.json(await listFeatureRequests(c.env.DB, nowIso()));
});

featureRequests.post('/feature-requests', requireMember, async (c) => {
  const input = parseFeatureRequestInput(await body(c));
  if (typeof input === 'string') return fail(c, 400, 'invalid_input', input);
  return c.json(await insertFeatureRequest(c.env.DB, input, c.get('member').id, nowIso()), 201);
});

/** Loads the request, asks the move, saves it. */
async function move(c: Context<AppEnv>, decide: (status: Parameters<typeof okMove>[0]) => Promise<Move>) {
  const r = await loadFeatureRequest(c.env.DB, c.req.param('id'));
  if (!r) return fail(c, 404, 'not_found', 'That request no longer exists.');
  const m = await decide(r.status);
  if ('code' in m) return fail(c, m.code, m.code === 403 ? 'forbidden' : 'invalid_state', m.message);
  if (!(await setStatus(c.env.DB, r.id, r.status, m.status, null, nowIso()))) return fail(c, 409, 'invalid_state', 'That request just changed. Look again.');
  return c.json((await loadFeatureRequest(c.env.DB, r.id))!);
}

featureRequests.post('/feature-requests/:id/ok', requireMember, (c) =>
  move(c, async (s) => okMove(s, (await first<{ id: string }>(c.env.DB, FOUNDER_SQL))?.id === c.get('member').id)));

featureRequests.post('/feature-requests/:id/dismiss', requireMember, (c) => move(c, async (s) => dismissMove(s, isAdmin(c.get('member')))));

featureRequests.post('/feature-requests/:id/build', requireMember, async (c) => {
  const r = await loadFeatureRequest(c.env.DB, c.req.param('id'));
  if (!r) return fail(c, 404, 'not_found', 'That request no longer exists.');
  const no = buildRefusal(r.status, isAdmin(c.get('member')));
  if (no) return fail(c, no.code, no.code === 403 ? 'forbidden' : 'invalid_state', no.message);
  const cfg = buildFireConfigOf(c.env);
  if (!cfg) return fail(c, 503, 'build_now_off', "Build now isn't set up yet. It will be built in the morning.");
  const f = await fireBuild(cfg, r);
  if (!f.ok) { // §8.18 part 6: the reason is an HTTP status or an error's name, never the token
    console.error('build now not started', r.id, f.reason);
    return fail(c, 502, 'build_failed', "The build couldn't start. It will be built in the morning.");
  }
  return c.json({ started: true }, 202);
});
