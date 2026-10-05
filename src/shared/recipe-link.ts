// SPEC §7E.6 — reading a recipe from any link (pure): what kind of link was pasted (recipeLinkOf: a YouTube
// video, or any other public page with its share and tracking junk cleaned off), the site's name, the limits
// and the two prompts. The Worker fetches the page (page-fetch.ts) and asks Claude (recipe-link-reader.ts); the
// answer is cleaned by cleanRecipeReading like a video's. Imports recipes and link-reading only; neither imports it.
import { youtubeVideoId } from './recipes';
import { pageSection, readableLink, type PageResult } from './link-reading';

export const RECIPE_LINK_SEARCHES_MAX = 3;
export const RECIPE_LINK_FETCHES_MAX = 2;

/** What a pasted link is: a YouTube video (§7E.2) or a page (§7E.6), its link cleaned. */
export type RecipeLinkKind = { kind: 'video'; videoId: string } | { kind: 'page'; link: string };

const FACEBOOK_HOSTS = new Set(['facebook.com', 'www.facebook.com', 'm.facebook.com', 'web.facebook.com', 'mbasic.facebook.com']);
/** On Facebook only these name the post; the rest is share junk. ⚑ Q167 */
const FACEBOOK_KEEP = new Set(['v', 'id', 'story_fbid', 'fbid']);
/** Tracking parameters dropped from every other site's link. ⚑ Q167 */
const TRACKING = new Set(['fbclid', 'gclid', 'mibextid', 'igsh', 'igshid', 'si']);

/** A pasted link → a video, a page (cleaned: the duplicate key and what is stored), or null. */
export function recipeLinkOf(text: unknown): RecipeLinkKind | null {
  const videoId = youtubeVideoId(text);
  if (videoId) return { kind: 'video', videoId };
  const link = typeof text === 'string' ? readableLink(text) : null;
  if (!link) return null;
  const u = new URL(link);
  u.hash = '';
  const facebook = FACEBOOK_HOSTS.has(u.hostname);
  if (facebook) u.hostname = 'www.facebook.com';
  for (const k of [...new Set(u.searchParams.keys())]) {
    if (facebook ? !FACEBOOK_KEEP.has(k) : TRACKING.has(k.toLowerCase()) || k.toLowerCase().startsWith('utm_')) u.searchParams.delete(k);
  }
  return { kind: 'page', link: u.href };
}

const SITES: [string, string][] = [['facebook.com', 'Facebook'], ['fb.watch', 'Facebook'], ['instagram.com', 'Instagram'],
  ['tiktok.com', 'TikTok'], ['pinterest.com', 'Pinterest']];

/** The site's name for `channel` and the view: a known one by host, else the host without www. ⚑ Q168 */
export function siteName(link: string): string {
  const host = new URL(link).hostname.toLowerCase();
  return SITES.find(([h]) => host === h || host.endsWith(`.${h}`))?.[1] ?? host.replace(/^www\./, '');
}

const ONLY_THIS =
  `Use only what the page, the post's own caption, or the creator's own recipe for this same dish (where the post ` +
  `points to it: their website, a pinned comment) says. Never use another creator's recipe for the dish, never fill ` +
  `in from general cooking knowledge, and never invent a recipe from the title.`;

/** §7E.6 step 8 — the look-up: plain notes of the recipe this link gives, or that it couldn't be found. */
export const recipeResearchPrompt = (link: string, site: string, page: PageResult) =>
  `Someone in a household pasted this link to save a recipe: ${link}\nThe site: ${site}.\n\n` +
  `Here is what the page says when fetched:\n\n${pageSection(page)}\n\n` +
  `Find the recipe this link gives. On a recipe site it is on the page (often in its structured data). For a ` +
  `video or social post (Facebook, Instagram, TikTok) it is usually in the post's caption or description, or the ` +
  `creator links the full recipe. If the page above is missing, a login wall, or doesn't hold the recipe, read the ` +
  `link with web fetch, and use web search to find this same post's caption or the creator's own recipe. ` +
  `${ONLY_THIS} Answer as plain notes: the dish's name, who made it, the ingredients with their amounts as ` +
  `written, the steps in order, servings and time if stated, and where you found them. If you can't find the ` +
  `recipe itself, say so plainly.`;

/** §7E.6 step 9 — filling the recipe schema from the page and the notes. */
export const recipeFillPrompt = (link: string, page: PageResult, notes: string) =>
  `This is about a link someone pasted to save a recipe: ${link}\n\n` +
  `What the page says:\n\n${pageSection(page)}\n\n` +
  `Notes from looking it up:\n${notes.trim() || '(none)'}\n\n` +
  `Fill in: found (true only when the page or the notes actually state this recipe's ingredients or steps), title ` +
  `(the dish's name), ingredients (one per item, with its amount, as written), steps (one per step, in order, short ` +
  `and clear), servings and time (only when stated; otherwise null). ${ONLY_THIS} Never fill in missing amounts ` +
  `or steps. If neither holds the recipe, answer found false with empty ingredients and steps.`;

/** The title of a found:false link recipe: the page's og:title or <title>, else "Recipe from {site}". */
export function pageTitle(page: PageResult, site: string): string {
  const og = page.ok ? page.page.meta.find((m) => m.startsWith('og:title: '))?.slice('og:title: '.length) : undefined;
  return (og || (page.ok ? page.page.title : null) || '').trim() || `Recipe from ${site}`;
}
