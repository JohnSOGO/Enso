// SPEC §7.14 — good fishing times: each day's dawn and dusk windows at a spot, rated 1–3 from the tide, the moon (solunar)
// and the wind and waves, and the words for them. Pure: the caller hands in the sun, moon, tide and weather of the day.
import type { Spot } from './fishing-spots';
import type { MoonTimes } from './moon-times';
import type { TideTurn } from './coast';
import { PHASES, type MoonPhase } from './moon';
import { addDays, addMinutes, clockText, ms, utcToLocal } from './time';

export type FishWhat = 'dawn' | 'dusk' | 'high' | 'low' | 'over' | 'under' | 'moonrise' | 'moonset' | 'new' | 'full' | 'windy' | 'surf';
export interface FishWhy { what: FishWhat; at?: string }
export interface FishingWindow {
  from: string; to: string; rating: 1 | 2 | 3; why: FishWhy[];
  windMph: number | null; waveFt: number | null; // the day's, for the reasons (waves null at a lake)
  spot: { id: string; name: string; kind: Spot['kind']; minutes: number; link: string; note?: string };
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

/** A new or full moon on `date`, the day before or the day after (the lake's bonus), else null. */
export function phaseNear(phases: readonly MoonPhase[], date: string): 'new' | 'full' | null {
  const p = phases.find((x) => x.date >= addDays(date, -1) && x.date <= addDays(date, 1) && (x.emoji === PHASES[0].emoji || x.emoji === PHASES[2].emoji));
  return p ? (p.emoji === PHASES[0].emoji ? 'new' : 'full') : null;
}

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
      windMph: f.windMph, waveFt: spot.kind === 'ocean' ? f.waveFt : null,
      spot: { id: spot.id, name: spot.name, kind: spot.kind, minutes: spot.minutes, link: spot.link, note: spot.note } });
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

const HEADLINE = ['', 'An OK time to fish', 'A good time to fish!', 'A great time to fish! Go!'];

/** Why a window got its rods, in plain words (§7.14): a headline, then one line a reason, then what the rods mean. */
export function fishingReasons(w: FishingWindow, tz: string, h24 = false): { headline: string; lines: { emoji: string; text: string }[] } {
  const at = (iso?: string) => (iso ? hm(iso, tz, h24) : '');
  const say: Record<FishWhat, (y: FishWhy) => [string, string]> = {
    dawn: () => ['🌅', 'Dawn. Fish come up to feed in the low light, and it is cool and quiet.'],
    dusk: () => ['🌇', 'Dusk. As the light fades, the fish start hunting again.'],
    high: (y) => ['🌊', `High tide at ${at(y.at)}. The water turns around, it moves and stirs up food, and fish bite when the water moves.`],
    low: (y) => ['🌊', `Low tide at ${at(y.at)}. The water turns around, it moves and stirs up food, and fish bite when the water moves.`],
    over: () => ['🌝', 'The moon is right overhead. Its pull is strongest now: one of the two big feeding times of the day.'],
    under: () => ['🌚', 'The moon is right under your feet, on the far side of the earth: the other big feeding time of the day.'],
    moonrise: () => ['🌙', 'Moonrise. A short burst of feeding as the moon comes up.'],
    moonset: () => ['🌙', 'Moonset. A short burst of feeding as the moon goes down.'],
    new: () => ['🌑', 'New moon this week. Fish feed more around a new moon.'],
    full: () => ['🌕', 'Full moon this week. Fish feed more around a full moon.'],
    windy: () => ['💨', `Windy, up to ${w.windMph} mph. Harder to cast, so one 🎣 off.`],
    surf: () => ['🌊', `Big waves, up to ${w.waveFt} ft. Rough out there, so one 🎣 off.`],
  };
  const lines = w.why.map((y) => { const [emoji, text] = say[y.what](y); return { emoji, text }; });
  const rough = w.why.some((y) => y.what === 'windy' || y.what === 'surf');
  if (!rough && w.windMph !== null) {
    lines.push({ emoji: '😌', text: `Calm: wind up to ${w.windMph} mph${w.waveFt !== null ? `, waves up to ${w.waveFt} ft` : ''}.` });
  }
  lines.push({ emoji: '🎣', text: w.spot.kind === 'ocean'
    ? 'Each 🎣 is one thing going for you: the light, a turning tide, a moon feeding time.'
    : 'Each 🎣 is one thing going for you: the light, a new or full moon, a moon feeding time.' });
  lines.push({ emoji: '🚗', text: `About ${w.spot.minutes} min from home${w.spot.note ? `. ${w.spot.note}.` : '.'}` });
  return { headline: `${'🎣'.repeat(w.rating)} ${HEADLINE[w.rating]}`, lines };
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
