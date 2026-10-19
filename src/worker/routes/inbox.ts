// SPEC §7H.3 — my 📥 Inbox: what Send to Enso saved (routes/share.ts writes it), mine only (⚑ Q319: anyone else's is
// 404), newest first. Clearing deletes the row, then its photo. Never writes an item.
import { Hono, type Context } from 'hono';
import type { AppEnv } from '../env';
import { INBOX_LIST_MAX, inboxKind, type InboxItem } from '../../shared/inbox';
import { all, first, run } from '../db';
import { fail } from '../http';
import { servePhoto } from '../photo-store';
import { requireMember } from '../session';

export const inbox = new Hono<AppEnv>();

interface Row { id: string; url: string | null; text: string | null; photo_key: string | null; created_at: string }

const mine = (c: Context<AppEnv>) => first<Row>(c.env.DB,
  'SELECT id, url, text, photo_key, created_at FROM inbox_items WHERE id = ? AND member_id = ?', c.req.param('id'), c.get('member').id);
const GONE = 'That item is no longer in your Inbox.';

inbox.get('/inbox', requireMember, async (c) => {
  const rows = await all<Row>(c.env.DB, `SELECT id, url, text, photo_key, created_at FROM inbox_items
    WHERE member_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`, c.get('member').id, INBOX_LIST_MAX);
  const items: InboxItem[] = rows.map((r) => ({
    id: r.id, kind: inboxKind(r), url: r.url, text: r.text, hasPhoto: r.photo_key !== null, createdAt: r.created_at,
  }));
  return c.json({ items });
});

inbox.delete('/inbox/:id', requireMember, async (c) => {
  const r = await mine(c);
  if (!r) return fail(c, 404, 'not_found', GONE);
  await run(c.env.DB, 'DELETE FROM inbox_items WHERE id = ?', r.id);
  if (r.photo_key) await c.env.PHOTOS.delete(r.photo_key);
  return c.body(null, 204);
});

inbox.get('/inbox/:id/photo', requireMember, async (c) => {
  const r = await mine(c);
  return servePhoto(c, c.env.PHOTOS, r?.photo_key, r ? 'That item has no photo.' : GONE);
});
