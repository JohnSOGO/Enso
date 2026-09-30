// SPEC §4.1 — the only module that converts between local wall time and UTC.
// Local dates are 'YYYY-MM-DD', local times 'HH:MM', instants are UTC ISO strings with 'Z'.

const MIN = 60_000;
const DAY = 86_400_000;

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string): Intl.DateTimeFormat {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    dtfCache.set(tz, f);
  }
  return f;
}

/** Wall-clock fields of an instant in `tz`, expressed as a UTC epoch (ms). */
function wallMs(utcMs: number, tz: string): number {
  const p: Record<string, number> = {};
  for (const part of dtf(tz).formatToParts(new Date(utcMs))) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

/** UTC offset of `tz` at an instant, in minutes (e.g. -420 for PDT). */
function offsetMin(utcMs: number, tz: string): number {
  const whole = Math.floor(utcMs / 1000) * 1000;
  return (wallMs(whole, tz) - whole) / MIN;
}

export function isValidTimeZone(tz: string): boolean {
  try { dtf(tz); return true; } catch { return false; }
}

export function iso(ms: number): string {
  return new Date(ms).toISOString();
}

export function ms(isoString: string): number {
  return Date.parse(isoString);
}

export function addMinutes(isoString: string, minutes: number): string {
  return iso(ms(isoString) + minutes * MIN);
}

/**
 * Local wall time in `tz` → UTC ISO.
 * Gap (spring forward): the first valid instant after it. Ambiguous (fall back): the earlier instant.
 */
export function localToUtc(date: string, time: string, tz: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  const before = offsetMin(wall - DAY, tz);
  const after = offsetMin(wall + DAY, tz);
  const candidates = [...new Set([wall - before * MIN, wall - after * MIN])]
    .filter((t) => wallMs(t, tz) === wall)
    .sort((a, b) => a - b);
  if (candidates.length > 0) return iso(candidates[0]);
  // In a gap: walk forward minute by minute from the pre-transition reading to the transition.
  let t = wall - after * MIN;
  while (offsetMin(t, tz) !== after) t += MIN;
  return iso(t);
}

export function utcToLocal(isoString: string, tz: string): { date: string; time: string } {
  const w = new Date(wallMs(ms(isoString), tz)).toISOString();
  return { date: w.slice(0, 10), time: w.slice(11, 16) };
}

// ---- local-date arithmetic (calendar dates, no zone involved) ----

function dateMs(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fmtDate(msValue: number): string {
  return new Date(msValue).toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
  return fmtDate(dateMs(date) + n * DAY);
}

export function diffDays(a: string, b: string): number {
  return Math.round((dateMs(a) - dateMs(b)) / DAY);
}

/** 0 = Sunday … 6 = Saturday */
export function weekdayOf(date: string): number {
  return new Date(dateMs(date)).getUTCDay();
}

export function startOfWeek(date: string): string {
  return addDays(date, -weekdayOf(date));
}

export function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

export function ymd(year: number, month1: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function isDate(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && fmtDate(dateMs(s)) === s;
}

export function isTime(s: unknown): s is string {
  return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}
