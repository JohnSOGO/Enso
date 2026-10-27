// SPEC §7.14b — fish events: the CDFW trout plants, the county parks' fishing events and the state's Free Fishing Days.
// Pure: the answers are read here; the fetch and the rows are src/worker/fish-events-rows.ts.
import type { FishEvent } from './fishing';
import { utcToLocal } from './time';

/** A stored event: `lat`/`lon` when the place is known (a plant), else null (shown at any range). */
export interface FishEventRow { id: string; date: string; title: string; lat: number | null; lon: number | null; url: string | null }

export const FISH_EMOJI = '🐟';

/** California's Free Fishing Days: nobody needs a license (kids 15 and under never do). Typed once a year (CDFW). */
export const FREE_FISHING_DAYS = ['2026-07-04', '2026-09-05'] as const;
export const FREE_DAY_TITLE = 'Free Fishing Day: no license needed';

export const freeDaysBetween = (from: string, to: string): (FishEvent & { date: string })[] =>
  FREE_FISHING_DAYS.filter((d) => d >= from && d <= to).map((date) => ({ date, emoji: FISH_EMOJI, title: FREE_DAY_TITLE, url: null }));

/** CDFW planting GeoJSON (`WaterName`, `WeekOfPlantStart` YYYY-MM-DD, `FishType`, `Lat`, `Lon`) → one row a plant, on the
 *  first day of its week; anything else → null. */
export function parsePlants(json: unknown): FishEventRow[] | null {
  const f = (json as { features?: unknown } | null)?.features;
  if (!Array.isArray(f)) return null;
  const out: FishEventRow[] = [];
  for (const x of f as { properties?: Record<string, unknown> }[]) {
    const p = x?.properties;
    if (!p || typeof p.WaterName !== 'string' || typeof p.WeekOfPlantStart !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(p.WeekOfPlantStart)) return null;
    const lat = typeof p.Lat === 'number' ? p.Lat : null, lon = typeof p.Lon === 'number' ? p.Lon : null;
    out.push({
      id: `plant:${p.OBJECTID ?? `${p.WaterName}|${p.WeekOfPlantStart}`}`, date: p.WeekOfPlantStart, lat, lon, url: null,
      title: `${typeof p.FishType === 'string' ? p.FishType : 'Fish'} planted this week: ${p.WaterName}`,
    });
  }
  return out;
}

const FISHY = /\b(fish|fishing|derby|anglers?|angling|trout|bass|catfish)\b/i;

/** An iCal text (RFC 5545: folded lines, UTC `DTSTART…Z` or a local date) → the events whose SUMMARY is about fishing,
 *  dated in `tz`; not a calendar → null. */
export function parseParksIcal(text: unknown, tz: string): FishEventRow[] | null {
  if (typeof text !== 'string' || !text.includes('BEGIN:VCALENDAR')) return null;
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const out: FishEventRow[] = [];
  let ev: Record<string, string> | null = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { ev = {}; continue; }
    if (line === 'END:VEVENT' && ev) {
      const summary = (ev.SUMMARY ?? '').trim(), start = ev.DTSTART ?? '';
      const m = /^(\d{4})(\d\d)(\d\d)(?:T(\d\d)(\d\d)\d\dZ)?/.exec(start);
      if (m && FISHY.test(summary)) {
        const date = m[4] ? utcToLocal(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00.000Z`, tz).date : `${m[1]}-${m[2]}-${m[3]}`;
        out.push({ id: `parks:${ev.UID ?? `${date}|${summary}`}`, date, title: summary.replace(/\\,/g, ','), lat: null, lon: null, url: ev.URL ?? null });
      }
      ev = null; continue;
    }
    if (!ev) continue;
    const i = line.indexOf(':');
    if (i > 0) ev[line.slice(0, i).split(';')[0]] = line.slice(i + 1);
  }
  return out;
}
