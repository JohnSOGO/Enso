// SPEC §8.6 / §8.8 — the grid of emoji buttons both popups use (Settings areas, Lists). Holds no state and never
// decides what a pick means; the screen that renders it does.
import type { ReactNode } from 'react';
import s from './PickGrid.module.css';

/** One button: its value, emoji, label and optional count. */
export interface PickEntry { value: string; emoji: string; label: string; count?: number | null }

/** The emoji / name / count of one entry; also the face of the Lists button. */
export function PickFace({ emoji, label, count }: Omit<PickEntry, 'value'>) {
  return (
    <>
      <span aria-hidden className={s.pickEmoji}>{emoji}</span>
      <span className={s.pickName}>{label}</span>
      {count != null && <span className={`muted ${s.pickCount}`}>{count}</span>}
    </>
  );
}

/** Two columns (one under 360 px); `chosen` is marked pressed; `extra` buttons follow the entries. */
export function PickGrid({ entries, chosen, onPick, extra }: {
  entries: readonly PickEntry[]; chosen?: string; onPick: (value: string) => void; extra?: readonly Omit<PickEntry, 'count'>[];
}) {
  const button = (e: PickEntry, pressed: boolean | undefined, onClick: () => void): ReactNode => (
    <button key={e.value} className={s.pick} aria-pressed={pressed} onClick={onClick}><PickFace {...e} /></button>
  );
  return (
    <div className={s.grid}>
      {entries.map((e) => button(e, chosen === undefined ? undefined : e.value === chosen, () => onPick(e.value)))}
      {extra?.map((e) => button(e, undefined, () => onPick(e.value)))}
    </div>
  );
}
