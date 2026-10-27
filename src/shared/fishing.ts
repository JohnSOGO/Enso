// SPEC §7.14 — good fishing times: each day's dawn and dusk windows at a spot, rated 1–3 from the tide, the moon (solunar)
// and the wind and waves, and the words for them. Pure: the caller hands in the sun, moon, tide and weather of the day.
import type { Spot } from './fishing-spots';
import type { MoonTimes } from './moon-times';
import type { TideTurn } from './coast';
import { addMinutes, clockText, ms, utcToLocal } from './time';

export type FishWhat = 'dawn' | 'dusk' | 'high' | 'low' | 'over' | 'under' | 'moonrise' | 'moonset' | 'new' | 'full' | 'windy' | 'surf';
export interface FishWhy { what: FishWhat; at?: string }
export interface FishingWindow {
  from: string; to: string; rating: 1 | 2 | 3; why: FishWhy[];
  spot: { id: string; name: string; kind: Spot['kind']; minutes: number; link: string };
}
export interface FishEvent { emoji: string; title: string; url: string | null }
export interface FishingDay { date: string; windows: FishingWindow[]; events: FishEvent[] }

/** One day's facts. Sun and moon are for the home place (the spots are an hour or two away at most). */
export interface DayFacts {
  sunrise: string | null; sunset: string | null; moon: MoonTimes; phase: 'new' | 'full' | null;
  tides: TideTurn[]; windMph: number | null; waveFt: number | null;
}

const DAWN = [-45, 75] as const, DUSK = [-75, 45] as const; // minutes around sunrise and sunset
const TIDE_NEAR = 60, MAJOR = 60, MINOR = 30; // minutes either side of a tide turn, the moon over/under, its rise/set
export const WINDY_MPH = 15, BIG_SURF_FT = 6;
export const GREAT = 3;

const round5 = (iso: string) => new Date(Math.round(ms(iso) / 300000) * 300000).toISOString();
const overlaps = (a: string, b: string, at: string, pad: number) => ms(at) + pad * 60000 >= ms(a) && ms(at) - pad * 60000 <= ms(b);

/** The light windows of a day at a spot, each rated: 1 for the light, +1 for a tide turn near it (ocean) or a new or full
 *  moon that day (lake), +1 for a solunar period in it; −1 (never below 1) when it's windy or, at sea, the surf is big. */
export function windowsAt(spot: Spot & { minutes: number }, f: DayFacts): FishingWindow[] {
  const out: FishingWindow[] = [];
  for (const [what, base, [a0, b0]] of [['dawn', f.sunrise, DAWN], ['dusk', f.sunset, DUSK]] as const) {
    if (!base) continue;
    const from = round5(addMinutes(base, a0)), to = round5(addMinutes(base, b0));
    const why: FishWhy[] = [{ what }];
    let rating = 1;
    if (spot.kind === 'ocean') {
      const turn = f.tides.find((t) => overlaps(from, to, t.at, TIDE_NEAR));
      if (turn) { rating++; why.push({ what: turn.kind === 'H' ? 'high' : 'low', at: turn.at }); }
    } else if (f.phase) { rating++; why.push({ what: f.phase }); }
    const sol = ([['over', MAJOR], ['under', MAJOR], ['moonrise', MINOR], ['moonset', MINOR]] as const)
      .find(([k, pad]) => { const at = f.moon[k === 'moonrise' ? 'rise' : k === 'moonset' ? 'set' : k]; return at && overlaps(from, to, at, pad); });
    if (sol) { rating++; why.push({ what: sol[0] }); }
    const rough: FishWhy[] = [];
    if (f.windMph !== null && f.windMph >= WINDY_MPH) rough.push({ what: 'windy' });
    if (spot.kind === 'ocean' && f.waveFt !== null && f.waveFt >= BIG_SURF_FT) rough.push({ what: 'surf' });
    if (rough.length) rating = Math.max(1, rating - 1);
    out.push({ from, to, rating: rating as FishingWindow['rating'], why: [...why, ...rough],
      spot: { id: spot.id, name: spot.name, kind: spot.kind, minutes: spot.minutes, link: spot.link } });
  }
  return out;
}

/** The day's best window at sea and the best at a lake (spots nearest first; a tie goes to the nearer), best first. */
export function bestWindows(spots: (Spot & { minutes: number })[], factsFor: (spot: Spot) => DayFacts): FishingWindow[] {
  const best = new Map<Spot['kind'], FishingWindow>();
  for (const s of spots) {
    for (const w of windowsAt(s, factsFor(s))) {
      const b = best.get(s.kind);
      if (!b || w.rating > b.rating) best.set(s.kind, w);
    }
  }
  return [...best.values()].sort((a, b) => b.rating - a.rating);
}

const WORDS: Record<FishWhat, string> = {
  dawn: 'dawn', dusk: 'dusk', high: 'high tide', low: 'low tide', over: 'moon overhead', under: 'moon underfoot',
  moonrise: 'moonrise', moonset: 'moonset', new: 'new moon', full: 'full moon', windy: 'windy', surf: 'big surf',
};
const hm = (iso: string, tz: string, h24: boolean) => clockText(utcToLocal(iso, tz).time, h24);

/** "🎣🎣🎣 5:45am–7:45am Oceanside Pier · dawn, high tide 6:30am, moonset". */
export function fishingText(w: FishingWindow, tz: string, h24 = false): string {
  const why = w.why.map((y) => (y.at ? `${WORDS[y.what]} ${hm(y.at, tz, h24)}` : WORDS[y.what])).join(', ');
  return `${'🎣'.repeat(w.rating)} ${hm(w.from, tz, h24)}–${hm(w.to, tz, h24)} ${w.spot.name} · ${why}`;
}

/** The evening-before ping (§7.14): from this local time on. */
export const FISHING_PING_TIME = '19:00';
export const FISHING_PING_TITLE = '🎣 Good fishing';

/** The ping's words for tomorrow's great windows and fish events, or null when there is nothing to tell. */
export function fishingPing(day: FishingDay, tz: string, h24 = false): string | null {
  const lines = [
    ...day.windows.filter((w) => w.rating === GREAT).map((w) => `Tomorrow ${fishingText(w, tz, h24).replace(/^(🎣)+ /u, '')}`),
    ...day.events.map((e) => `Tomorrow: ${e.emoji} ${e.title}`),
  ];
  return lines.length ? lines.join('\n') : null;
}
