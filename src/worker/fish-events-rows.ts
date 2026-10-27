// SPEC §7.14b, §4.2zzm — the fish_events table: the once-a-day pull of the CDFW trout plants and the county parks'
// fishing events (tick step 3i), and the rows fishing reads. The answers are read by src/shared/fish-events.ts. Never throws.
import type { Env } from './env';
import { all, householdTz } from './db';
import { claimDailyRefresh, fetchRead } from './daily-refresh';
import { parseParksIcal, parsePlants, type FishEventRow } from '../shared/fish-events';

export async function fishEventsTick(env: Env, now: string): Promise<void> {
  if (!env.FISH_PLANTS_URL && !env.PARKS_ICAL_URL) return;
  const db = env.DB;
  try {
    const tz = await householdTz(db);
    if (!await claimDailyRefresh(db, 'fish_events_tried_at', 'SELECT MAX(fetched_at) AS at FROM fish_events', now, tz)) return;
    // Each source replaces only its own rows; a source that fails keeps what it had.
    const sources: [string, FishEventRow[] | null][] = [
      ['plant:', env.FISH_PLANTS_URL ? parsePlants(await fetchRead('fish plants', env.FISH_PLANTS_URL, (r) => r.json())) : null],
      ['parks:', env.PARKS_ICAL_URL ? parseParksIcal(await fetchRead('parks ical', env.PARKS_ICAL_URL, (r) => r.text()), tz) : null],
    ];
    const stmts = sources.flatMap(([prefix, rows]) => rows === null ? [] : [
      db.prepare('DELETE FROM fish_events WHERE id LIKE ?').bind(`${prefix}%`),
      ...rows.map((e) => db.prepare('INSERT OR IGNORE INTO fish_events (id, date, title, lat, lon, url, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(e.id, e.date, e.title, e.lat, e.lon, e.url, now)),
    ]);
    // Nothing read: leave the try mark as the claim set it, so it's asked again in an hour.
    if (stmts.length) await db.batch(stmts);
  } catch (e) {
    console.log('fish events', (e as Error).message);
  }
}

/** The stored fish events dated in [from, to]. */
export const fishEventsBetween = (db: D1Database, from: string, to: string): Promise<FishEventRow[]> =>
  all<FishEventRow>(db, 'SELECT id, date, title, lat, lon, url FROM fish_events WHERE date BETWEEN ? AND ? ORDER BY date, title', from, to);
