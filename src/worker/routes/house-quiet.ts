// SPEC §9.2b — GET / PUT / DELETE /house/quiet: any member quiets the household's speakers for a while, or
// turns it off. The rules are src/shared/house-quiet.ts; the three house-row writers read it via ../house-quiet.
import { Hono, type Context } from 'hono';
import type { AppEnv } from '../env';
import { quietEnd, quietError } from '../../shared/house-quiet';
import type { HouseQuietFor } from '../../shared/vocab';
import { householdTz, nowIso } from '../db';
import { body, fail } from '../http';
import { requireMember } from '../session';
import { houseQuiet } from '../house-quiet';

export const houseQuietRoutes = new Hono<AppEnv>();

const view = async (c: Context<AppEnv>) => {
  const q = await houseQuiet(c.env.DB, nowIso());
  return c.json({ until: q?.until ?? null, byName: q?.byName ?? null });
};

houseQuietRoutes.get('/house/quiet', requireMember, view);

houseQuietRoutes.put('/house/quiet', requireMember, async (c) => {
  const choice = (await body(c)).for;
  const err = quietError(choice);
  if (err) return fail(c, 400, 'invalid_input', err);
  const db = c.env.DB;
  const until = quietEnd(choice as HouseQuietFor, await householdTz(db), nowIso());
  await db.prepare('UPDATE settings SET house_quiet_until = ?, house_quiet_by = ? WHERE id = 1').bind(until, c.get('member').id).run();
  return view(c);
});

houseQuietRoutes.delete('/house/quiet', requireMember, async (c) => {
  await c.env.DB.prepare('UPDATE settings SET house_quiet_until = NULL, house_quiet_by = NULL WHERE id = 1').run();
  return view(c);
});
