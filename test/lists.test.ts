// M4b acceptance — household lists (SPEC §7A.2, each row is a test) + the pure rules (§7A.1).
import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { Client, member, owner } from './helpers';
import { CHECKED_VISIBLE_DAYS, TEXT_MAX, checkedCutoff, itemKey, renameClash, resolveAdd, visibleItems } from '../src/shared/lists';

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

  it(`visibleItems hides checked items older than ${CHECKED_VISIBLE_DAYS} days`, () => {
    const now = '2026-10-31T12:00:00.000Z';
    expect(checkedCutoff(now)).toBe('2026-10-01T12:00:00.000Z');
    const v = visibleItems(items, now);
    expect(v.open.map((i) => i.id)).toEqual(['a']);
    expect(v.checked.map((i) => i.id)).toEqual(['b']);
    expect(visibleItems(items, '2026-11-02T00:00:00.000Z').checked).toEqual([]);
  });
});

describe('M4b lists API (§7A.2)', () => {
  let o: Client;
  beforeEach(async () => {
    await env.DB.exec('DELETE FROM list_items');
    o = await owner();
  });
  const add = (text: string, list = 'shopping', extra: object = {}) => o.post(`/lists/${list}/items`, { text, ...extra });
  const shopping = async () => (await o.get('/lists/shopping')).json;

  it('L1 add "Milk" to shopping → 201 added, open', async () => {
    const r = await add('Milk');
    expect(r.status).toBe(201);
    expect(r.json.result).toBe('added');
    expect(r.json.item).toMatchObject({ list: 'shopping', text: 'Milk', checkedAt: null });
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

  it('L7 GET /lists/groceries → 404 not_found with a message', async () => {
    const r = await o.get('/lists/groceries');
    expect(r.status).toBe(404);
    expect(r.json.error).toBe('not_found');
    expect(r.json.message).toMatch(/groceries/);
  });

  it('L8 wish list item with an unknown ownerId → 400 invalid_input', async () => {
    const r = await add('Paint the fence', 'wishlist', { ownerId: 'mem_nobody' });
    expect(r.status).toBe(400);
    expect(r.json.error).toBe('invalid_input');
    expect(r.json.message).toBeTruthy();
    const m = await member(o);
    const ok = await add('Paint the fence', 'wishlist', { ownerId: m.id, note: 'White, two coats' });
    expect(ok.status).toBe(201);
    expect(ok.json.item).toMatchObject({ ownerId: m.id, note: 'White, two coats' });
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
      anon.get('/lists/shopping'),
      anon.post('/lists/shopping/items', { text: 'Bread' }),
      anon.patch(`/list-items/${a.json.item.id}`, { checked: true }),
      anon.del(`/list-items/${a.json.item.id}`),
    ];
    for (const r of await Promise.all(calls)) expect(r.status).toBe(401);
  });
});
