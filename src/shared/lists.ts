// SPEC §7A.1 — household list item rules (pure). The route persists what these decide;
// matching is done here with itemKey, never with SQLite lower()/NOCASE (ASCII-only).
import { iso, ms } from './time';

export const TEXT_MAX = 120;
export const NOTE_MAX = 1000;
export const CHECKED_VISIBLE_DAYS = 30;

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
