// SPEC §7.10 — an event's things to bring: the cleaning shared by the Worker and the form, and the reminder's words. Pure.
import { EVENT_BRING_ITEM_MAX, EVENT_BRING_MAX } from './alert-limits';

/** Trimmed lines, empties and repeats (ignoring case) dropped, order kept; null when not a list of short enough lines. */
export function cleanBring(v: unknown): string[] | null {
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) return null;
  const seen = new Set<string>(), out: string[] = [];
  for (const line of (v as string[]).map((x) => x.trim())) {
    if (line.length > EVENT_BRING_ITEM_MAX) return null;
    if (!line || seen.has(line.toLowerCase())) continue;
    seen.add(line.toLowerCase());
    out.push(line);
  }
  return out.length > EVENT_BRING_MAX ? null : out;
}

/** "bring: shin guards, water and GPS watch" — first letters lowered unless a line opens with two capitals (⚑ Q199). */
export function bringText(lines: string[]): string {
  const said = lines.map((l) => (/^[A-Z]{2}/.test(l) ? l : l.charAt(0).toLowerCase() + l.slice(1)));
  const list = said.length > 1 ? `${said.slice(0, -1).join(', ')} and ${said[said.length - 1]}` : said.join('');
  return `bring: ${list}`;
}
