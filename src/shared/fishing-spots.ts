// SPEC §7.14 — the fishing spots: one fixed table (the ocean and the lakes don't move), and how far each is from home.
// Pure; distances are computed from the household place, never typed.
import type { Place } from './sun';

export type SpotKind = 'ocean' | 'lake';
export interface Spot { id: string; name: string; kind: SpotKind; lat: number; lon: number; station?: string; link: string; note?: string }

/** NOAA tide stations with predictions (Oceanside Harbor 9410396 has none): La Jolla for the north, San Diego Bay for the south. */
export const TIDE_STATIONS = ['9410230', '9410170'] as const;
const NORTH = '9410230', SOUTH = '9410170';

export const FISHING_SPOTS: readonly Spot[] = [
  { id: 'oceanside-pier', name: 'Oceanside Pier', kind: 'ocean', lat: 33.1934, lon: -117.3866, station: NORTH, link: 'https://www.ci.oceanside.ca.us/', note: 'No license needed on a public pier' },
  { id: 'oceanside-harbor', name: 'Oceanside Harbor jetties', kind: 'ocean', lat: 33.2065, lon: -117.395, station: NORTH, link: 'https://www.helgrensportfishing.com/', note: "Helgren's half-day boats" },
  { id: 'agua-hedionda', name: 'Agua Hedionda Lagoon', kind: 'ocean', lat: 33.143, lon: -117.333, station: NORTH, link: 'https://www.aguahedionda.org/' },
  { id: 'san-clemente-pier', name: 'San Clemente Pier', kind: 'ocean', lat: 33.419, lon: -117.62, station: NORTH, link: 'https://www.san-clemente.org/' },
  { id: 'crystal-pier', name: 'Crystal Pier, Pacific Beach', kind: 'ocean', lat: 32.797, lon: -117.258, station: NORTH, link: 'https://www.crystalpier.com/' },
  { id: 'mission-bay', name: 'Mission Bay', kind: 'ocean', lat: 32.765, lon: -117.236, station: NORTH, link: 'https://www.seaforthlanding.com/', note: 'Calm bay water, Seaforth boats' },
  { id: 'ocean-beach-pier', name: 'Ocean Beach Pier', kind: 'ocean', lat: 32.749, lon: -117.256, station: NORTH, link: 'https://www.sandiego.gov/' },
  { id: 'point-loma-landings', name: 'Point Loma landings', kind: 'ocean', lat: 32.724, lon: -117.233, station: SOUTH, link: 'https://www.hmlanding.com/', note: 'Half-day to overnight boats' },
  { id: 'shelter-island-pier', name: 'Shelter Island Pier', kind: 'ocean', lat: 32.715, lon: -117.229, station: SOUTH, link: 'https://www.portofsandiego.org/' },
  { id: 'imperial-beach-pier', name: 'Imperial Beach Pier', kind: 'ocean', lat: 32.58, lon: -117.134, station: SOUTH, link: 'https://www.imperialbeachca.gov/' },
  { id: 'guajome-lake', name: 'Guajome Lake', kind: 'lake', lat: 33.248, lon: -117.268, link: 'https://www.sdparks.org/' },
  { id: 'discovery-lake', name: 'Discovery Lake, San Marcos', kind: 'lake', lat: 33.133, lon: -117.182, link: 'https://www.san-marcos.net/' },
  { id: 'dixon-lake', name: 'Dixon Lake', kind: 'lake', lat: 33.165, lon: -117.05, link: 'https://www.escondido.org/dixon-lake', note: 'Trout Nov–Apr, derbies' },
  { id: 'lake-wohlford', name: 'Lake Wohlford', kind: 'lake', lat: 33.17, lon: -117.0, link: 'https://www.escondido.org/lake-wohlford' },
  { id: 'lake-hodges', name: 'Lake Hodges', kind: 'lake', lat: 33.065, lon: -117.125, link: 'https://www.sandiego.gov/reservoirs-lakes/hodges-reservoir', note: 'Open some days only' },
  { id: 'lake-poway', name: 'Lake Poway', kind: 'lake', lat: 33.007, lon: -117.012, link: 'https://poway.org/', note: 'Trout, youth derby' },
  { id: 'lake-miramar', name: 'Lake Miramar', kind: 'lake', lat: 32.913, lon: -117.1, link: 'https://www.sandiego.gov/reservoirs-lakes/miramar-reservoir' },
  { id: 'san-vicente', name: 'San Vicente Reservoir', kind: 'lake', lat: 32.92, lon: -116.925, link: 'https://www.sandiego.gov/reservoirs-lakes/san-vicente-reservoir', note: 'Open some days only' },
  { id: 'lake-murray', name: 'Lake Murray', kind: 'lake', lat: 32.785, lon: -117.04, link: 'https://www.sandiego.gov/reservoirs-lakes/murray-reservoir' },
  { id: 'kumeyaay-lake', name: 'Kumeyaay Lake', kind: 'lake', lat: 32.84, lon: -117.044, link: 'https://mtrp.org/' },
  { id: 'chollas-lake', name: 'Chollas Lake', kind: 'lake', lat: 32.735, lon: -117.065, link: 'https://www.sandiego.gov/', note: 'Kids 15 and under only' },
  { id: 'santee-lakes', name: 'Santee Lakes', kind: 'lake', lat: 32.855, lon: -116.99, link: 'https://www.santeelakes.com/', note: 'Trout, kids derbies, own permit' },
  { id: 'lindo-lake', name: 'Lindo Lake', kind: 'lake', lat: 32.857, lon: -116.92, link: 'https://www.sdparks.org/' },
  { id: 'lake-jennings', name: 'Lake Jennings', kind: 'lake', lat: 32.858, lon: -116.89, link: 'https://www.lakejennings.org/', note: 'Trout, summer night fishing' },
  { id: 'el-capitan', name: 'El Capitan Reservoir', kind: 'lake', lat: 32.885, lon: -116.81, link: 'https://www.sandiego.gov/reservoirs-lakes/el-capitan-reservoir', note: 'Open some days only' },
  { id: 'sutherland', name: 'Sutherland Reservoir', kind: 'lake', lat: 33.12, lon: -116.79, link: 'https://www.sandiego.gov/reservoirs-lakes/sutherland-reservoir', note: 'Open some days only' },
  { id: 'lake-henshaw', name: 'Lake Henshaw', kind: 'lake', lat: 33.236, lon: -116.77, link: 'https://www.lakehenshawresort.com/' },
  { id: 'doane-pond', name: 'Doane Pond, Palomar Mountain', kind: 'lake', lat: 33.3401, lon: -116.9013, link: 'https://www.parks.ca.gov/?page_id=637', note: 'Trout' },
  { id: 'lake-cuyamaca', name: 'Lake Cuyamaca', kind: 'lake', lat: 32.9903, lon: -116.5693, link: 'https://www.lakecuyamaca.org/', note: 'Trout, kids derby' },
  { id: 'lake-morena', name: 'Lake Morena', kind: 'lake', lat: 32.685, lon: -116.52, link: 'https://www.sdparks.org/' },
  { id: 'barrett-lake', name: 'Barrett Lake', kind: 'lake', lat: 32.68, lon: -116.67, link: 'https://www.sandiego.gov/reservoirs-lakes/barrett-reservoir', note: 'Reservation only' },
  { id: 'lower-otay', name: 'Lower Otay Reservoir', kind: 'lake', lat: 32.605, lon: -116.93, link: 'https://www.sandiego.gov/reservoirs-lakes/lower-otay-reservoir', note: 'Open some days only' },
  { id: 'upper-otay', name: 'Upper Otay Reservoir', kind: 'lake', lat: 32.645, lon: -116.985, link: 'https://www.sandiego.gov/reservoirs-lakes/upper-otay-reservoir', note: 'Catch and release' },
  { id: 'lake-skinner', name: 'Lake Skinner', kind: 'lake', lat: 33.59, lon: -117.05, link: 'https://www.rivcoparks.org/', note: 'Riverside County' },
  { id: 'diamond-valley', name: 'Diamond Valley Lake', kind: 'lake', lat: 33.68, lon: -117.03, link: 'https://dvmarina.com/', note: 'Riverside County' },
];

/** "How far will we go", in minutes of driving (§7.14). */
export const FISHING_RANGES = [15, 30, 45, 60, 90, 120] as const;
export const DEFAULT_FISHING_RANGE = 30;
export const rangeError = (v: unknown): string | null =>
  (FISHING_RANGES as readonly unknown[]).includes(v) ? null : `fishingRange must be one of ${FISHING_RANGES.join(', ')}.`;

const EARTH_MI = 3958.8;
const ROAD_FACTOR = 1.35, MPH = 40; // straight line → road miles, and an average speed with town driving

/** Straight-line miles between two places (haversine). */
export function milesBetween(a: Place, b: Place): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return 2 * EARTH_MI * Math.asin(Math.sqrt(h));
}

/** A rough drive time in minutes, to the nearest 5 (at least 5). Not a map route. */
export const driveMinutes = (from: Place, to: Place): number =>
  Math.max(5, Math.round(((milesBetween(from, to) * ROAD_FACTOR) / MPH) * 60 / 5) * 5);

/** The spots within `range` minutes of `home`, nearest first, each with its drive time. */
export function spotsWithin(home: Place, range: number): (Spot & { minutes: number })[] {
  return FISHING_SPOTS.map((s) => ({ ...s, minutes: driveMinutes(home, s) }))
    .filter((s) => s.minutes <= range)
    .sort((a, b) => a.minutes - b.minutes);
}
