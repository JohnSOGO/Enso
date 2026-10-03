// SPEC §7A, §10 — the two household lists: item CRUD. Every add/re-open/duplicate decision
// is made by src/shared/lists.ts; this route validates, persists and shapes the response.
import { Hono, type Context } from 'hono';
import type { AppEnv } from '../env';
import { LIST, isOneOf, type List } from '../../shared/vocab';
import { NOTE_MAX, TEXT_MAX, itemKey, renameClash, resolveAdd, visibleItems } from '../../shared/lists';
import { all, first, newId, nowIso, run } from '../db';
import { body, fail, optStr, str } from '../http';
import { requireMember } from '../session';

interface ItemRow {
  id: string; list: List; text: string; text_key: string; note: string | null; owner_id: string | null;
  created_by: string; created_at: string; updated_at: string;
  checked_at: string | null; checked_by: string | null; deleted_at: string | null;
}

const itemView = (r: ItemRow) => ({
  id: r.id, list: r.list, text: r.text, note: r.note, ownerId: r.owner_id, createdBy: r.created_by,
  createdAt: r.created_at, checkedAt: r.checked_at, checkedBy: r.checked_by,
});

const loadList = (db: D1Database, list: List) =>
  all<ItemRow>(db, 'SELECT * FROM list_items WHERE list = ? AND deleted_at IS NULL', list);
const loadItem = (db: D1Database, id: string) =>
  first<ItemRow>(db, 'SELECT * FROM list_items WHERE id = ? AND deleted_at IS NULL', id);

const TEXT_MSG = `Item text must be 1–${TEXT_MAX} characters.`;
const NOTE_MSG = `A note can be at most ${NOTE_MAX} characters.`;

/** :list must be one of LIST, else 404 with a message. */
function listParam(c: Context<AppEnv>): List | Response {
  const list = c.req.param('list');
  return isOneOf(LIST, list) ? list : fail(c, 404, 'not_found', `There is no list called “${list}”. Lists: ${LIST.join(', ')}.`);
}

/** ownerId: undefined = not given; null = household; else an existing, non-disabled member. Returns an error message on a bad id. */
async function ownerParam(db: D1Database, v: unknown): Promise<string | null | undefined | { error: string }> {
  if (v === undefined || v === null) return v;
  const m = typeof v === 'string' ? await first<{ id: string }>(db, 'SELECT id FROM members WHERE id = ? AND disabled_at IS NULL', v) : null;
  return m ? m.id : { error: 'ownerId must be an active member of the household, or null.' };
}

export const lists = new Hono<AppEnv>();

lists.get('/lists/:list', requireMember, async (c) => {
  const list = listParam(c);
  if (list instanceof Response) return list;
  const { open, checked } = visibleItems(await loadList(c.env.DB, list), nowIso());
  return c.json({ open: open.map(itemView), checked: checked.map(itemView) });
});

lists.post('/lists/:list/items', requireMember, async (c) => {
  const list = listParam(c);
  if (list instanceof Response) return list;
  const b = await body(c);
  const text = str(b.text, TEXT_MAX);
  if (!text) return fail(c, 400, 'invalid_input', TEXT_MSG);
  const note = optStr(b.note, NOTE_MAX);
  if (b.note !== undefined && note === undefined) return fail(c, 400, 'invalid_input', NOTE_MSG);
  const owner = list === 'wishlist' ? await ownerParam(c.env.DB, b.ownerId) : null;
  if (owner && typeof owner === 'object') return fail(c, 400, 'invalid_input', owner.error);

  const me = c.get('member').id, now = nowIso();
  const decision = resolveAdd(text, await loadList(c.env.DB, list));
  if (decision.kind === 'existing') return c.json({ item: itemView(decision.item), result: 'existing' });
  if (decision.kind === 'reopen') {
    await run(c.env.DB,
      'UPDATE list_items SET text = ?, text_key = ?, checked_at = NULL, checked_by = NULL, updated_at = ? WHERE id = ?',
      text, itemKey(text), now, decision.item.id);
    return c.json({ item: itemView((await loadItem(c.env.DB, decision.item.id))!), result: 'reopened' });
  }
  const id = newId('itm');
  await run(c.env.DB,
    `INSERT INTO list_items (id, list, text, text_key, note, owner_id, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, list, text, decision.key, note ?? null, owner ?? null, me, now, now);
  return c.json({ item: itemView((await loadItem(c.env.DB, id))!), result: 'added' }, 201);
});

lists.patch('/list-items/:id', requireMember, async (c) => {
  const row = await loadItem(c.env.DB, c.req.param('id'));
  if (!row) return fail(c, 404, 'not_found', 'That item is no longer on the list.');
  const b = await body(c);

  let text = row.text;
  if (b.text !== undefined) {
    const t = str(b.text, TEXT_MAX);
    if (!t) return fail(c, 400, 'invalid_input', TEXT_MSG);
    const clash = renameClash(row.id, t, await loadList(c.env.DB, row.list));
    if (clash) return fail(c, 409, 'duplicate', `“${clash.text}” is already on this list.`);
    text = t;
  }
  const note = optStr(b.note, NOTE_MAX);
  if (b.note !== undefined && note === undefined) return fail(c, 400, 'invalid_input', NOTE_MSG);
  const owner = row.list === 'wishlist' ? await ownerParam(c.env.DB, b.ownerId) : undefined;
  if (owner && typeof owner === 'object') return fail(c, 400, 'invalid_input', owner.error);
  if (b.checked !== undefined && typeof b.checked !== 'boolean') return fail(c, 400, 'invalid_input', 'checked must be true or false.');

  const me = c.get('member').id, now = nowIso();
  const checkedAt = b.checked === undefined ? row.checked_at : b.checked ? now : null;
  const checkedBy = b.checked === undefined ? row.checked_by : b.checked ? me : null;
  await run(c.env.DB,
    `UPDATE list_items SET text = ?, text_key = ?, note = ?, owner_id = ?, checked_at = ?, checked_by = ?, updated_at = ?
      WHERE id = ?`,
    text, itemKey(text), note === undefined ? row.note : note, owner === undefined ? row.owner_id : owner,
    checkedAt, checkedBy, now, row.id);
  return c.json(itemView((await loadItem(c.env.DB, row.id))!));
});

lists.delete('/list-items/:id', requireMember, async (c) => {
  const now = nowIso();
  const r = await run(c.env.DB, 'UPDATE list_items SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL', now, now, c.req.param('id'));
  if (r.meta.changes !== 1) return fail(c, 404, 'not_found', 'That item is no longer on the list.');
  return c.body(null, 204);
});
