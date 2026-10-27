// SPEC §7.11, §7.14 — the once-a-day claim the forecast, coast and fish-event refreshes share (weatherDue's rule): due when the
// last good refresh was not today and the last try was an hour ago or never; only the tick that moves the try mark asks.
import { first } from './db';
import { weatherDue } from '../shared/weather';

/** True when this tick should fetch: due, and it won the conditional claim on `settings.<tried>`. */
export async function claimDailyRefresh(db: D1Database, tried: 'weather_tried_at' | 'coast_tried_at' | 'fish_events_tried_at', lastFetchedSql: string, now: string, tz: string): Promise<boolean> {
  const s = (await first<{ tried_at: string | null }>(db, `SELECT ${tried} AS tried_at FROM settings WHERE id = 1`))!;
  const last = await first<{ at: string | null }>(db, lastFetchedSql);
  if (!weatherDue({ triedAt: s.tried_at, fetchedAt: last?.at ?? null }, now, tz)) return false;
  const won = await db.prepare(`UPDATE settings SET ${tried} = ? WHERE id = 1 AND ${tried} IS ?`).bind(now, s.tried_at).run();
  return !!won.meta.changes;
}

const FETCH_TIMEOUT_MS = 10_000;

/** GET `url` → the answer read by `read` (json or text), or null on any failure (logged under `what`). */
export async function fetchRead<T>(what: string, url: string, read: (r: Response) => Promise<T>): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) { console.log(what, `HTTP ${res.status}`); return null; }
    return await read(res);
  } catch (e) {
    console.log(what, (e as Error).message);
    return null;
  }
}
