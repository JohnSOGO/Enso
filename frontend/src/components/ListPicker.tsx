// SPEC §8.8 — the Lists popup: one button per view (Things to do, Movies & shows, every list with its emoji
// and open count, ＋ New list…), the chosen one marked. Holds no state of its own; HouseholdLists decides what each
// pick means and remembers it.
import { Modal } from './Modal';
import { PickGrid, type PickEntry } from './PickGrid';
import { listEmoji } from '../../../src/shared/lists';
import type { ListSummary } from './HouseholdListOptions';

/** One picker button: its value (a list id or a special view), emoji, label and optional count. */
export type PickerEntry = PickEntry;

const NEW = '\u0000new';

/** The fixed views first, then every list by name (⚑ Q157 emojis). */
export function pickerEntries(lists: readonly ListSummary[], fixed: readonly PickerEntry[]): PickerEntry[] {
  return [...fixed, ...lists.map((l) => ({ value: l.id, emoji: listEmoji(l), label: l.name, count: l.openCount }))];
}

export function ListPicker({ entries, chosen, onPick, onNew, onClose }: {
  entries: readonly PickerEntry[]; chosen: string; onPick: (value: string) => void; onNew: () => void; onClose: () => void;
}) {
  return (
    <Modal title="Lists" onClose={onClose}>
      <PickGrid entries={entries} chosen={chosen} extra={[{ value: NEW, emoji: '＋', label: 'New list…' }]}
        onPick={(v) => (v === NEW ? onNew() : onPick(v))} />
    </Modal>
  );
}
