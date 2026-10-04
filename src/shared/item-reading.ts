// SPEC §7A.3 — naming a snapped list item (pure): the prompt both readers get (SogoAI's local model and Claude),
// cleaning an answer into a list item's name, the SogoAI helper's report and its check, and the read's answer.
// Imports lists (TEXT_MAX), things (the photo limits) and vocab only. Shared by the Worker and home/ (§2.5).
import { TEXT_MAX } from './lists';
import { PHOTO_MAX_BYTES } from './things';
import { IDENTIFY_FAILURE, isOneOf, type IdentifyFailure, type ItemReadVia } from './vocab';

/** The longest name the prompt asks for. The name kept is cut at TEXT_MAX. ⚑ Q116 */
export const ITEM_NAME_ASK = 60;
/** What a reader answers when it can't tell what the item is. */
export const IDENTIFY_UNKNOWN = 'UNKNOWN';
/** The same instruction to SogoAI (the helper appends " /no_think") and to Claude. */
export const IDENTIFY_PROMPT =
  'This is a photo of a household item someone needs to buy again. Reply with ONLY a short shopping-list name ' +
  `for it (brand + product + size if visible), max ${ITEM_NAME_ASK} characters. If you cannot tell what it is, ` +
  `reply exactly: ${IDENTIFY_UNKNOWN}.`;

/** The helper's body cap: the same as a stored photo's (§7C.3). */
export const IDENTIFY_BODY_MAX = PHOTO_MAX_BYTES;
/** A report's text is cut to this many characters (room for a thinking block before the name). */
export const IDENTIFY_TEXT_MAX = 2000;
/** A report's failure reason is cut to this many characters. */
export const IDENTIFY_REASON_MAX = 300;

/** Cut to `max` characters, never inside a surrogate pair, trimmed. */
const cut = (s: string, max: number): string => s.slice(0, max).replace(/[\uD800-\uDBFF]$/, '').trim();

const QUOTES = /^["'`“”‘’]+|["'`“”‘’]+$/g;

/** A reader's raw answer → a list item's name, or null when it gave none: any <think>…</think> block dropped, the
 *  first non-empty line, whitespace collapsed, wrapping quotes and a trailing full stop stripped; empty, only quotes
 *  or UNKNOWN (any case) → null; else cut to TEXT_MAX. */
export function cleanItemName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.replace(/<think>[\s\S]*?(<\/think>|$)/gi, '');
  const first = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).find((l) => l.length > 0) ?? '';
  const name = first.replace(QUOTES, '').replace(/\.$/, '').replace(QUOTES, '').trim();
  if (!name || name.toUpperCase() === IDENTIFY_UNKNOWN) return null;
  return cut(name, TEXT_MAX) || null;
}

/** What the SogoAI helper's POST /identify answers (§7A.3), checked. */
export type IdentifyReport = { ok: true; text: string } | { ok: false; kind: IdentifyFailure; reason: string };

/** The helper's answer (through JSON) → checked, or a message saying what is wrong with it. */
export function parseIdentifyReport(body: unknown): IdentifyReport | string {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'The answer must be an identify report.';
  const r = body as Record<string, unknown>;
  if (r.ok === true) return typeof r.text === 'string' ? { ok: true, text: r.text.slice(0, IDENTIFY_TEXT_MAX) } : 'text must be text.';
  if (r.ok !== false) return 'ok must be true or false.';
  if (!isOneOf(IDENTIFY_FAILURE, r.kind)) return `kind must be one of: ${IDENTIFY_FAILURE.join(', ')}.`;
  const reason = typeof r.reason === 'string' ? cut(r.reason, IDENTIFY_REASON_MAX) : '';
  return reason ? { ok: false, kind: r.kind, reason } : 'reason must be non-empty text.';
}

/** POST /list-items/read-photo's answer: the name for the add box, and who read it (never shown). */
export interface ItemReading { name: string; via: ItemReadVia }
