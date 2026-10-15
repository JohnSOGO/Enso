// SPEC §7A, §10 — household lists: list CRUD and reading one list. Who may rename/delete a list is decided
// by src/shared/roles.ts; this route validates, persists and shapes the response. Item writes are
// routes/list-items.ts, which builds on the item row, itemView, currentItems and listParam exported here.
// Deleting a list deletes its items' photos from R2 (§7A.3); the photo routes are routes/item-photos.ts.
import { Hono, type Context } from 'hono';
import type { AppEnv } from '../env';
import { LISTS_MAX, LIST_NAME_MAX, dailyOrder, itemKey, listNameClash, todaysItems, visibleItems } from '../../shared/lists';
import { dayStartUtc } from '../../shared/time';
import { emojiError } from '../../shared/emoji';
import { canChange } from '../../shared/roles';
import { all, first, householdTz, newId, nowIso, run } from '../db';
import { body, fail } from '../http';
import { requireMember } from '../session';

interface ListRow {
  id: string; name: string; name_key: string; emoji: string | null; created_by: string | null; daily: number; ping_owners: number;
  created_at: string; updated_at: string; deleted_at: string | null;
}

export interface ItemRow {
  id: string; list_id: string; text: string; text_key: string; note: string | null; assignee_id: string | null;
  created_by: string; created_at: string; updated_at: string;
  checked_at: string | null; checked_by: string | null; deleted_at: string | null; photo_key: string | null; time: string | null;
}

const listView = (l: ListRow) => ({
  id: l.id, name: l.name, emoji: l.emoji, createdBy: l.created_by, daily: l.daily === 1, pingOwners: l.ping_owners === 1,
});

export const itemView = (r: ItemRow) => ({
  id: r.id, listId: r.list_id, text: r.text, note: r.note, assigneeId: r.assignee_id, time: r.time, createdBy: r.created_by,
  createdAt: r.created_at, checkedAt: r.checked_at, checkedBy: r.checked_by,
  hasPhoto: r.photo_key !== null, updatedAt: r.updated_at, // §7A.3: the photo's key is never on the wire
});

const loadLists = (db: D1Database) => all<ListRow>(db, 'SELECT * FROM lists WHERE deleted_at IS NULL');
const loadList = (db: D1Database, id: string) => first<ListRow>(db, 'SELECT * FROM lists WHERE id = ? AND deleted_at IS NULL', id);
/** A list's non-deleted items. Callers have already found the list itself non-deleted. */
export const loadItems = (db: D1Database, listId: string) =>
  all<ItemRow>(db, 'SELECT * FROM list_items WHERE list_id = ? AND deleted_at IS NULL', listId);
/** §7A.4 — today's local midnight (UTC), where an every day list's ticks start. */
const dayStartOf = async (db: D1Database) => dayStartUtc(nowIso(), await householdTz(db));
/** A list's items as they stand now: on an every day list, a tick from before today reads as open. */
export const currentItems = async (db: D1Database, list: ListRow) => {
  const items = await loadItems(db, list.id);
  return list.daily ? todaysItems(items, await dayStartOf(db)) : items;
};

/** R2 deletes at most this many keys in one call. */
const R2_DELETE_MAX = 1000;

const NAME_MSG = `A list name must be 1–${LIST_NAME_MAX} characters.`;
const LIST_GONE = 'That list no longer exists.';

/** A list name: trimmed, 1–LIST_NAME_MAX characters; null otherwise. */
function listName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length >= 1 && t.length <= LIST_NAME_MAX ? t : null;
}

/** emoji: undefined = not given; null = the default from the name; else one emoji (§7A.1). */
function emojiParam(v: unknown): string | null | undefined | { error: string } {
  if (v === undefined || v === null) return v;
  const err = emojiError(v);
  return err ? { error: err } : v as string;
}

/** The :id list (non-deleted), else a 404 with a message. */
export async function listParam(c: Context<AppEnv>): Promise<ListRow | Response> {
  return (await loadList(c.env.DB, c.req.param('id')!)) ?? fail(c, 404, 'not_found', LIST_GONE);
}

/** A list setting (§7A.4): undefined = unchanged, else 0/1; a non-boolean → an error. */
function flagParam(v: unknown, name: string, was: number): number | { error: string } {
  if (v === undefined) return was;
  return typeof v === 'boolean' ? Number(v) : { error: `${name} must be true or false.` };
}

export const lists = new Hono<AppEnv>();

// ── Lists ──────────────────────────────────────────────────────────────

lists.get('/lists', requireMember, async (c) => {
  const db = c.env.DB;
  const rows = await loadLists(db);
  // Counted here, not in SQL, so an every day list's count uses the one rule for today (todaysItems, §7A.4).
  const items = await all<{ list_id: string; checked_at: string | null }>(db,
    'SELECT list_id, checked_at FROM list_items WHERE deleted_at IS NULL');
  const dayStart = rows.some((l) => l.daily) ? await dayStartOf(db) : '';
  const openCount = (l: ListRow) => {
    const mine = items.filter((i) => i.list_id === l.id);
    return (l.daily ? todaysItems(mine, dayStart) : mine).filter((i) => i.checked_at === null).length;
  };
  rows.sort((a, b) => a.name_key.localeCompare(b.name_key) || a.name.localeCompare(b.name));
  return c.json(rows.map((l) => ({ ...listView(l), openCount: openCount(l) })));
});

lists.post('/lists', requireMember, async (c) => {
  const b = await body(c);
  const name = listName(b.name);
  if (!name) return fail(c, 400, 'invalid_input', NAME_MSG);
  const emoji = emojiParam(b.emoji);
  if (typeof emoji === 'object' && emoji !== null) return fail(c, 400, 'invalid_input', emoji.error);
  const existing = await loadLists(c.env.DB);
  const clash = listNameClash(null, name, existing);
  if (clash) return fail(c, 409, 'duplicate', `There is already a list called “${clash.name}”.`);
  if (existing.length >= LISTS_MAX) return fail(c, 400, 'invalid_input', `The household can have at most ${LISTS_MAX} lists. Delete one first.`);

  const id = newId('lst'), now = nowIso();
  await run(c.env.DB,
    'INSERT INTO lists (id, name, name_key, emoji, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id, name, itemKey(name), emoji ?? null, c.get('member').id, now, now);
  return c.json(listView((await loadList(c.env.DB, id))!), 201);
});

lists.patch('/lists/:id', requireMember, async (c) => {
  const list = await listParam(c);
  if (list instanceof Response) return list;
  if (!canChange(list.created_by, c.get('member'))) {
    return fail(c, 403, 'forbidden', list.created_by ? 'Only the person who made this list or an admin can rename it.' : 'Only an admin can rename this list.');
  }
  const b = await body(c);
  const name = listName(b.name);
  if (!name) return fail(c, 400, 'invalid_input', NAME_MSG);
  const emoji = emojiParam(b.emoji);
  if (typeof emoji === 'object' && emoji !== null) return fail(c, 400, 'invalid_input', emoji.error);
  const daily = flagParam(b.daily, 'daily', list.daily);
  if (typeof daily === 'object') return fail(c, 400, 'invalid_input', daily.error);
  const ping = flagParam(b.pingOwners, 'pingOwners', list.ping_owners);
  if (typeof ping === 'object') return fail(c, 400, 'invalid_input', ping.error);
  const clash = listNameClash(list.id, name, await loadLists(c.env.DB));
  if (clash) return fail(c, 409, 'duplicate', `There is already a list called “${clash.name}”.`);
  await run(c.env.DB, 'UPDATE lists SET name = ?, name_key = ?, emoji = ?, daily = ?, ping_owners = ?, updated_at = ? WHERE id = ?',
    name, itemKey(name), emoji === undefined ? list.emoji : emoji, daily, ping, nowIso(), list.id);
  return c.json(listView((await loadList(c.env.DB, list.id))!));
});

lists.delete('/lists/:id', requireMember, async (c) => {
  const list = await listParam(c);
  if (list instanceof Response) return list;
  if (!canChange(list.created_by, c.get('member'))) {
    return fail(c, 403, 'forbidden', list.created_by ? 'Only the person who made this list or an admin can delete it.' : 'Only an admin can delete this list.');
  }
  const db = c.env.DB, now = nowIso();
  // §7A.3: its items' photos go with it — the keys read, cleared with the list's delete, then the objects removed.
  const keys = (await all<{ photo_key: string }>(db,
    'SELECT photo_key FROM list_items WHERE list_id = ? AND photo_key IS NOT NULL', list.id)).map((r) => r.photo_key);
  await db.batch([
    db.prepare('UPDATE list_items SET photo_key = NULL WHERE list_id = ? AND photo_key IS NOT NULL').bind(list.id),
    db.prepare('UPDATE lists SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL').bind(now, now, list.id),
  ]);
  for (let i = 0; i < keys.length; i += R2_DELETE_MAX) await c.env.PHOTOS.delete(keys.slice(i, i + R2_DELETE_MAX));
  return c.body(null, 204);
});

lists.get('/lists/:id', requireMember, async (c) => {
  const list = await listParam(c);
  if (list instanceof Response) return list;
  const { open, checked } = visibleItems(await currentItems(c.env.DB, list), nowIso());
  return c.json({ list: listView(list), open: (list.daily ? dailyOrder(open) : open).map(itemView), checked: checked.map(itemView) });
});
