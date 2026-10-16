// SPEC §6.3 "Who opens an event", §8.3 — who may open an event's details (pure, imports nothing).
// Everyone sees the summary (title, time, emoji, who's going); routes/events.ts and DaySheet.tsx ask this rule.

/** Nobody assigned (everyone's event), assigned, its creator, or an admin. canChange ⇒ canOpenEvent. */
export function canOpenEvent(event: { assignedTo: readonly string[]; createdBy: string | null }, viewer: { id: string; admin: boolean }): boolean {
  return event.assignedTo.length === 0 || event.assignedTo.includes(viewer.id) || event.createdBy === viewer.id || viewer.admin;
}

/** §6.3 — the refusal sentence for GET /events/{id}. */
export const cannotOpenText = 'Only the people going can open this event.';
