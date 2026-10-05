// Thin D1 helpers + id minting. D1 has no BEGIN/COMMIT — group writes with db.batch().
import type { Place } from '../shared/sun';

const BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford

export function randomBase32(n: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  let s = '';
  for (const b of bytes) s += BASE32[b & 31];
  return s;
}

export function newId(prefix: string): string {
  return `${prefix}_${randomBase32(16).toLowerCase()}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export async function all<T>(db: D1Database, sql: string, ...params: unknown[]): Promise<T[]> {
  return (await db.prepare(sql).bind(...params).all<T>()).results;
}

export async function first<T>(db: D1Database, sql: string, ...params: unknown[]): Promise<T | null> {
  return db.prepare(sql).bind(...params).first<T>();
}

export async function run(db: D1Database, sql: string, ...params: unknown[]): Promise<D1Result> {
  return db.prepare(sql).bind(...params).run();
}

export function parseJson<T>(text: string | null, fallback: T): T {
  if (text === null || text === undefined) return fallback;
  try { return JSON.parse(text) as T; } catch { return fallback; }
}

/** The household timezone (§4.1), from the settings row. */
export async function householdTz(db: D1Database): Promise<string> {
  return (await first<{ timezone: string }>(db, 'SELECT timezone FROM settings WHERE id = 1'))!.timezone;
}

/** §4.2o — the household place, or null unless both coordinates are set. */
export const placeOf = (lat: number | null | undefined, lon: number | null | undefined): Place | null =>
  lat != null && lon != null ? { lat, lon } : null;

/** The household's own place (§7.7), or null when none is set. */
export async function householdPlace(db: D1Database): Promise<Place | null> {
  const at = await first<{ lat: number | null; lon: number | null }>(db, 'SELECT latitude AS lat, longitude AS lon FROM settings WHERE id = 1');
  return at ? placeOf(at.lat, at.lon) : null;
}

/** The ids of every member not disabled. */
export const activeMemberIds = async (db: D1Database): Promise<string[]> =>
  (await all<{ id: string }>(db, 'SELECT id FROM members WHERE disabled_at IS NULL')).map((r) => r.id);
