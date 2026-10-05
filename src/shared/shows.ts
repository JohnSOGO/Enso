// SPEC §7F — movies & shows (pure): limits, validation, the duplicate key, the wire shape, the row's best way to
// watch, and cleaning a look-up's answer. Imports vocab, things (webLink, NOTE_MAX, URL_MAX) and link-reading
// (cutText); none of them imports it. The prompts are show-reading.ts.
import { SHOW_KIND, SHOW_STATUS, WATCH_HOW, isOneOf, type ShowKind, type ShowStatus, type WatchHow } from './vocab';
import { NOTE_MAX, URL_MAX, webLink } from './things';
import { cutText } from './link-reading';

export const SHOW_TITLE_MAX = 120;
export const YEAR_MAX = 20;
export const SUMMARY_MAX = 500;
export const WATCH_MAX = 12;
export const WHERE_MAX = 100;
export const WATCH_NOTE_MAX = 200;
/** At most this many theaters, the closest to the household (§7F.1). */
export const THEATERS_MAX = 3;
export { NOTE_MAX as SHOW_NOTE_MAX, URL_MAX as SHOW_URL_MAX };

/** One way to watch (§7F.1). */
export interface WatchOption { how: WatchHow; where: string; note: string | null }

/** One `shows` row as D1 returns it. */
export interface ShowRow {
  id: string;
  title: string;
  title_key: string;
  kind: ShowKind | null;
  year: string | null;
  rt_critics: number | null;
  rt_audience: number | null;
  watch: string;
  checked_at: string | null;
  summary: string | null;
  note: string | null;
  url: string | null;
  status: ShowStatus;
  watched_at: string | null;
  watched_by: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** A show on the wire (§10). */
export interface Show {
  id: string;
  title: string;
  kind: ShowKind | null;
  year: string | null;
  rtCritics: number | null;
  rtAudience: number | null;
  watch: WatchOption[];
  summary: string | null;
  note: string | null;
  url: string | null;
  checkedAt: string | null;
  status: ShowStatus;
  watchedAt: string | null;
  watchedBy: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** What a look-up returns (§7F.2). Nothing is saved. A null title means it couldn't tell which show it is. */
export interface ShowReading {
  title: string | null;
  kind: ShowKind | null;
  year: string | null;
  rtCritics: number | null;
  rtAudience: number | null;
  watch: WatchOption[];
  summary: string | null;
  note: string | null;
  url: string | null;
  checkedAt: string;
}

/** Normalized show fields from a POST / PATCH body. */
export interface ShowInput {
  title: string;
  kind: ShowKind | null;
  year: string | null;
  rt_critics: number | null;
  rt_audience: number | null;
  watch: WatchOption[];
  summary: string | null;
  note: string | null;
  url: string | null;
  checked_at: string | null;
  status?: ShowStatus;
}

/** §7F.1 — one show per key: the title lower-cased, whitespace collapsed, plus the year. */
export const showKey = (title: string, year: string | null) =>
  `${title.trim().replace(/\s+/g, ' ').toLowerCase()}|${(year ?? '').trim().toLowerCase()}`;

const empty = (v: unknown) => v === undefined || v === null || v === '';
const isPercent = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 100;

function optText(v: unknown, field: string, max: number): string | null | { error: string } {
  if (empty(v)) return null;
  if (typeof v !== 'string' || v.trim().length > max) return { error: `${field} can be at most ${max} characters.` };
  return v.trim() || null;
}

/** A typed watch list, or the message naming what is wrong. */
function parseWatch(v: unknown): WatchOption[] | string {
  if (empty(v)) return [];
  if (!Array.isArray(v) || v.length > WATCH_MAX) return `watch must be a list of at most ${WATCH_MAX} ways to watch.`;
  const out: WatchOption[] = [];
  for (const o of v) {
    const w = (o ?? {}) as Record<string, unknown>;
    if (!isOneOf(WATCH_HOW, w.how)) return `watch: how must be one of: ${WATCH_HOW.join(', ')}.`;
    const where = typeof w.where === 'string' ? w.where.trim() : '';
    if (!where || where.length > WHERE_MAX) return `watch: where must be 1–${WHERE_MAX} characters.`;
    const note = optText(w.note, 'watch: note', WATCH_NOTE_MAX);
    if (note && typeof note === 'object') return note.error;
    out.push({ how: w.how, where, note });
  }
  return out;
}

/** POST / PATCH body (wire names) → normalized fields, or a message naming the offending field. */
export function parseShowInput(b: Record<string, unknown>): ShowInput | string {
  const title = typeof b.title === 'string' ? b.title.trim() : '';
  if (!title || title.length > SHOW_TITLE_MAX) return `title must be 1–${SHOW_TITLE_MAX} characters.`;
  if (!empty(b.kind) && !isOneOf(SHOW_KIND, b.kind)) return `kind must be one of: ${SHOW_KIND.join(', ')}.`;
  const texts = { year: optText(b.year, 'year', YEAR_MAX), summary: optText(b.summary, 'summary', SUMMARY_MAX),
    note: optText(b.note, 'note', NOTE_MAX), url: optText(b.url, 'url', URL_MAX) };
  for (const t of Object.values(texts)) if (t && typeof t === 'object') return t.error;
  const { year, summary, note, url } = texts as Record<keyof typeof texts, string | null>;
  const link = url ? webLink(url) : null;
  if (url && !link) return 'url must be a web address, like https://….';
  for (const f of ['rtCritics', 'rtAudience'] as const) {
    if (!empty(b[f]) && !isPercent(b[f])) return `${f} must be a whole number from 0 to 100.`;
  }
  const watch = parseWatch(b.watch);
  if (typeof watch === 'string') return watch;
  if (!empty(b.checkedAt) && (typeof b.checkedAt !== 'string' || Number.isNaN(Date.parse(b.checkedAt)))) {
    return 'checkedAt must be a date and time.';
  }
  if (b.status !== undefined && !isOneOf(SHOW_STATUS, b.status)) return `status must be one of: ${SHOW_STATUS.join(', ')}.`;
  return {
    title, kind: empty(b.kind) ? null : (b.kind as ShowKind), year,
    rt_critics: empty(b.rtCritics) ? null : (b.rtCritics as number), rt_audience: empty(b.rtAudience) ? null : (b.rtAudience as number),
    watch, summary, note, url: link, checked_at: empty(b.checkedAt) ? null : (b.checkedAt as string),
    ...(b.status !== undefined ? { status: b.status as ShowStatus } : {}),
  };
}

/** The wire shape (§10). A stored watch list that won't parse shows as none, never a guess. */
export function showFromRow(r: ShowRow): Show {
  let watch: unknown;
  try { watch = JSON.parse(r.watch); } catch { watch = []; }
  const parsed = parseWatch(watch);
  return {
    id: r.id, title: r.title, kind: r.kind, year: r.year, rtCritics: r.rt_critics, rtAudience: r.rt_audience,
    watch: typeof parsed === 'string' ? [] : parsed, summary: r.summary, note: r.note, url: r.url, checkedAt: r.checked_at,
    status: r.status, watchedAt: r.watched_at, watchedBy: r.watched_by, createdBy: r.created_by, createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** §8.14 ⚑ Q155 — the row's way to watch: the first in WATCH_HOW order (theater, stream, tv, rent, buy), or null. */
export function bestWatch(watch: readonly WatchOption[]): WatchOption | null {
  for (const how of WATCH_HOW) {
    const o = watch.find((w) => w.how === how);
    if (o) return o;
  }
  return null;
}

const cleanText = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const t = cutText(v.trim(), max).trim();
  return t || null;
};

/** A rating as a whole percent: 92, 92.4 or "92%" → 92; anything outside 0–100 or unreadable → null. */
function cleanPercent(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\s*\d+(\.\d+)?\s*%?\s*$/.test(v) ? parseFloat(v) : NaN;
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r >= 0 && r <= 100 ? r : null;
}

/**
 * §7F.2 — the model's answer is input, never trusted as-is: fields cut to their limits, kind and how checked,
 * ratings as whole percents, repeated ways to watch merged, at most THEATERS_MAX theaters and WATCH_MAX options.
 * `url` is the pasted link (or null) and `checkedAt` the server's time, both given by the caller.
 */
export function cleanShowReading(raw: Record<string, unknown> | null | undefined, url: string | null, checkedAt: string): ShowReading {
  const r = raw ?? {};
  const watch: WatchOption[] = [];
  const seen = new Set<string>();
  let theaters = 0;
  for (const o of Array.isArray(r.watch) ? r.watch : []) {
    const w = (o ?? {}) as Record<string, unknown>;
    const where = cleanText(w.where, WHERE_MAX);
    if (!isOneOf(WATCH_HOW, w.how) || !where) continue;
    const key = `${w.how}|${where.toLowerCase()}`;
    if (seen.has(key) || watch.length >= WATCH_MAX || (w.how === 'theater' && theaters >= THEATERS_MAX)) continue;
    seen.add(key);
    if (w.how === 'theater') theaters++;
    watch.push({ how: w.how, where, note: cleanText(w.note, WATCH_NOTE_MAX) });
  }
  return {
    title: cleanText(r.title, SHOW_TITLE_MAX), kind: isOneOf(SHOW_KIND, r.kind) ? r.kind : null, year: cleanText(r.year, YEAR_MAX),
    rtCritics: cleanPercent(r.rtCritics), rtAudience: cleanPercent(r.rtAudience), watch,
    summary: cleanText(r.summary, SUMMARY_MAX), note: cleanText(r.note, NOTE_MAX), url: url ? webLink(url) : null, checkedAt,
  };
}
