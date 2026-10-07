// SPEC §7E.2b ⚑ Q174, §7E.3 ⚑ Q175 — a recipe's picture in R2 (private: only through this API, to signed-in members).
// recipe-reread.ts keeps the first screenshot of a successful read; here its creator or an admin (§6.3) may also set or remove it by hand
// (PUT a photo body, as a thing's; DELETE), each bumping updated_at so the PWA's ?v= shows the change.
import { Hono, type Context } from 'hono';
import type { AppEnv } from '../env';
import type { RecipeRow } from '../../shared/recipes';
import { first, nowIso, run } from '../db';
import { fail, photoBody } from '../http';
import { requireMember } from '../session';
import { canChange, cannotChangeText } from '../../shared/roles';
import { replacePhoto, servePhoto } from '../photo-store';

export const recipePhotos = new Hono<AppEnv>();

async function loadRecipe(c: Context<AppEnv>, forWrite: boolean): Promise<RecipeRow | Response> {
  const r = await first<RecipeRow>(c.env.DB, 'SELECT * FROM recipes WHERE deleted_at IS NULL AND id = ?', c.req.param('id'));
  if (!r) return fail(c, 404, 'not_found', 'That recipe no longer exists.');
  return forWrite && !canChange(r.created_by, c.get('member')) ? fail(c, 403, 'forbidden', cannotChangeText('recipe')) : r;
}

recipePhotos.put('/recipes/:id/photo', requireMember, async (c) => {
  const r = await loadRecipe(c, true);
  if (r instanceof Response) return r;
  const photo = await photoBody(c);
  if (photo instanceof Response) return photo;
  await replacePhoto(c.env.PHOTOS, 'recipes', r.id, photo.bytes, photo.type, r.photo_key,
    (key) => run(c.env.DB, 'UPDATE recipes SET photo_key = ?, updated_at = ? WHERE id = ?', key, nowIso(), r.id));
  return c.body(null, 204);
});

recipePhotos.delete('/recipes/:id/photo', requireMember, async (c) => {
  const r = await loadRecipe(c, true);
  if (r instanceof Response) return r;
  if (r.photo_key) {
    await run(c.env.DB, 'UPDATE recipes SET photo_key = NULL, updated_at = ? WHERE id = ?', nowIso(), r.id);
    await c.env.PHOTOS.delete(r.photo_key);
  }
  return c.body(null, 204);
});

recipePhotos.get('/recipes/:id/photo', requireMember, async (c) => {
  const r = await loadRecipe(c, false);
  if (r instanceof Response) return r;
  return servePhoto(c, c.env.PHOTOS, r.photo_key, 'This recipe has no picture.');
});
