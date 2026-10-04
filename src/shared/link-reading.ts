// SPEC §7C.4b — reading a pasted link to fill a thing's form: which links may be read, what a fetched page
// says (pageExtract), the limits, and the two prompts. Pure; imports things only. The Worker fetches
// (page-fetch.ts) and asks Claude (link-reader.ts); the answer is cleaned by cleanPhotoReading, like a photo's.
import { webLink } from './things';
import type { Place } from './sun';

export const PAGE_FETCH_TIMEOUT_MS = 8000;
export const PAGE_BYTES_MAX = 1_500_000;
export const PAGE_TEXT_MAX = 12_000;
export const JSONLD_MAX = 8000;
export const LINK_SEARCHES_MAX = 3;
export const LINK_FETCHES_MAX = 2;
export const RESEARCH_TURNS_MAX = 4;

/** What a fetched page says: its title, meta tags, JSON-LD blocks and visible text. */
export interface PageExtract { title: string | null; meta: string[]; jsonLd: string[]; text: string }

/** The page as fetched, or why it couldn't be (kept, never fatal). */
export type PageResult = { ok: true; page: PageExtract } | { ok: false; reason: string };

const PRIVATE_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home.arpa'];

/** The link as webLink keeps it, when its host is a public name (not an IP, localhost, single-label or a home suffix); else null. */
export function readableLink(raw: string): string | null {
  const link = webLink(raw);
  if (!link) return null;
  let host: string;
  try { host = new URL(link).hostname.toLowerCase().replace(/\.$/, ''); } catch { return null; }
  if (!host.includes('.') || host === 'localhost') return null;
  if (host.startsWith('[') || /^[\d.]+$/.test(host)) return null; // IPv6 or IPv4 literal
  if (PRIVATE_SUFFIXES.some((s) => host.endsWith(s))) return null;
  return link;
}

/** Cuts to `max` UTF-16 units, never inside a surrogate pair. */
export function cutText(s: string, max: number): string {
  if (s.length <= max) return s;
  const end = /[\uD800-\uDBFF]/.test(s[max - 1]) ? max - 1 : max;
  return s.slice(0, end);
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
/** Decodes the named entities above and numeric ones. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    if (k in ENTITIES) return ENTITIES[k];
    const code = k.startsWith('#x') ? parseInt(k.slice(2), 16) : k.startsWith('#') ? parseInt(k.slice(1), 10) : NaN;
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
  });
}

const squash = (s: string) => decodeEntities(s).replace(/\s+/g, ' ').trim();
const attr = (tag: string, name: string) =>
  tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))?.slice(1).find((v) => v !== undefined) ?? null;

/** §7C.4b — the title, description / og:* / twitter:* meta, every JSON-LD block and the visible text of a page. */
export function pageExtract(html: string): PageExtract {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const meta: string[] = [];
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = (attr(tag, 'property') ?? attr(tag, 'name'))?.toLowerCase();
    const content = attr(tag, 'content');
    if (key && content && (key === 'description' || key.startsWith('og:') || key.startsWith('twitter:'))) {
      const line = `${key}: ${squash(content)}`;
      if (!meta.includes(line)) meta.push(line);
    }
  }
  const jsonLd: string[] = [];
  let used = 0;
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    const block = m[1].trim();
    if (!block || used >= JSONLD_MAX) continue;
    const kept = cutText(block, JSONLD_MAX - used);
    jsonLd.push(kept);
    used += kept.length;
  }
  const body = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template|svg|head)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  return { title: title ? squash(title) || null : null, meta, jsonLd, text: cutText(squash(body), PAGE_TEXT_MAX) };
}

/** The page as the prompts give it, or the reason it couldn't be fetched. */
export function pageSection(page: PageResult): string {
  if (!page.ok) return `The page couldn't be fetched: ${page.reason}`;
  const p = page.page;
  return [
    `Page title: ${p.title ?? '(none)'}`,
    `Meta tags:\n${p.meta.length ? p.meta.join('\n') : '(none)'}`,
    `Structured data (JSON-LD):\n${p.jsonLd.length ? p.jsonLd.join('\n\n') : '(none)'}`,
    `Page text:\n${p.text || '(none)'}`,
  ].join('\n\n');
}

/** §7C.4b — several locations: the one closest to home (the household's own place), the others named in the note. */
export function nearestClause(home: Place | null): string {
  if (!home) return 'If it happens in more than one place, name every location in the notes.';
  return `The household lives at latitude ${home.lat}, longitude ${home.lon}. If it happens in more than one place ` +
    `(or on different dates in different places), choose the location closest to the household and give that ` +
    `location's dates, address, phone and cost; mention the other locations only in the note.`;
}

/** §7C.4b — the look-up: plain notes from the page and what searches find, never guessed. */
export const researchPrompt = (link: string, page: PageResult, today: string, tz: string, home: Place | null) =>
  `Someone in a household pasted this link while noting something they might want to do: ${link}\n` +
  `Today is ${today} in the household's time zone, ${tz}.\n\n` +
  `Here is what the page says:\n\n${pageSection(page)}\n\n` +
  `Find out what this is and gather: its name, the dates (and times) it happens or runs, the venue's name, its street ` +
  `address, a phone number, the cost or ticket prices, and anything else useful (what to bring, age limits, how to ` +
  `get tickets). If the page above is missing or doesn't say, read the link with web fetch, and use web search for what ` +
  `is still missing. Use only what the page and the searches say; never guess or fill in from general knowledge, and ` +
  `if something can't be found, say so. If the dates found are for a past year, say which year. ${nearestClause(home)} ` +
  `Answer as short plain notes, one fact per line.`;

/** §7C.4b — filling the fields from the page and the notes (the photo reader's schema). */
export const fillPrompt = (link: string, page: PageResult, notes: string, today: string, tz: string, home: Place | null) =>
  `This is about a link someone pasted while noting something a household might want to do: ${link}\n` +
  `Today is ${today} in the household's time zone, ${tz}.\n\n` +
  `What the page says:\n\n${pageSection(page)}\n\n` +
  `Notes from looking it up:\n${notes.trim() || '(none)'}\n\n` +
  `Fill in: title (short name of the thing), startDate and endDate (YYYY-MM-DD; turn dates like "Sat Oct 12" into ` +
  `full dates, choosing the next such date on or after today; a single day has the same start and end), place (the ` +
  `venue's name), address (its street address), phone (a phone number), cost (prices or cost, as one line), url (null), ` +
  `note (anything else useful, such as times, what to bring or where tickets are sold). Use only what the page and the ` +
  `notes say, copied as written. ${nearestClause(home)} Use null for anything not found.`;
