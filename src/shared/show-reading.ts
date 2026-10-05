// SPEC §7F.2 — looking up a movie or show: the limits, the country, the nearest-theaters clause and the two
// prompts, for a title, a link or a picture. Pure; imports shows, link-reading (pageSection) and the sun Place type.
// The Worker fetches and asks Claude (show-reader.ts); the answer is cleaned by cleanShowReading.
import { THEATERS_MAX } from './shows';
import { cutText, pageSection, type PageResult } from './link-reading';
import type { Place } from './sun';
import type { ShowKind } from './vocab';

export const SHOW_SEARCHES_MAX = 5;
export const SHOW_FETCHES_MAX = 3;
/** Where to watch is looked up for this country (⚑ Q145). */
export const WATCH_COUNTRY = 'US';

/** A YouTube link's comments (§7F.2, ⚑ Q156): how many are asked for, and how much of the text is kept. */
export const SHOW_COMMENTS_LOOKED_AT = 20;
export const VIDEO_DESCRIPTION_MAX = 3000;
export const COMMENT_MAX = 500;
export const COMMENTS_TEXT_MAX = 6000;

/** A YouTube video's own words, or why they couldn't be read (kept, never fatal). */
export interface VideoFacts {
  title: string | null;
  channel: string | null;
  description: string | null;
  /** The comments' text, or why there are none. */
  comments: string[] | { reason: string };
}
export type VideoResult = { ok: true; video: VideoFacts } | { ok: false; reason: string };

/** What is being looked up: a title (with what is known), a link (with its page, and a YouTube video's facts when it
 *  is one), or a picture sent alongside. */
export type ShowQuery =
  | { by: 'title'; title: string; year: string | null; kind: ShowKind | null }
  | { by: 'link'; url: string; page: PageResult; video: VideoResult | null }
  | { by: 'picture' };

/** §7F.2 — the video's title, channel, description and comments as the prompt gives them, cut to their limits. */
export function videoSection(v: VideoResult): string {
  if (!v.ok) return `The video's details and comments couldn't be read: ${v.reason}`;
  const { title, channel, description, comments } = v.video;
  const kept: string[] = [];
  if (Array.isArray(comments)) {
    let used = 0;
    for (const c of comments) {
      const line = cutText(c.replace(/\s+/g, ' ').trim(), COMMENT_MAX);
      if (!line) continue;
      if (used + line.length > COMMENTS_TEXT_MAX) break;
      kept.push(`- ${line}`);
      used += line.length;
    }
  }
  return [
    `Video title: ${title ?? '(none)'}`,
    `Channel: ${channel ?? '(none)'}`,
    `Description:\n${description ? cutText(description, VIDEO_DESCRIPTION_MAX) : '(none)'}`,
    Array.isArray(comments)
      ? `Viewers' comments (most relevant first):\n${kept.length ? kept.join('\n') : '(none)'}`
      : `Viewers' comments couldn't be read: ${comments.reason}`,
  ].join('\n\n');
}

/** §7F.2 — theaters: up to THEATERS_MAX showing it, the closest to the household's place. */
export function nearestTheaters(home: Place | null): string {
  const near = home
    ? `the ${THEATERS_MAX} theaters showing it closest to the household, which lives at latitude ${home.lat}, longitude ${home.lon}`
    : `up to ${THEATERS_MAX} theaters showing it`;
  return `If it is playing in movie theaters now, name ${near}, each with its town and rough distance.`;
}

function asked(q: ShowQuery): string {
  if (q.by === 'title') {
    const known = [q.year && `from ${q.year}`, q.kind && `a ${q.kind === 'show' ? 'TV show' : 'movie'}`].filter(Boolean).join(', ');
    return `Someone in a household wants to watch "${q.title}"${known ? ` (${known})` : ''}. Work out which movie or TV show this is.`;
  }
  if (q.by === 'link') {
    return `Someone in a household pasted this link: ${q.url}\nIt may be a clip, a trailer, a post or an article. First ` +
      `work out which movie or TV show it is about.\n\nHere is what the page says:\n\n${pageSection(q.page)}\n\n` +
      (q.video ? `Here is what YouTube says about the video:\n\n${videoSection(q.video)}\n\n` : '') +
      `Viewers' comments often name the show when the clip doesn't, so read them. If the page above is missing or ` +
      `doesn't say, read the link with web fetch, comments included.`;
  }
  return `Someone in a household sent the picture above: a screenshot, a photo of a screen, a poster or a still. ` +
    `First work out which movie or TV show it is from.`;
}

/** §7F.2 — the look-up: plain notes from what the page and searches say, never guessed. */
export const showResearchPrompt = (q: ShowQuery, today: string, tz: string, home: Place | null) =>
  `${asked(q)}\nToday is ${today} in the household's time zone, ${tz}.\n\n` +
  `Then gather, using web search: its exact title, whether it is a movie or a TV show, and its year (when several ` +
  `match, choose the likeliest and name the others); its Rotten Tomatoes critics score (Tomatometer) and audience ` +
  `score (Popcornmeter) as rottentomatoes.com shows them; and how to watch it in the United States right now — in ` +
  `movie theaters, streaming with a subscription (name the service, and say "with ads" or the plan when it matters), ` +
  `on live TV (the channel), to rent or to buy (the store, and the price when found). ${nearestTheaters(home)} If it ` +
  `isn't out yet, say when and where it is coming. Add a one- or two-line summary of what it is about. Use only what ` +
  `the page and the searches say; never guess or fill in from general knowledge, and if something can't be found, ` +
  `say so. Answer as short plain notes, one fact per line.`;

/** §7F.2 — filling the reading's fields from the notes. */
export const showFillPrompt = (notes: string, today: string) =>
  `These are notes from looking up a movie or TV show for a household in the United States (today is ${today}):\n\n` +
  `${notes.trim() || '(none)'}\n\n` +
  `Fill in: title (its exact title, or null if the notes couldn't tell which movie or show it is), kind ("movie" or ` +
  `"show", or null), year (as the notes give it), rtCritics and rtAudience (the Rotten Tomatoes critics and audience ` +
  `percentages as whole numbers, or null), watch (every way to watch found, in the order found: how is "theater", ` +
  `"stream", "tv", "rent" or "buy"; where is the theater, service, channel or store; note is a short detail such as ` +
  `"with ads", a price, a distance and town, or a coming date, else null), summary (one or two lines), note (other ` +
  `shows that also matched, or anything else useful, else null). Use only what the notes say.`;
