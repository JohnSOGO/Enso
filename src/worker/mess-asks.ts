// SPEC §7B.7 — asking who left a mess, and moving it to To talk about: fire-less push deliveries that carry their
// mess (deliveries.mess_id), shared by routes/messes.ts and tick. The rules (when, whom, the words) are
// src/shared/messes.ts.
import type { Env } from './env';
import { activeMemberIds, all, first, newId } from './db';
import { sendPushDeliveries } from './push';
import {
  MESS_ASK_TITLE, MESS_DISCUSS_TITLE, MESS_PHOTO_KEEP_DAYS, askMessage, askedOf, discussDue, discussMessage, nudgeDue,
  type MessRow,
} from '../shared/messes';
import { addMinutes } from '../shared/time';

const OPEN_SQL = `SELECT * FROM messes WHERE deleted_at IS NULL AND claimed_by IS NULL AND closed_at IS NULL
  AND settled_at IS NULL AND discuss_at IS NULL`;

/** The reporter's name and the chore's title, for the push texts. */
async function wordsOf(db: D1Database, m: MessRow) {
  const r = await first<{ name: string; chore: string | null }>(db,
    `SELECT (SELECT display_name FROM members WHERE id = ?) AS name, (SELECT title FROM chores WHERE id = ?) AS chore`,
    m.reported_by, m.chore_id);
  return { name: r?.name ?? 'Someone', chore: r?.chore ?? null };
}

export const deniedIdsOf = async (db: D1Database, messId: string) =>
  (await all<{ member_id: string }>(db, 'SELECT member_id FROM mess_denials WHERE mess_id = ?', messId)).map((d) => d.member_id);

function pushRow(db: D1Database, id: string, m: MessRow, memberId: string, n: number, title: string, message: string, now: string) {
  return db.prepare(
    `INSERT INTO deliveries (id, fire_id, alert_number, channel, member_id, message, title, mess_id, status, created_at, updated_at)
     VALUES (?, NULL, ?, 'push', ?, ?, ?, ?, 'queued', ?, ?)`).bind(id, n, memberId, message, title, m.id, now, now);
}

/** Moves an open mess to To talk about and tells each active admin, once (the write is conditional). */
export async function moveToDiscuss(env: Env, m: MessRow, now: string): Promise<void> {
  const db = env.DB;
  const r = await db.prepare('UPDATE messes SET discuss_at = ? WHERE id = ? AND discuss_at IS NULL AND claimed_by IS NULL')
    .bind(now, m.id).run();
  if (!r.meta.changes) return;
  const admins = await all<{ id: string }>(db, `SELECT id FROM members WHERE role = 'owner' AND disabled_at IS NULL`);
  if (!admins.length) return;
  const w = await wordsOf(db, m);
  const ids = admins.map(() => newId('dlv'));
  await db.batch(admins.map((a, i) => pushRow(db, ids[i], m, a.id, 1, MESS_DISCUSS_TITLE, discussMessage(w.name, w.chore, m.note), now)));
  await sendPushDeliveries(env, ids, now);
}

/** One open mess: To talk about when due, else the next ask to each member who is due one. */
export async function askAbout(env: Env, m: MessRow, now: string, activeIds?: string[]): Promise<void> {
  const db = env.DB;
  const asked = askedOf(m, activeIds ?? await activeMemberIds(db), await deniedIdsOf(db, m.id));
  if (discussDue(m.created_at, asked, now)) return moveToDiscuss(env, m, now);
  const sent = new Map((await all<{ member_id: string; n: number }>(db,
    'SELECT member_id, COUNT(*) AS n FROM deliveries WHERE mess_id = ? GROUP BY member_id', m.id)).map((r) => [r.member_id, r.n]));
  const due = asked.filter((id) => nudgeDue(m.created_at, sent.get(id) ?? 0, now));
  if (!due.length) return;
  const w = await wordsOf(db, m);
  const ids = due.map(() => newId('dlv'));
  await db.batch(due.map((id, i) => pushRow(db, ids[i], m, id, (sent.get(id) ?? 0) + 1, MESS_ASK_TITLE, askMessage(w.name, w.chore, m.note), now)));
  await sendPushDeliveries(env, ids, now);
}

/** Tick (§7B.7): every open mess is asked about; photos past MESS_PHOTO_KEEP_DAYS are deleted. */
export async function messTick(env: Env, now: string): Promise<void> {
  const db = env.DB;
  const open = await all<MessRow>(db, OPEN_SQL);
  if (open.length) {
    const active = await activeMemberIds(db);
    for (const m of open) await askAbout(env, m, now, active);
  }
  const old = await all<{ id: string; photo_key: string }>(db,
    'SELECT id, photo_key FROM messes WHERE photo_key IS NOT NULL AND created_at <= ?', addMinutes(now, -MESS_PHOTO_KEEP_DAYS * 24 * 60));
  if (old.length) {
    await env.PHOTOS.delete(old.map((o) => o.photo_key));
    await db.batch(old.map((o) => db.prepare('UPDATE messes SET photo_key = NULL WHERE id = ?').bind(o.id)));
  }
}
