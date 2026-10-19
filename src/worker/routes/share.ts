// SPEC §7H.1–§7H.2 — Send to Enso. POST /share is the door the iPhone Shortcut knocks on: no session, a Bearer key whose
// SHA-256 names an active member; the body is read by its content type here, and what a string or a file *is* is
// src/shared/inbox.ts's call. Photos go to R2 first, then the rows in one batch (the objects are removed if it fails).
// GET/POST/DELETE /share/key make, replace and turn off my key: only its hash is kept, the key is shown once.
// The key and the Authorization header are never logged, echoed or put in a message.
import { Hono, type Context } from 'hono';
import type { AppEnv } from '../env';
import {
  INBOX_PHOTOS_MAX, INBOX_PHOTO_MAX_BYTES, INBOX_URL_MAX, SHARE_KEY_PREFIX, SHARE_PER_HOUR,
  inboxKind, isShareKey, photoTypeOf, shareMessage, shareText, shareWindowStart,
} from '../../shared/inbox';
import { first, newId, nowIso, randomBase32, run } from '../db';
import { fail } from '../http';
import { putPhoto } from '../photo-store';
import { requireMember, sha256hex } from '../session';

export const share = new Hono<AppEnv>();

interface Photo { bytes: Uint8Array; type: string }
interface Shared { strings: string[]; photos: Photo[] }

const PHOTO_MB = INBOX_PHOTO_MAX_BYTES / (1024 * 1024);
/** A text file part bigger than this is not read as text. */
const TEXT_FILE_MAX = 64 * 1024;

const tooBig = (c: Context) => fail(c, 400, 'invalid_input', `The photo is too large: at most ${PHOTO_MB} MB.`);

/** One file (a form part or the raw body): a photo by its bytes, else text when it says it is text, else nothing. */
function readFile(c: Context, bytes: Uint8Array, declared: string, into: Shared): Response | null {
  if (bytes.byteLength > INBOX_PHOTO_MAX_BYTES) return tooBig(c);
  const type = photoTypeOf(bytes);
  if (type) into.photos.push({ bytes, type });
  else if (declared.startsWith('text/') && bytes.byteLength <= TEXT_FILE_MAX) into.strings.push(new TextDecoder().decode(bytes));
  return null;
}

/** §7H.2 step 2 — the body by its content type. */
async function readShared(c: Context): Promise<Shared | Response> {
  const ct = (c.req.header('content-type') ?? '').split(';')[0].trim().toLowerCase();
  const into: Shared = { strings: [], photos: [] };
  if (Number(c.req.header('content-length') ?? 0) > INBOX_PHOTOS_MAX * INBOX_PHOTO_MAX_BYTES) return tooBig(c);
  if (ct === 'multipart/form-data' || ct === 'application/x-www-form-urlencoded') {
    let form: FormData;
    try { form = await c.req.formData(); } catch { return fail(c, 400, 'invalid_input', 'The form could not be read.'); }
    for (const [, v] of form.entries()) {
      if (typeof v === 'string') { into.strings.push(v); continue; }
      const shut = readFile(c, new Uint8Array(await v.arrayBuffer()), (v.type || '').toLowerCase(), into);
      if (shut) return shut;
    }
  } else if (ct === 'application/json') {
    let b: unknown = null;
    try { b = await c.req.json(); } catch { /* an unreadable body is nothing shared */ }
    if (b && typeof b === 'object') {
      for (const k of ['url', 'text'] as const) {
        const v = (b as Record<string, unknown>)[k];
        if (typeof v === 'string') into.strings.push(v);
      }
    }
  } else {
    const shut = readFile(c, new Uint8Array(await c.req.arrayBuffer()), ct, into);
    if (shut) return shut;
  }
  if (into.photos.length > INBOX_PHOTOS_MAX) return fail(c, 400, 'invalid_input', `At most ${INBOX_PHOTOS_MAX} photos at once.`);
  return into;
}

/** §7H.2 step 1 — the active member whose key this is, or null. */
async function keyOwner(c: Context<AppEnv>): Promise<string | null> {
  const given = /^Bearer\s+(\S+)\s*$/i.exec(c.req.header('authorization') ?? '')?.[1] ?? '';
  if (!isShareKey(given)) return null;
  const row = await first<{ member_id: string }>(c.env.DB,
    `SELECT k.member_id FROM share_keys k JOIN members m ON m.id = k.member_id
      WHERE k.key_hash = ? AND m.disabled_at IS NULL`, await sha256hex(given));
  return row?.member_id ?? null;
}

share.post('/share', async (c) => {
  const me = await keyOwner(c);
  if (!me) return fail(c, 401, 'unauthorized', "That Send to Enso key isn't right. Make a new one in Ensō: Lists → 📥 Inbox → Set up.");
  const got = await readShared(c);
  if (got instanceof Response) return got;
  const said = shareText(got.strings);
  if (!said && got.photos.length === 0) return fail(c, 400, 'nothing_shared', 'Nothing came through to save.');
  if (said?.url && said.url.length > INBOX_URL_MAX) return fail(c, 400, 'invalid_input', `The link is too long: at most ${INBOX_URL_MAX} characters.`);

  const db = c.env.DB;
  const now = nowIso();
  const recent = (await first<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM inbox_items WHERE member_id = ? AND created_at >= ?',
    me, shareWindowStart(now)))!.n;
  if (recent >= SHARE_PER_HOUR) return fail(c, 429, 'rate_limited', `At most ${SHARE_PER_HOUR} shares an hour — try again later.`);

  // ⚑ Q323: one item per photo, the text and link riding on the first; no photo → one item.
  const keys: string[] = [];
  for (const p of got.photos) keys.push(await putPhoto(c.env.PHOTOS, 'inbox', me, p.bytes, p.type));
  const rows = (keys.length ? keys : [null]).map((photo_key, i) => ({
    id: newId('inb'), photo_key, url: i === 0 ? said?.url ?? null : null, text: i === 0 ? said?.text ?? null : null,
  }));
  try {
    await db.batch(rows.map((r) => db.prepare('INSERT INTO inbox_items (id, member_id, url, text, photo_key, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(r.id, me, r.url, r.text, r.photo_key, now)));
  } catch (err) {
    if (keys.length) await c.env.PHOTOS.delete(keys);
    throw err;
  }
  return c.json({ saved: rows.length, items: rows.map((r) => ({ id: r.id, kind: inboxKind(r) })), message: shareMessage(rows.length) }, 201);
});

share.get('/share/key', requireMember, async (c) => {
  const row = await first<{ created_at: string }>(c.env.DB, 'SELECT created_at FROM share_keys WHERE member_id = ?', c.get('member').id);
  return c.json({ on: row !== null, createdAt: row?.created_at ?? null });
});

share.post('/share/key', requireMember, async (c) => {
  const key = SHARE_KEY_PREFIX + randomBase32(32);
  const now = nowIso();
  await run(c.env.DB, `INSERT INTO share_keys (member_id, key_hash, created_at) VALUES (?, ?, ?)
    ON CONFLICT(member_id) DO UPDATE SET key_hash = excluded.key_hash, created_at = excluded.created_at`,
  c.get('member').id, await sha256hex(key), now);
  return c.json({ key, createdAt: now }, 201);
});

share.delete('/share/key', requireMember, async (c) => {
  await run(c.env.DB, 'DELETE FROM share_keys WHERE member_id = ?', c.get('member').id);
  return c.body(null, 204);
});
