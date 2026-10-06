// M4b + M4e acceptance — household lists (SPEC §7A.2, each row is a test) + the pure rules (§7A.1).
import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { Client, member, owner } from './helpers';
import {
  CHECKED_VISIBLE_DAYS, LISTS_MAX, LIST_NAME_MAX, SHOPPING_LIST_ID, TEXT_MAX,
  DEFAULT_LIST_EMOJI, checkedCutoff, defaultListEmoji, itemKey, listEmoji, listNameClash, renameClash, resolveAdd, visibleItems,
} from '../src/shared/lists';

describe('list rules (pure)', () => {
  it('itemKey trims, lower-cases and collapses inner whitespace (not ASCII-only)', () => {
    expect(itemKey('  Milk ')).toBe('milk');
    expect(itemKey('Batteries \t  AA')).toBe('batteries aa');
    expect(itemKey('ÄPFEL')).toBe(itemKey('äpfel'));
  });

  const items = [
    { id: 'a', text_key: 'milk', checked_at: null, updated_at: '2026-10-01T00:00:00.000Z' },
    { id: 'b', text_key: 'eggs', checked_at: '2026-10-02T00:00:00.000Z', updated_at: '2026-10-02T00:00:00.000Z' },
  ];

  it('resolveAdd: open match → existing, checked match → reopen, otherwise insert', () => {
    expect(resolveAdd(' MILK', items)).toEqual({ kind: 'existing', item: items[0] });
    expect(resolveAdd('Eggs', items)).toEqual({ kind: 'reopen', item: items[1] });
    expect(resolveAdd('Bread  Rolls', items)).toEqual({ kind: 'insert', key: 'bread rolls' });
  });

  it('renameClash ignores the item itself', () => {
    expect(renameClash('a', 'MILK', items)).toBeNull();
    expect(renameClash('b', 'milk', items)?.id).toBe('a');
  });

  it('listNameClash keys names like items and ignores the list itself', () => {
    const lists = [{ id: 'lst_a', name_key: 'hardware store' }];
    expect(listNameClash(null, ' Hardware  STORE ', lists)?.id).toBe('lst_a');
    expect(listNameClash('lst_a', 'hardware store', lists)).toBeNull();
    expect(listNameClash(null, 'Garden', lists)).toBeNull();
  });

  it('defaultListEmoji picks from the name (⚑ Q157); listEmoji prefers the list\'s own', () => {
    expect(defaultListEmoji('Shopping')).toBe('🛒');
    expect(defaultListEmoji('Wish list')).toBe('🎁');
    expect(defaultListEmoji('HARDWARE store')).toBe('🛒'); // the first keyword in the table wins: "store"
    expect(defaultListEmoji('Hardware')).toBe('🔨');
    expect(defaultListEmoji('Camping trip')).toBe('🧳');
    expect(defaultListEmoji('Odds and ends')).toBe(DEFAULT_LIST_EMOJI);
    expect(listEmoji({ name: 'Shopping', emoji: null })).toBe('🛒');
    expect(listEmoji({ name: 'Shopping', emoji: '🛍️' })).toBe('🛍️');
  });

  it(`visibleItems hides checked items older than ${CHECKED_VISIBLE_DAYS} days`, () => {
    const now = '2026-10-31T12:00:00.000Z';
    expect(checkedCutoff(now)).toBe('2026-10-01T12:00:00.000Z');
    const v = visibleItems(items, now);
    expect(v.open.map((i) => i.id)).toEqual(['a']);
    expect(v.checked.map((i) => i.id)).toEqual(['b']);
    expect(visibleItems(items, '2026-11-02T00:00:00.000Z').checked).toEqual([]);
  });
});

const WISHLIST = 'lst_wishlist';

describe('M4b + M4e lists API (§7A.2)', () => {
  let o: Client;
  beforeEach(async () => {
    // Back to the migrated state: no items, only the two seeded lists, both live.
    await env.DB.exec('DELETE FROM list_items; DELETE FROM lists WHERE created_by IS NOT NULL; UPDATE lists SET deleted_at = NULL');
    o = await owner();
  });
  const add = (text: string, list = SHOPPING_LIST_ID, extra: object = {}) => o.post(`/lists/${list}/items`, { text, ...extra });
  const shopping = async () => (await o.get(`/lists/${SHOPPING_LIST_ID}`)).json;

  it('L1 add "Milk" to shopping → 201 added, open', async () => {
    const r = await add('Milk');
    expect(r.status).toBe(201);
    expect(r.json.result).toBe('added');
    expect(r.json.item).toMatchObject({ listId: SHOPPING_LIST_ID, text: 'Milk', checkedAt: null, assigneeId: null });
    expect((await shopping()).open.map((i: any) => i.id)).toEqual([r.json.item.id]);
  });

  it('L2 add "  milk " → 200 existing, same id, still one open item', async () => {
    const a = await add('Milk');
    const r = await add('  milk ');
    expect(r.status).toBe(200);
    expect(r.json.result).toBe('existing');
    expect(r.json.item.id).toBe(a.json.item.id);
    expect(r.json.item.text).toBe('Milk');
    expect((await shopping()).open).toHaveLength(1);
  });

  it('L3 check it → moves from open to checked, checkedBy = me', async () => {
    const a = await add('Milk');
    const me = (await o.get('/me')).json.id;
    const p = await o.patch(`/list-items/${a.json.item.id}`, { checked: true });
    expect(p.status).toBe(200);
    const l = await shopping();
    expect(l.open).toEqual([]);
    expect(l.checked).toHaveLength(1);
    expect(l.checked[0]).toMatchObject({ id: a.json.item.id, checkedBy: me });
    expect(l.checked[0].checkedAt).toBeTruthy();
  });

  it('L4 add "MILK" while checked → 200 reopened, same id, open, text "MILK"', async () => {
    const a = await add('Milk');
    await o.patch(`/list-items/${a.json.item.id}`, { checked: true });
    const r = await add('MILK');
    expect(r.status).toBe(200);
    expect(r.json.result).toBe('reopened');
    expect(r.json.item).toMatchObject({ id: a.json.item.id, text: 'MILK', checkedAt: null, checkedBy: null });
    expect((await shopping()).open.map((i: any) => i.text)).toEqual(['MILK']);
  });

  it('L5 check, then PATCH checked: false → open again', async () => {
    const a = await add('Milk');
    await o.patch(`/list-items/${a.json.item.id}`, { checked: true });
    const p = await o.patch(`/list-items/${a.json.item.id}`, { checked: false });
    expect(p.json).toMatchObject({ checkedAt: null, checkedBy: null });
    const l = await shopping();
    expect(l.open.map((i: any) => i.id)).toEqual([a.json.item.id]);
    expect(l.checked).toEqual([]);
  });

  it('L6 add "" or 121 characters → 400 invalid_input with a message', async () => {
    for (const text of ['', 'x'.repeat(TEXT_MAX + 1)]) {
      const r = await add(text);
      expect(r.status).toBe(400);
      expect(r.json.error).toBe('invalid_input');
      expect(r.json.message).toBeTruthy();
    }
    expect((await add('x'.repeat(TEXT_MAX))).status).toBe(201);
  });

  it('L7 GET /lists/{an id that does not exist} → 404 not_found with a message', async () => {
    const r = await o.get('/lists/lst_nosuchlist');
    expect(r.status).toBe(404);
    expect(r.json.error).toBe('not_found');
    expect(r.json.message).toBeTruthy();
  });

  it('L8 an item with an unknown or disabled assigneeId → 400 invalid_input', async () => {
    const r = await add('Paint the fence', WISHLIST, { assigneeId: 'mem_nobody' });
    expect(r.status).toBe(400);
    expect(r.json.error).toBe('invalid_input');
    expect(r.json.message).toBeTruthy();
    const gone = await member(o);
    await o.patch(`/members/${gone.id}`, { disabled: true });
    const d = await add('Paint the fence', SHOPPING_LIST_ID, { assigneeId: gone.id });
    expect(d.status).toBe(400);
    expect(d.json.error).toBe('invalid_input');
    const m = await member(o);
    const ok = await add('Paint the fence', WISHLIST, { assigneeId: m.id, note: 'White, two coats' });
    expect(ok.status).toBe(201);
    expect(ok.json.item).toMatchObject({ listId: WISHLIST, assigneeId: m.id, note: 'White, two coats' });
    const p = await o.patch(`/list-items/${ok.json.item.id}`, { assigneeId: gone.id });
    expect(p.status).toBe(400);
    expect(p.json.error).toBe('invalid_input');
  });

  it('L9 an item checked 31 days ago is absent from checked; adding its text re-opens it', async () => {
    const a = await add('Batteries AA');
    await o.patch(`/list-items/${a.json.item.id}`, { checked: true });
    const old = new Date(Date.now() - 31 * 86_400_000).toISOString();
    await env.DB.prepare('UPDATE list_items SET checked_at = ? WHERE id = ?').bind(old, a.json.item.id).run();
    const l = await shopping();
    expect(l.checked).toEqual([]);
    expect(l.open).toEqual([]);
    const r = await add('batteries aa');
    expect(r.status).toBe(200);
    expect(r.json.result).toBe('reopened');
    expect(r.json.item.id).toBe(a.json.item.id);
  });

  it('L10 delete, then add the same text → 201, a new id', async () => {
    const a = await add('Milk');
    const d = await o.del(`/list-items/${a.json.item.id}`);
    expect(d.status).toBe(204);
    expect((await shopping()).open).toEqual([]);
    const r = await add('Milk');
    expect(r.status).toBe(201);
    expect(r.json.result).toBe('added');
    expect(r.json.item.id).not.toBe(a.json.item.id);
  });

  it('L11 rename "Eggs" to "milk" while Milk exists → 409 duplicate', async () => {
    await add('Milk');
    const e = await add('Eggs');
    const r = await o.patch(`/list-items/${e.json.item.id}`, { text: 'milk' });
    expect(r.status).toBe(409);
    expect(r.json.error).toBe('duplicate');
    expect(r.json.message).toBe('“Milk” is already on this list.');
    // Re-spelling an item as itself is not a clash.
    expect((await o.patch(`/list-items/${e.json.item.id}`, { text: 'EGGS' })).json.text).toBe('EGGS');
  });

  it('L12 any list call without a session → 401', async () => {
    const a = await add('Milk');
    const anon = new Client();
    const calls = [
      anon.get('/lists'),
      anon.post('/lists', { name: 'Garden' }),
      anon.patch(`/lists/${SHOPPING_LIST_ID}`, { name: 'Groceries' }),
      anon.del(`/lists/${SHOPPING_LIST_ID}`),
      anon.get(`/lists/${SHOPPING_LIST_ID}`),
      anon.post(`/lists/${SHOPPING_LIST_ID}/items`, { text: 'Bread' }),
      anon.patch(`/list-items/${a.json.item.id}`, { checked: true }),
      anon.del(`/list-items/${a.json.item.id}`),
    ];
    for (const r of await Promise.all(calls)) expect(r.status).toBe(401);
  });

  const lists = async (c: Client = o) => (await c.get('/lists')).json as { id: string; name: string; createdBy: string | null; openCount: number }[];

  it('L13 POST /lists { name: "Hardware store" } → 201; in GET /lists with openCount 0', async () => {
    const me = (await o.get('/me')).json.id;
    const r = await o.post('/lists', { name: '  Hardware store ' });
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ name: 'Hardware store', createdBy: me });
    expect(r.json.id).toMatch(/^lst_/);
    await add('Milk');
    const all = await lists();
    expect(all.map((l) => l.name)).toEqual(['Hardware store', 'Shopping', 'Wish list']);
    expect(all.find((l) => l.id === r.json.id)).toEqual({ id: r.json.id, name: 'Hardware store', emoji: null, createdBy: me, openCount: 0 });
    expect(all.find((l) => l.id === SHOPPING_LIST_ID)?.openCount).toBe(1);
    expect((await o.get(`/lists/${r.json.id}`)).json).toEqual({ list: { id: r.json.id, name: 'Hardware store', emoji: null, createdBy: me }, open: [], checked: [] });
  });

  it('L14 POST /lists { name: " hardware  STORE " } → 409 duplicate', async () => {
    await o.post('/lists', { name: 'Hardware store' });
    const r = await o.post('/lists', { name: ' hardware  STORE ' });
    expect(r.status).toBe(409);
    expect(r.json.error).toBe('duplicate');
    expect(r.json.message).toBe('There is already a list called “Hardware store”.');
    expect((await o.post('/lists', { name: 'SHOPPING' })).json.message).toBe('There is already a list called “Shopping”.');
  });

  it('L15 rename as a member who did not create it / as its creator / as an admin → 403 / 200 / 200', async () => {
    const creator = await member(o), other = await member(o);
    const l = await creator.client.post('/lists', { name: 'Hardware store' });
    const no = await other.client.patch(`/lists/${l.json.id}`, { name: 'Garden centre' });
    expect(no.status).toBe(403);
    expect(no.json.error).toBe('forbidden');
    expect(no.json.message).toBeTruthy();
    expect((await other.client.del(`/lists/${l.json.id}`)).status).toBe(403);
    const mine = await creator.client.patch(`/lists/${l.json.id}`, { name: 'Garden centre' });
    expect(mine.status).toBe(200);
    expect(mine.json.name).toBe('Garden centre');
    const admin = await o.patch(`/lists/${l.json.id}`, { name: 'Hardware store' });
    expect(admin.status).toBe(200);
    expect(admin.json).toMatchObject({ id: l.json.id, name: 'Hardware store', createdBy: creator.id });
    // Re-spelling a list as itself is not a clash; taking another list's name is.
    expect((await o.patch(`/lists/${l.json.id}`, { name: 'HARDWARE store' })).status).toBe(200);
    expect((await o.patch(`/lists/${l.json.id}`, { name: 'wish list' })).status).toBe(409);
  });

  it('L16 delete it → gone from GET /lists; GET 404; PATCH of its item 404; the name can be used again', async () => {
    const l = await o.post('/lists', { name: 'Hardware store' });
    const i = await add('Nails', l.json.id);
    expect((await o.del(`/lists/${l.json.id}`)).status).toBe(204);
    expect((await lists()).map((x) => x.id)).not.toContain(l.json.id);
    const g = await o.get(`/lists/${l.json.id}`);
    expect(g.status).toBe(404);
    expect(g.json.error).toBe('not_found');
    expect(g.json.message).toBeTruthy();
    expect((await o.patch(`/list-items/${i.json.item.id}`, { checked: true })).status).toBe(404);
    expect((await o.del(`/list-items/${i.json.item.id}`)).status).toBe(404);
    expect((await add('Screws', l.json.id)).status).toBe(404);
    expect((await o.patch(`/lists/${l.json.id}`, { name: 'Again' })).status).toBe(404);
    expect((await o.del(`/lists/${l.json.id}`)).status).toBe(404);
    const again = await o.post('/lists', { name: 'Hardware store' });
    expect(again.status).toBe(201);
    expect(again.json.id).not.toBe(l.json.id);
    expect((await o.get(`/lists/${again.json.id}`)).json.open).toEqual([]);
  });

  it('L17 assign an item to member M, then to null → assigneeId M, then null', async () => {
    const m = await member(o);
    const a = await add('Milk');
    const p = await o.patch(`/list-items/${a.json.item.id}`, { assigneeId: m.id });
    expect(p.status).toBe(200);
    expect(p.json.assigneeId).toBe(m.id);
    // Leaving assigneeId out keeps it.
    expect((await o.patch(`/list-items/${a.json.item.id}`, { text: 'Oat milk' })).json.assigneeId).toBe(m.id);
    const n = await o.patch(`/list-items/${a.json.item.id}`, { assigneeId: null });
    expect(n.status).toBe(200);
    expect(n.json.assigneeId).toBeNull();
  });

  it('L18 a member renames or deletes the seeded Shopping list → 403; an admin may', async () => {
    const m = await member(o);
    for (const r of [await m.client.patch(`/lists/${SHOPPING_LIST_ID}`, { name: 'Groceries' }), await m.client.del(`/lists/${SHOPPING_LIST_ID}`)]) {
      expect(r.status).toBe(403);
      expect(r.json.error).toBe('forbidden');
      expect(r.json.message).toBeTruthy();
    }
    const r = await o.patch(`/lists/${SHOPPING_LIST_ID}`, { name: 'Groceries' });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ id: SHOPPING_LIST_ID, name: 'Groceries', createdBy: null });
    expect((await o.del(`/lists/${SHOPPING_LIST_ID}`)).status).toBe(204);
    expect((await lists()).map((l) => l.id)).toEqual([WISHLIST]);
  });

  it('L19 name "" / 41 characters / a 31st list → 400 invalid_input with a message', async () => {
    for (const name of ['', '   ', 'x'.repeat(LIST_NAME_MAX + 1), undefined]) {
      const r = await o.post('/lists', { name });
      expect(r.status).toBe(400);
      expect(r.json.error).toBe('invalid_input');
      expect(r.json.message).toBeTruthy();
    }
    const l = await o.post('/lists', { name: 'x'.repeat(LIST_NAME_MAX) });
    expect(l.status).toBe(201);
    expect((await o.patch(`/lists/${l.json.id}`, { name: '' })).status).toBe(400);
    const have = (await lists()).length;
    for (let i = have; i < LISTS_MAX; i++) expect((await o.post('/lists', { name: `List ${i}` })).status).toBe(201);
    expect(await lists()).toHaveLength(LISTS_MAX);
    const r = await o.post('/lists', { name: 'One too many' });
    expect(r.status).toBe(400);
    expect(r.json.error).toBe('invalid_input');
    expect(r.json.message).toMatch(String(LISTS_MAX));
  });

  it('L21 POST /lists with an emoji → 201 carrying it; GET /lists carries it', async () => {
    const r = await o.post('/lists', { name: 'Costco', emoji: '🛍️' });
    expect(r.status).toBe(201);
    expect(r.json.emoji).toBe('🛍️');
    expect((await lists()).find((l) => l.id === r.json.id)).toMatchObject({ name: 'Costco', emoji: '🛍️' });
    expect((await lists()).find((l) => l.id === SHOPPING_LIST_ID)).toMatchObject({ emoji: null });
  });

  it('L22 PATCH a bad emoji → 400; emoji null → back to the default; absent → unchanged', async () => {
    const l = (await o.post('/lists', { name: 'Costco', emoji: '🛍️' })).json;
    for (const emoji of ['ab', '🛒🛒', 7]) {
      const r = await o.patch(`/lists/${l.id}`, { name: 'Costco', emoji });
      expect(r.status).toBe(400);
      expect(r.json).toMatchObject({ error: 'invalid_input', message: 'Emoji must be a single emoji, like 🧹.' });
    }
    expect((await o.post('/lists', { name: 'Bad', emoji: 'x' })).status).toBe(400);
    expect((await o.patch(`/lists/${l.id}`, { name: 'Costco run' })).json.emoji).toBe('🛍️');
    expect((await o.patch(`/lists/${l.id}`, { name: 'Costco run', emoji: null })).json).toMatchObject({ name: 'Costco run', emoji: null });
  });
});
