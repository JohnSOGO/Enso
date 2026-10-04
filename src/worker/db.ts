// Thin D1 helpers + id minting. D1 has no BEGIN/COMMIT — group writes with db.batch().

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
