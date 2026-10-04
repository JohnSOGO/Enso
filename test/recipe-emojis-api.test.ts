// M4p acceptance (SPEC §7E.5) — each person's emoji on a recipe: PUT/DELETE /recipes/{id}/emoji, the
// `emojis` every recipe carries, and the recipe's updatedAt left alone. RE1–RE7.
import { env } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { emojiError } from '../src/shared/emoji';
import type { Recipe } from '../src/shared/recipes';
import { Client, member, owner } from './helpers';

let o: Client, me: string, other: { client: Client; id: string };
beforeAll(async () => {
  o = await owner();
  me = (await o.get('/me')).json.id;
  other = await member(o);
});
beforeEach(async () => {
  await env.DB.batch([env.DB.prepare('DELETE FROM recipe_emojis'), env.DB.prepare('DELETE FROM recipes')]);
});

const soup = async () => (await o.post('/recipes', { title: 'Lentil soup', ingredients: ['1 cup lentils'] })).json as Recipe;
const stored = async (id: string) =>
  (await env.DB.prepare('SELECT member_id, emoji FROM recipe_emojis WHERE recipe_id = ? ORDER BY member_id').bind(id).all()).results;

describe('M4p my emoji on a recipe', () => {
  it('a new recipe carries an empty emojis list everywhere', async () => {
    const r = await soup();
    expect(r.emojis).toEqual([]);
    expect((await o.get(`/recipes/${r.id}`)).json.emojis).toEqual([]);
    expect((await o.patch(`/recipes/${r.id}`, { title: 'Soup' })).json.emojis).toEqual([]);
  });

  it('RE1 PUT then GET round-trips, on the recipe and in the list', async () => {
    const r = await soup();
    const put = await o.put(`/recipes/${r.id}/emoji`, { emoji: '🌶' });
    expect(put.status).toBe(200);
    expect(put.json).toMatchObject({ id: r.id, title: 'Lentil soup', emojis: [{ memberId: me, emoji: '🌶' }] });
    expect((await o.get(`/recipes/${r.id}`)).json.emojis).toEqual([{ memberId: me, emoji: '🌶' }]);
    expect((await o.get('/recipes')).json.map((x: Recipe) => x.emojis)).toEqual([[{ memberId: me, emoji: '🌶' }]]);
    // PATCH answers with the emojis too
    expect((await o.patch(`/recipes/${r.id}`, { title: 'Soup' })).json.emojis).toEqual([{ memberId: me, emoji: '🌶' }]);
  });

  it('RE2 PUT replaces my emoji — one row', async () => {
    const r = await soup();
    await o.put(`/recipes/${r.id}/emoji`, { emoji: '🌶' });
    const again = await o.put(`/recipes/${r.id}/emoji`, { emoji: '⭐' });
    expect(again.json.emojis).toEqual([{ memberId: me, emoji: '⭐' }]);
    expect(await stored(r.id)).toEqual([{ member_id: me, emoji: '⭐' }]);
  });

  it('RE3 DELETE clears it; clearing again is fine', async () => {
    const r = await soup();
    await o.put(`/recipes/${r.id}/emoji`, { emoji: '🌶' });
    const del = await o.del(`/recipes/${r.id}/emoji`);
    expect(del.status).toBe(200);
    expect(del.json).toMatchObject({ id: r.id, emojis: [] });
    expect(await stored(r.id)).toEqual([]);
    expect((await o.del(`/recipes/${r.id}/emoji`)).status).toBe(200);
  });

  it.each([['ab'], ['🌶🌶'], ['👨‍👩‍👧‍👦'], [''], [7], [null]])('RE4 %j → 400 invalid_input with emojiError\'s message; nothing stored', async (emoji) => {
    const r = await soup();
    const res = await o.put(`/recipes/${r.id}/emoji`, { emoji });
    expect(res.status).toBe(400);
    expect(res.json).toEqual({ error: 'invalid_input', message: emojiError(emoji) });
    expect(await stored(r.id)).toEqual([]);
  });

  it('RE4 the family emoji is one grapheme over 16 bytes — the case above is the byte cap', () => {
    expect(new TextEncoder().encode('👨‍👩‍👧‍👦').length).toBeGreaterThan(16);
    expect([...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment('👨‍👩‍👧‍👦')]).toHaveLength(1);
  });

  it("RE5 another member's emoji is untouched by mine; each sets only their own", async () => {
    const r = await soup();
    await other.client.put(`/recipes/${r.id}/emoji`, { emoji: '⭐' });
    // the member comes from the session, never the body
    await o.put(`/recipes/${r.id}/emoji`, { emoji: '🌶', memberId: other.id });
    const both = [{ member_id: me, emoji: '🌶' }, { member_id: other.id, emoji: '⭐' }].sort((a, b) => (a.member_id < b.member_id ? -1 : 1));
    expect(await stored(r.id)).toEqual(both);
    expect((await o.get(`/recipes/${r.id}`)).json.emojis).toEqual(both.map((x) => ({ memberId: x.member_id, emoji: x.emoji })));
    await o.del(`/recipes/${r.id}/emoji`);
    expect(await stored(r.id)).toEqual([{ member_id: other.id, emoji: '⭐' }]);
  });

  it('RE6 a deleted recipe → 404 for PUT and DELETE; its emojis are kept but never shown', async () => {
    const r = await soup();
    await o.put(`/recipes/${r.id}/emoji`, { emoji: '🌶' });
    const live = await soup();
    expect((await o.del(`/recipes/${r.id}`)).status).toBe(204);
    expect((await o.put(`/recipes/${r.id}/emoji`, { emoji: '⭐' })).status).toBe(404);
    expect((await o.del(`/recipes/${r.id}/emoji`)).status).toBe(404);
    expect((await o.put('/recipes/rcp_nope/emoji', { emoji: '⭐' })).status).toBe(404);
    expect(await stored(r.id)).toEqual([{ member_id: me, emoji: '🌶' }]); // ⚑ Q75 kept
    expect((await o.get('/recipes')).json.map((x: Recipe) => x.id)).toEqual([live.id]);
  });

  it("RE7 an emoji write leaves the recipe's updatedAt alone", async () => {
    const r = await soup();
    const was = '2026-01-01T00:00:00.000Z';
    await env.DB.prepare('UPDATE recipes SET updated_at = ? WHERE id = ?').bind(was, r.id).run();
    expect((await o.put(`/recipes/${r.id}/emoji`, { emoji: '🌶' })).json.updatedAt).toBe(was);
    expect((await o.del(`/recipes/${r.id}/emoji`)).json.updatedAt).toBe(was);
    expect((await o.get(`/recipes/${r.id}`)).json.updatedAt).toBe(was);
  });

  it('no session → 401', async () => {
    const r = await soup();
    expect((await new Client().put(`/recipes/${r.id}/emoji`, { emoji: '🌶' })).status).toBe(401);
    expect((await new Client().del(`/recipes/${r.id}/emoji`)).status).toBe(401);
  });
});
