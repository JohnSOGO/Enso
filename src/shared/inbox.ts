// SPEC §7H — 📥 Send to Enso (pure): the limits, the key's format, which shared string is the link and which the text,
// what a shared file is by its first bytes, an item's kind and the line the Shortcut shows. Never reads the clock.
import { PHOTO_TYPES } from './photos';
import type { InboxKind } from './vocab';

export const INBOX_TEXT_MAX = 4000;
export const INBOX_URL_MAX = 2000;
export const INBOX_PHOTO_MAX_BYTES = 12 * 1024 * 1024; // ⚑ Q322 a full-size iPhone photo, kept as sent
export const INBOX_PHOTOS_MAX = 10;
export const INBOX_LIST_MAX = 200;
export const SHARE_PER_HOUR = 60;
export const SHARE_KEY_PREFIX = 'enso_';

/** §7H.3 the wire shape of GET /inbox. */
export interface InboxItem { id: string; kind: InboxKind; url: string | null; text: string | null; hasPhoto: boolean; createdAt: string }

/** The ISO instant one hour before `now` (the hourly limit's window). */
export const shareWindowStart = (now: string) => new Date(Date.parse(now) - 3_600_000).toISOString();

/** Looks like a key we made (cheap refusal before any hash). */
export const isShareKey = (v: string) => /^enso_[0-9A-Z]{32}$/.test(v);

const ONE_LINK = /^https?:\/\/\S+$/i;
const A_LINK = /https?:\/\/[^\s<>"']+/i;

/** §7H.2 step 3 ⚑ Q321: the first string that is one http(s) link is the url, the rest the text; else the first
 * link inside the text is the url and the text is kept. Text cut to INBOX_TEXT_MAX. Null when nothing is left. */
export function shareText(strings: readonly string[]): { url: string | null; text: string | null } | null {
  const parts = strings.map((x) => x.trim()).filter((x) => x.length > 0);
  const at = parts.findIndex((x) => ONE_LINK.test(x));
  let url: string | null = at >= 0 ? parts[at] : null;
  const rest = parts.filter((_, i) => i !== at).join('\n\n');
  if (url === null) url = A_LINK.exec(rest)?.[0].replace(/[).,;:!?]+$/, '') ?? null;
  const text = rest ? rest.slice(0, INBOX_TEXT_MAX) : null;
  return url === null && text === null ? null : { url, text };
}

const ascii = (b: Uint8Array, from: number, n: number) => String.fromCharCode(...b.subarray(from, from + n));

/** §7H.2 ⚑ Q320: a photo by its first bytes, never the declared type → a PHOTO_TYPES member, or null. */
export function photoTypeOf(b: Uint8Array): (typeof PHOTO_TYPES)[number] | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 3) === 'PNG') return 'image/png';
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'image/webp';
  if (b.length >= 12 && ascii(b, 4, 4) === 'ftyp' && ['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1'].includes(ascii(b, 8, 4))) return 'image/heic';
  return null;
}

/** An item's kind, from which of its parts are set (§4.2zzb). */
export const inboxKind = (r: { photo_key: string | null; url: string | null }): InboxKind =>
  r.photo_key ? 'photo' : r.url ? 'link' : 'text';

/** §7H.2 step 7 — what the Shortcut shows. */
export const shareMessage = (n: number) => (n === 1 ? '✅ Saved to your Enso Inbox' : `✅ ${n} saved to your Enso Inbox`);
