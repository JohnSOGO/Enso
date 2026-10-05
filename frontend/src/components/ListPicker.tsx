// SPEC §8.8 — the Lists popup: one button per view (Today, Things to do, Movies & shows, every list with its emoji
// and open count, ＋ New list…), the chosen one marked. Holds no state of its own; HouseholdLists decides what each
// pick means and remembers it.
import { Modal } from './Modal';
import { listEmoji } from '../../../src/shared/lists';
import type { ListSummary } from './HouseholdListOptions';
import s from './HouseholdLists.module.css';

/** One picker button: its value (a list id or a special view), emoji, label and optional count. */
export interface PickerEntry { value: string; emoji: string; label: string; count?: number | null }

/** The fixed views first, then every list by name (⚑ Q157 emojis). */
export function pickerEntries(lists: readonly ListSummary[], fixed: readonly PickerEntry[]): PickerEntry[] {
  return [...fixed, ...lists.map((l) => ({ value: l.id, emoji: listEmoji(l), label: l.name, count: l.openCount }))];
}

export function ListPicker({ entries, chosen, onPick, onNew, onClose }: {
  entries: readonly PickerEntry[]; chosen: string; onPick: (value: string) => void; onNew: () => void; onClose: () => void;
}) {
  return (
    <Modal title="Lists" onClose={onClose}>
      <div className={s.grid}>
        {entries.map((e) => (
          <button key={e.value} className={s.pick} aria-pressed={e.value === chosen} onClick={() => onPick(e.value)}>
            <span aria-hidden className={s.pickEmoji}>{e.emoji}</span>
            <span className={s.pickName}>{e.label}</span>
            {e.count != null && <span className={`muted ${s.pickCount}`}>{e.count}</span>}
          </button>
        ))}
        <button className={s.pick} onClick={onNew}>
          <span aria-hidden className={s.pickEmoji}>＋</span>
          <span className={s.pickName}>New list…</span>
        </button>
      </div>
    </Modal>
  );
}
