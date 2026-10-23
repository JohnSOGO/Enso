// SPEC §6.3 "Who opens an event" and "Private events", §8.3 — who may open an event's details, and what a private one
// shows to whoever may not (pure, imports nothing). routes/events.ts, routes/optins.ts and DaySheet.tsx ask these rules.

interface EventSeen { assignedTo: readonly string[]; createdBy: string | null }
interface Viewer { id: string; admin: boolean }

/** Nobody assigned (everyone's event), assigned, its creator, or an admin. canChange ⇒ canOpenEvent. */
export function canOpenEvent(event: EventSeen, viewer: Viewer): boolean {
  return event.assignedTo.length === 0 || event.assignedTo.includes(viewer.id) || event.createdBy === viewer.id || viewer.admin;
}

/** §6.3 — the refusal sentence for GET /events/{id}. */
export const cannotOpenText = 'Only the people going can open this event.';

/** §6.3 Private events — a private event's summary is hidden from whoever may not open it. */
export const isMaskedFor = (event: EventSeen & { private: boolean }, viewer: Viewer): boolean => event.private && !canOpenEvent(event, viewer);

/** ⚑ Q382 — what a masked event is called, and its bar's colour instead of the creator's. */
export const PRIVATE_TITLE = 'Private';
export const PRIVATE_COLOR = '#64748B';

/** ⚑ Q383 — Private needs someone going. */
export const privateNeedsGoingText = "Tick who's going to make it private.";

interface Shown { title: string; emoji: string | null; assignedTo: readonly string[]; createdBy: string | null; color: string; creatorName: string;
  hasReminder: boolean; hasNotes: boolean; recurring: boolean }

/** ⚑ Q382 — a /calendar occurrence cut to its date and times: titled Private, nobody, no marks, `masked`. */
export function maskOccurrence<T extends Shown>(o: T): T & { masked: true } {
  return { ...o, title: PRIVATE_TITLE, emoji: null, assignedTo: [], createdBy: null, color: PRIVATE_COLOR, creatorName: '',
    hasReminder: false, hasNotes: false, recurring: false, masked: true };
}
