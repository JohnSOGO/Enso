// SPEC §7E.2b ⚑ Q174, §7E.3 ⚑ Q175 — a recipe's picture in R2 (private: only through this API, to signed-in members).
// recipe-reread.ts keeps the first screenshot of a successful read; here anyone may also set or remove it by hand
// (PUT a photo body, as a thing's; DELETE), each bumping updated_at so the PWA's ?v= shows the change.
import { Hono, type Context } from 'hono';
import type { AppEnv } from '../env';
import type { RecipeRow } from '../../shared/recipes';
import { first, nowIso, randomBase32, run } from '../db';
import { fail, photoBody } from '../http';
import { requireMember } from '../session';

export const recipePhotos = new Hono<AppEnv>();

const loadRecipe = async (c: Context<AppEnv>): Promise<RecipeRow | Response> =>
  (await first<RecipeRow>(c.env.DB, 'SELECT * FROM recipes WHERE deleted_at IS NULL AND id = ?', c.req.param('id')))
  ?? fail(c, 404, 'not_found', 'That recipe no longer exists.');

recipePhotos.put('/recipes/:id/photo', requireMember, async (c) => {
  const r = await loadRecipe(c);
  if (r instanceof Response) return r;
  const photo = await photoBody(c);
  if (photo instanceof Response) return photo;
  const key = `recipes/${r.id}/${randomBase32(16).toLowerCase()}.jpg`;
  await c.env.PHOTOS.put(key, photo.bytes, { httpMetadata: { contentType: photo.type } });
  await run(c.env.DB, 'UPDATE recipes SET photo_key = ?, updated_at = ? WHERE id = ?', key, nowIso(), r.id);
  if (r.photo_key) await c.env.PHOTOS.delete(r.photo_key); // replacing deletes the old object
  return c.body(null, 204);
});

recipePhotos.delete('/recipes/:id/photo', requireMember, async (c) => {
  const r = await loadRecipe(c);
  if (r instanceof Response) return r;
  if (r.photo_key) {
    await run(c.env.DB, 'UPDATE recipes SET photo_key = NULL, updated_at = ? WHERE id = ?', nowIso(), r.id);
    await c.env.PHOTOS.delete(r.photo_key);
  }
  return c.body(null, 204);
});

recipePhotos.get('/recipes/:id/photo', requireMember, async (c) => {
  const r = await loadRecipe(c);
  if (r instanceof Response) return r;
  const obj = r.photo_key ? await c.env.PHOTOS.get(r.photo_key) : null;
  if (!obj) return fail(c, 404, 'not_found', 'This recipe has no picture.');
  return c.body(obj.body, 200, {
    'Content-Type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
    'Cache-Control': 'private, max-age=3600',
  });
});
