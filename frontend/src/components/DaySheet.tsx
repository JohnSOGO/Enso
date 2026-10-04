// SPEC §8.3 — the day sheet: holidays, all-day events, timed events, then "+ Add event".
import { Modal } from './Modal';
import { useApp } from '../state';
import type { DayData, Occurrence } from './Calendar';
import s from './Lists.module.css';

export function longDate(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

interface Props {
  date: string;
  data: DayData | undefined;
  onClose: () => void;
  onOpenEvent: (o: Occurrence) => void;
  onAdd: () => void;
}

export function DaySheet({ date, data, onClose, onOpenEvent, onAdd }: Props) {
  const { memberById, me } = useApp();
  const items = data?.items ?? [];
  const allDay = items.filter((o) => o.allDay);
  const timed = items.filter((o) => !o.allDay);

  const row = (o: DayData['items'][number]) => (
    <li key={`${o.eventId}-${o.date}`}>
      <button className={s.item} onClick={() => onOpenEvent(o)}>
        <span className={s.when}>{o.allDay ? (o.continued ? 'cont.' : 'All day') : o.startTime}</span>
        <span className={s.bar} style={{ background: o.color }} />
        <span className={s.what}>
          <span className={s.title}>{o.emoji && `${o.emoji} `}{o.title}{o.hasReminder && <span aria-label="has reminder" title="Has a reminder"> 🔔</span>}{o.recurring && <span aria-label="repeats" title="Repeats"> 🔁</span>}</span>
          <span className={s.meta}>
            <span className="chip" style={{ borderColor: o.color }}>{o.creatorName}</span>
            {o.assignedTo.map((id) => <span key={id} className="chip">→ {memberById(id)?.displayName ?? 'unknown member'}</span>)}
          </span>
        </span>
      </button>
    </li>
  );

  return (
    <Modal title={longDate(date)} onClose={onClose} footer={<button className="primary" onClick={onAdd}>＋ Add event</button>}>
      {!!me.showPublicHolidays && data?.publicHolidays.map((h) => <p key={h.name} className={s.holiday} style={{ background: 'var(--holiday-public-cell)', borderRadius: 6, padding: '2px 8px' }}>{h.emoji} {h.name} — day off</p>)}
      {!!me.showOptionsExpiration && data?.marketDays.map((m) => <p key={m.name} className={s.holiday}>{m.emoji} {m.name}</p>)}
      {items.length === 0 && <p className="muted">Nothing on this day.</p>}
      <ul className={s.list}>
        {allDay.map(row)}
        {timed.map(row)}
      </ul>
    </Modal>
  );
}
