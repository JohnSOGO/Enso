// SPEC §7A, §10 — list item CRUD: adding to a list, editing / ticking an item, deleting one. Every add/re-open/duplicate
// decision is made by src/shared/lists.ts, who may change an item by src/shared/roles.ts; this route validates,
// persists and shapes the response. Items of a deleted list are unreachable: every item read and write joins
// lists.deleted_at IS NULL (L16). Deleting an item deletes its photo from R2 (§7A.3); the photo routes are
// routes/item-photos.ts. The list itself (its row, listParam, currentItems, itemView) is routes/lists.ts.
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { NOTE_MAX, TEXT_MAX, itemKey, renameClash, resolveAdd } from '../../shared/lists';
import { isTime } from '../../shared/time';
import type { ListAddResult } from '../../shared/vocab';
import { canChange, cannotChangeText } from '../../shared/roles';
import { first, newId, nowIso, run } from '../db';
import { body, fail, optStr, str } from '../http';
import { requireMember } from '../session';
import { type ItemRow, currentItems, itemView, listParam, loadItems } from './lists';

/** One non-deleted item on a non-deleted list. Shared with routes/item-photos.ts. */
export const loadItem = (db: D1Database, id: string) =>
  first<ItemRow>(db,
    `SELECT i.* FROM list_items i JOIN lists l ON l.id = i.list_id
      WHERE i.id = ? AND i.deleted_at IS NULL AND l.deleted_at IS NULL`, id);

const TEXT_MSG = `Item text must be 1–${TEXT_MAX} characters.`;
const NOTE_MSG = `A note can be at most ${NOTE_MAX} characters.`;
const TIME_MSG = 'time must be HH:MM (like 08:00), or null.';
export const ITEM_GONE = 'That item is no longer on the list.';

/** assigneeId: undefined = not given; null = the household; else an existing, non-disabled member. Returns an error message on a bad id. */
async function assigneeParam(db: D1Database, v: unknown): Promise<string | null | undefined | { error: string }> {
  if (v === undefined || v === null) return v;
  const m = typeof v === 'string' ? await first<{ id: string }>(db, 'SELECT id FROM members WHERE id = ? AND disabled_at IS NULL', v) : null;
  return m ? m.id : { error: 'assigneeId must be an active member of the household, or null.' };
}

/** time: undefined = not given; null = none; else 'HH:MM' (§7A.4). */
function timeParam(v: unknown): string | null | undefined | { error: string } {
  if (v === undefined || v === null) return v;
  return isTime(v) ? v : { error: TIME_MSG };
}

export const listItems = new Hono<AppEnv>();

listItems.post('/lists/:id/items', requireMember, async (c) => {
  const list = await listParam(c);
  if (list instanceof Response) return list;
  const b = await body(c);
  const text = str(b.text, TEXT_MAX);
  if (!text) return fail(c, 400, 'invalid_input', TEXT_MSG);
  const note = optStr(b.note, NOTE_MAX);
  if (b.note !== undefined && note === undefined) return fail(c, 400, 'invalid_input', NOTE_MSG);
  const assignee = await assigneeParam(c.env.DB, b.assigneeId);
  if (assignee && typeof assignee === 'object') return fail(c, 400, 'invalid_input', assignee.error);
  const time = timeParam(b.time);
  if (time && typeof time === 'object') return fail(c, 400, 'invalid_input', time.error);

  const me = c.get('member').id, now = nowIso();
  const decision = resolveAdd(text, await currentItems(c.env.DB, list));
  if (decision.kind === 'existing') return c.json({ item: itemView(decision.item), result: 'existing' satisfies ListAddResult });
  if (decision.kind === 'reopen') {
    await run(c.env.DB,
      'UPDATE list_items SET text = ?, text_key = ?, checked_at = NULL, checked_by = NULL, updated_at = ? WHERE id = ?',
      text, itemKey(text), now, decision.item.id);
    return c.json({ item: itemView((await loadItem(c.env.DB, decision.item.id))!), result: 'reopened' satisfies ListAddResult });
  }
  const id = newId('itm');
  await run(c.env.DB,
    `INSERT INTO list_items (id, list_id, text, text_key, note, assignee_id, time, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, list.id, text, decision.key, note ?? null, assignee ?? null, time ?? null, me, now, now);
  return c.json({ item: itemView((await loadItem(c.env.DB, id))!), result: 'added' satisfies ListAddResult }, 201);
});

listItems.patch('/list-items/:id', requireMember, async (c) => {
  const row = await loadItem(c.env.DB, c.req.param('id'));
  if (!row) return fail(c, 404, 'not_found', ITEM_GONE);
  const b = await body(c);
  // §6.3: checking or unchecking alone is anyone's tick; any other change is the creator's or an admin's.
  const tickOnly = Object.keys(b).length === 1 && 'checked' in b;
  if (!tickOnly && !canChange(row.created_by, c.get('member'))) return fail(c, 403, 'forbidden', cannotChangeText('item'));

  let text = row.text;
  if (b.text !== undefined) {
    const t = str(b.text, TEXT_MAX);
    if (!t) return fail(c, 400, 'invalid_input', TEXT_MSG);
    const clash = renameClash(row.id, t, await loadItems(c.env.DB, row.list_id));
    if (clash) return fail(c, 409, 'duplicate', `“${clash.text}” is already on this list.`);
    text = t;
  }
  const note = optStr(b.note, NOTE_MAX);
  if (b.note !== undefined && note === undefined) return fail(c, 400, 'invalid_input', NOTE_MSG);
  const assignee = await assigneeParam(c.env.DB, b.assigneeId);
  if (assignee && typeof assignee === 'object') return fail(c, 400, 'invalid_input', assignee.error);
  if (b.checked !== undefined && typeof b.checked !== 'boolean') return fail(c, 400, 'invalid_input', 'checked must be true or false.');
  const time = timeParam(b.time);
  if (time && typeof time === 'object') return fail(c, 400, 'invalid_input', time.error);

  const me = c.get('member').id, now = nowIso();
  const checkedAt = b.checked === undefined ? row.checked_at : b.checked ? now : null;
  const checkedBy = b.checked === undefined ? row.checked_by : b.checked ? me : null;
  await run(c.env.DB,
    `UPDATE list_items SET text = ?, text_key = ?, note = ?, assignee_id = ?, time = ?, checked_at = ?, checked_by = ?, updated_at = ?
      WHERE id = ?`,
    text, itemKey(text), note === undefined ? row.note : note, assignee === undefined ? row.assignee_id : assignee,
    time === undefined ? row.time : time, checkedAt, checkedBy, now, row.id);
  return c.json(itemView((await loadItem(c.env.DB, row.id))!));
});

listItems.delete('/list-items/:id', requireMember, async (c) => {
  const row = await loadItem(c.env.DB, c.req.param('id'));
  if (!row) return fail(c, 404, 'not_found', ITEM_GONE);
  if (!canChange(row.created_by, c.get('member'))) return fail(c, 403, 'forbidden', cannotChangeText('item'));
  const now = nowIso();
  const r = await run(c.env.DB,
    `UPDATE list_items SET deleted_at = ?, photo_key = NULL, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL AND list_id IN (SELECT id FROM lists WHERE deleted_at IS NULL)`,
    now, now, row.id);
  if (r.meta.changes !== 1) return fail(c, 404, 'not_found', ITEM_GONE);
  if (row.photo_key) await c.env.PHOTOS.delete(row.photo_key); // §7A.3: deleting an item deletes its photo
  return c.body(null, 204);
});
