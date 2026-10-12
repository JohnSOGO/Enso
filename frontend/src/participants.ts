// SPEC §7.1 / §8.3 — who an event is for, as shown: each person once, everyone → "Family".
// Pure: no React, no app state. Used by components/DayCell.tsx (dots) and DaySheet.tsx (chips).

export interface Participants { family: boolean; ids: string[] }

/** Dedupes `assignedTo`; `family` when it covers every active member of a household of two or more. */
export function participants(assignedTo: string[], members: { id: string; disabledAt: string | null }[]): Participants {
  const ids = [...new Set(assignedTo)];
  const active = members.filter((m) => !m.disabledAt);
  const family = active.length >= 2 && active.every((m) => ids.includes(m.id));
  return { family, ids };
}
