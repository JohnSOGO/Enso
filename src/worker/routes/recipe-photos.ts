// SPEC §7E.2b ⚑ Q174 — a recipe's picture in R2 (private: only through this API, to signed-in members). It is
// written by recipe-reread.ts when a read from screenshots succeeds; this route only serves it.
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import type { RecipeRow } from '../../shared/recipes';
import { first } from '../db';
import { fail } from '../http';
import { requireMember } from '../session';

export const recipePhotos = new Hono<AppEnv>();

recipePhotos.get('/recipes/:id/photo', requireMember, async (c) => {
  const r = await first<RecipeRow>(c.env.DB, 'SELECT * FROM recipes WHERE deleted_at IS NULL AND id = ?', c.req.param('id'));
  const obj = r?.photo_key ? await c.env.PHOTOS.get(r.photo_key) : null;
  if (!obj) return fail(c, 404, 'not_found', 'This recipe has no picture.');
  return c.body(obj.body, 200, {
    'Content-Type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
    'Cache-Control': 'private, max-age=3600',
  });
});
