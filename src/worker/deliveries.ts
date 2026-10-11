// SPEC §5.7, §9.1–9.4, §6.6, §7B.7 — writing deliveries rows: the one INSERT for a push row and the one for a
// house row, each queued with created_at = updated_at = now, and the one predicate for what is a founder ping
// (counted for §9.4's limit, listed for §9.4a's FunHouse poller).
// Never sends (push.ts, house.ts do), never updates a status.
import type { NoticeKind } from '../shared/vocab';
import { all, first, newId } from './db';

export interface Written { id: string; stmt: D1PreparedStatement }

/** A push row: a fire's alert, an announcement, a founder ping, a sign-in notice or a mess ask. Absent = NULL; alertNumber defaults to 1. */
export interface PushRow {
  memberId: string; message: string; fireId?: string | null; alertNumber?: number;
  title?: string | null; notice?: NoticeKind | null; url?: string | null; messId?: string | null;
}

export function pushDelivery(db: D1Database, r: PushRow, now: string): Written {
  const id = newId('dlv');
  const stmt = db.prepare(
    `INSERT INTO deliveries (id, fire_id, alert_number, channel, member_id, message, title, notice, url, mess_id, status, created_at, updated_at)
     VALUES (?, ?, ?, 'push', ?, ?, ?, ?, ?, ?, 'queued', ?, ?)`)
    .bind(id, r.fireId ?? null, r.alertNumber ?? 1, r.memberId, r.message, r.title ?? null, r.notice ?? null, r.url ?? null,
      r.messId ?? null, now, now);
  return { id, stmt };
}

/** A house row (no member): a fire's alert or an announcement, on `speakers` (null = every speaker, §9.2a). */
export interface HouseRow { message: string; speakers: string[] | null; fireId?: string | null; alertNumber?: number }

export function houseDelivery(db: D1Database, r: HouseRow, now: string): Written {
  const id = newId('dlv');
  const stmt = db.prepare(
    `INSERT INTO deliveries (id, fire_id, alert_number, channel, member_id, message, status, speakers, created_at, updated_at)
     VALUES (?, ?, ?, 'house', NULL, ?, 'queued', ?, ?, ?)`)
    .bind(id, r.fireId ?? null, r.alertNumber ?? 1, r.message, r.speakers && JSON.stringify(r.speakers), now, now);
  return { id, stmt };
}

/** What a founder ping is (§9.4): a fire-less push with a title that is neither a sign-in notice (§6.6) nor a mess ask
 *  (§7B.7). Kept beside the writers it must tell apart; the hourly count and the FunHouse list (§9.4a) both read it. */
const FOUNDER_PING = `channel = 'push' AND fire_id IS NULL AND title IS NOT NULL AND notice IS NULL AND mess_id IS NULL`;

/** How many founder pings were written at or after `since`. */
export async function opsPingsSince(db: D1Database, since: string): Promise<number> {
  return (await first<{ n: number }>(db,
    `SELECT COUNT(*) AS n FROM deliveries WHERE ${FOUNDER_PING} AND created_at >= ?`, since))!.n;
}

export interface OpsPing { id: string; title: string; text: string; at: string }

/** §9.4a — the founder pings written at or after `since` and after `after` (when given), oldest first, at most `limit`. */
export async function opsPingsAfter(db: D1Database, after: string | null, since: string, limit: number): Promise<OpsPing[]> {
  return all<OpsPing>(db,
    `SELECT id, title, message AS text, created_at AS at FROM deliveries
      WHERE ${FOUNDER_PING} AND created_at >= ? AND (? IS NULL OR created_at > ?)
      ORDER BY created_at, id LIMIT ?`, since, after, after, limit);
}
