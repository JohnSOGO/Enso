// SPEC §4.2zzc, §8.18 — the feature_requests rows, for routes/feature-requests.ts and routes/ops.ts: the view, the
// insert (status from statusFor), the two listings, one load and a status change guarded by the status as read.
// No Hono; never decides a transition (shared/feature-requests.ts does).
import { LISTED_STATUSES, OPEN_STATUSES, shownSince, statusFor, type FeatureRequest } from '../shared/feature-requests';
import type { FeatureRequestSize, FeatureRequestStatus } from '../shared/vocab';
import { all, first, newId } from './db';

interface Row {
  id: string; text: string; title: string; summary: string; size: FeatureRequestSize; status: FeatureRequestStatus;
  note: string | null; created_by: string; created_at: string; updated_at: string;
}

const marks = (list: readonly string[]) => list.map(() => '?').join(', ');

const view = (r: Row): FeatureRequest => ({
  id: r.id, text: r.text, title: r.title, summary: r.summary, size: r.size, status: r.status, note: r.note,
  createdBy: r.created_by, createdAt: r.created_at,
});

export async function insertFeatureRequest(db: D1Database, f: { text: string; title: string; summary: string; size: FeatureRequestSize; outside: boolean }, memberId: string, now: string): Promise<FeatureRequest> {
  const id = newId('req');
  await db.prepare(
    `INSERT INTO feature_requests (id, text, title, summary, size, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, f.text, f.title, f.summary, f.size, statusFor(f.size, f.outside), memberId, now, now).run();
  return (await loadFeatureRequest(db, id))!;
}

/** Newest first: every listed one (open or outside), and closed ones changed within FEATURE_REQUEST_SHOWN_DAYS. */
export async function listFeatureRequests(db: D1Database, now: string): Promise<FeatureRequest[]> {
  return (await all<Row>(db,
    `SELECT * FROM feature_requests WHERE status IN (${marks(LISTED_STATUSES)}) OR updated_at >= ? ORDER BY created_at DESC, id DESC`,
    ...LISTED_STATUSES, shownSince(now))).map(view);
}

/** The open ones, oldest first (a build session's queue). */
export async function openFeatureRequests(db: D1Database): Promise<FeatureRequest[]> {
  return (await all<Row>(db, `SELECT * FROM feature_requests WHERE status IN (${marks(OPEN_STATUSES)}) ORDER BY created_at, id`, ...OPEN_STATUSES)).map(view);
}

export async function loadFeatureRequest(db: D1Database, id: string | undefined): Promise<FeatureRequest | null> {
  const r = await first<Row>(db, 'SELECT * FROM feature_requests WHERE id = ?', id);
  return r && view(r);
}

/** Moves a request from `from` to `to`; false when it was no longer `from`. A note given replaces the old one. */
export async function setStatus(db: D1Database, id: string, from: FeatureRequestStatus, to: FeatureRequestStatus, note: string | null | undefined, now: string): Promise<boolean> {
  const r = await db.prepare(
    `UPDATE feature_requests SET status = ?, note = COALESCE(?, note), updated_at = ? WHERE id = ? AND status = ?`,
  ).bind(to, note ?? null, now, id, from).run();
  return r.meta.changes > 0;
}
