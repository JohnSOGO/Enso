// SPEC §7A.1 — household list and list item rules (pure). The route persists what these decide;
// matching is done here with itemKey, never with SQLite lower()/NOCASE (ASCII-only).
import { iso, ms } from './time';

export const TEXT_MAX = 120;
export const NOTE_MAX = 1000;
export const LIST_NAME_MAX = 40;
export const LISTS_MAX = 30;
export const CHECKED_VISIBLE_DAYS = 30;

/** The seeded Shopping list (migration 0007) — the one place its id is named outside the migration. */
export const SHOPPING_LIST_ID = 'lst_shopping';

/** Naming list `id` (null when creating) `name`: the other non-deleted list already holding that key, if any (→ 409 duplicate). */
export function listNameClash<T extends { id: string; name_key: string }>(id: string | null, name: string, lists: readonly T[]): T | null {
  const key = itemKey(name);
  return lists.find((l) => l.id !== id && l.name_key === key) ?? null;
}

/** §7A.1 ⚑ Q157 — a list without its own emoji: the first keyword found in its name, else 📋. */
const NAME_EMOJIS: readonly [RegExp, string][] = [
  [/shop|grocer|store|market/, '🛒'],
  [/wish|gift|birthday|christmas/, '🎁'],
  [/hardware|tool|fix|repair/, '🔨'],
  [/garden|plant/, '🌱'],
  [/pharmacy|medicine/, '💊'],
  [/pack|trip|travel|camp/, '🧳'],
  [/book/, '📚'],
  [/pet|dog|cat/, '🐾'],
  [/school|kid/, '🎒'],
  [/meal|food|cook/, '🍽️'],
  [/clean/, '🧽'],
  [/house|home/, '🏠'],
];
export const DEFAULT_LIST_EMOJI = '📋';

export function defaultListEmoji(name: string): string {
  const key = itemKey(name);
  return NAME_EMOJIS.find(([re]) => re.test(key))?.[1] ?? DEFAULT_LIST_EMOJI;
}

/** What a list shows: its own emoji, else the default from its name. */
export const listEmoji = (l: { name: string; emoji: string | null }): string => l.emoji ?? defaultListEmoji(l.name);

const DAY_MS = 86_400_000;

/** The one-item-per-thing key: trimmed, lower-cased, inner whitespace collapsed to one space. */
export function itemKey(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Checked items older than this instant are kept in the table but not shown. */
export function checkedCutoff(now: string): string {
  return iso(ms(now) - CHECKED_VISIBLE_DAYS * DAY_MS);
}

/** The fields the rules need from a stored (non-deleted) item. */
export interface KeyedItem {
  id: string;
  text_key: string;
  checked_at: string | null;
}

export type AddDecision<T extends KeyedItem> =
  | { kind: 'existing'; item: T }
  | { kind: 'reopen'; item: T }
  | { kind: 'insert'; key: string };

/** Adding `text` to a list holding `items` (its non-deleted rows): never makes a duplicate. */
export function resolveAdd<T extends KeyedItem>(text: string, items: readonly T[]): AddDecision<T> {
  const key = itemKey(text);
  const match = items.find((i) => i.text_key === key);
  if (!match) return { kind: 'insert', key };
  return match.checked_at === null ? { kind: 'existing', item: match } : { kind: 'reopen', item: match };
}

/** Renaming item `id` to `text`: the other item already holding that key, if any (→ 409 duplicate). */
export function renameClash<T extends KeyedItem>(id: string, text: string, items: readonly T[]): T | null {
  const key = itemKey(text);
  return items.find((i) => i.id !== id && i.text_key === key) ?? null;
}

/** What GET /lists/{list} shows: open items newest first, checked within the window newest first. */
export function visibleItems<T extends KeyedItem & { updated_at: string }>(items: readonly T[], now: string): { open: T[]; checked: T[] } {
  const cutoff = checkedCutoff(now);
  const open = items.filter((i) => i.checked_at === null).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const checked = items
    .filter((i) => i.checked_at !== null && i.checked_at >= cutoff)
    .sort((a, b) => b.checked_at!.localeCompare(a.checked_at!));
  return { open, checked };
}

// ── §7A.4 Every day lists ─────────────────────────────────────────────

/** A ping more than this many minutes past its time is not sent (⚑ Q289). */
export const PING_LATE_MIN = 60;

/** Items as they stand today on an every day list: a tick from before `dayStart` (today's local midnight, UTC) reads
 *  as open. Nothing is written. */
export function todaysItems<T extends { checked_at: string | null }>(items: readonly T[], dayStart: string): T[] {
  return items.map((i) => (i.checked_at !== null && i.checked_at < dayStart ? { ...i, checked_at: null } : i));
}

/** Open items on an every day list (⚑ Q290): timed first, earliest first, then the rest in the order given. */
export function dailyOrder<T extends { time: string | null }>(items: readonly T[]): T[] {
  const timed = items.filter((i) => i.time !== null).sort((a, b) => a.time!.localeCompare(b.time!));
  return [...timed, ...items.filter((i) => i.time === null)];
}

/** Whether an item at `time` pings now, the household's local `HH:MM` being `localNow`: at or past it, under PING_LATE_MIN. */
export function pingDue(time: string, localNow: string): boolean {
  const min = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const late = min(localNow) - min(time);
  return late >= 0 && late < PING_LATE_MIN;
}

/** A list ping's title (⚑ Q291): the list's emoji and name. */
export const listPingTitle = (l: { name: string; emoji: string | null }): string => `${listEmoji(l)} ${l.name}`;
