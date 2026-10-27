// SPEC §7.13 — school days off: the kids' school calendar, one hand-typed table a school year. Swap the rows next year.
import { addDays } from './time';

export interface SchoolDay { date: string; name: string; emoji: string }

type Kind = 'off' | 'minimum' | 'return';

const KIND: Record<Kind, { emoji: string; words: string | null }> = {
  off: { emoji: '🏫', words: 'No school' },
  minimum: { emoji: '🕛', words: 'Minimum day' },
  return: { emoji: '🎒', words: null },
};

/** Vista Unified 2026–27, in date order; `to` is the last day, inclusive. */
export const SCHOOL_DAYS: { from: string; to: string; name: string; kind: Kind; emoji?: string }[] = [
  { from: '2026-11-11', to: '2026-11-11', name: 'Veterans Day', kind: 'off' },
  { from: '2026-11-18', to: '2026-11-19', name: 'Middle school conferences', kind: 'minimum' },
  { from: '2026-11-23', to: '2026-11-27', name: 'Thanksgiving break', kind: 'off' },
  { from: '2026-12-21', to: '2027-01-05', name: 'Winter break', kind: 'off' },
  { from: '2027-01-06', to: '2027-01-06', name: 'Students return', kind: 'return' },
  { from: '2027-01-18', to: '2027-01-18', name: 'Martin Luther King Jr. Day', kind: 'off' },
  { from: '2027-02-15', to: '2027-02-19', name: "Presidents' Week", kind: 'off' },
  { from: '2027-02-24', to: '2027-02-24', name: 'Staff development', kind: 'minimum' },
  { from: '2027-03-10', to: '2027-03-11', name: 'Middle school conferences', kind: 'minimum' },
  { from: '2027-03-26', to: '2027-04-02', name: 'Spring break', kind: 'off' },
  { from: '2027-04-05', to: '2027-04-05', name: 'Students return', kind: 'return' },
  { from: '2027-05-31', to: '2027-05-31', name: 'Memorial Day', kind: 'off' },
  { from: '2027-06-03', to: '2027-06-03', name: 'Last day of school', kind: 'minimum', emoji: '🎓' },
];

/** One entry per day from `from` to `to` (inclusive), every day of a stretch, weekends too. */
export function schoolDaysBetween(from: string, to: string): SchoolDay[] {
  const out: SchoolDay[] = [];
  for (const row of SCHOOL_DAYS) {
    if (row.to < from || row.from > to) continue;
    const k = KIND[row.kind];
    const day = { name: k.words ? `${row.name} — ${k.words}` : row.name, emoji: row.emoji ?? k.emoji };
    for (let d = row.from; d <= row.to; d = addDays(d, 1)) if (d >= from && d <= to) out.push({ date: d, ...day });
  }
  return out;
}
