// SPEC §7E.5 — each person's emoji on a recipe (pure): mine, the By emoji order, and the household's chips
// for the picker. Imports recipes (types) only.
import type { Recipe } from './recipes';

/** The picker's household chips, at most. ⚑ Q72 */
export const USED_EMOJIS_MAX = 12;

export const myEmoji = (r: Pick<Recipe, 'emojis'>, memberId: string): string | null =>
  r.emojis.find((e) => e.memberId === memberId)?.emoji ?? null;

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** Newest first: createdAt, then id, both descending — the server's list order. */
const newestFirst = (a: Recipe, b: Recipe) => byText(b.createdAt, a.createdAt) || byText(b.id, a.id);

/**
 * By emoji ⚑ Q71: grouped by MY emoji — the biggest group first; equal groups by their newest recipe's createdAt,
 * then the emoji string; newest first within a group; recipes I haven't given an emoji last, newest first.
 */
export function byMyEmoji(recipes: readonly Recipe[], memberId: string): Recipe[] {
  const groups = new Map<string, Recipe[]>();
  const unrated: Recipe[] = [];
  for (const r of [...recipes].sort(newestFirst)) {
    const e = myEmoji(r, memberId);
    if (e === null) unrated.push(r);
    else groups.set(e, [...(groups.get(e) ?? []), r]);
  }
  const ordered = [...groups].sort(([ea, a], [eb, b]) => b.length - a.length || byText(b[0].createdAt, a[0].createdAt) || byText(ea, eb));
  return [...ordered.flatMap(([, rs]) => rs), ...unrated];
}

/** The household's emojis on these recipes, most used first (ties by the string), at most USED_EMOJIS_MAX. */
export function usedEmojis(recipes: readonly Pick<Recipe, 'emojis'>[]): string[] {
  const counts = new Map<string, number>();
  for (const r of recipes) for (const { emoji } of r.emojis) counts.set(emoji, (counts.get(emoji) ?? 0) + 1);
  return [...counts].sort(([ea, a], [eb, b]) => b - a || byText(ea, eb)).slice(0, USED_EMOJIS_MAX).map(([e]) => e);
}
