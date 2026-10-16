// SPEC §8.3 — the day sheet: weather (§7.11), holidays, all-day events, timed events, then "+ Add event".
import { Modal } from './Modal';
import { useApp } from '../state';
import type { DayData, Occurrence } from './Calendar';
import { weatherText } from '../../../src/shared/weather';
import { participants } from '../participants';
import { canOpenEvent } from '../../../src/shared/event-access';
import { isAdmin } from '../../../src/shared/roles';
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
  const { memberById, members, me, clock } = useApp();
  const founder = members.find((m) => m.isFounder)?.id; // §8.3: MojoSOGO first
  const items = data?.items ?? [];
  const allDay = items.filter((o) => o.allDay);
  const timed = items.filter((o) => !o.allDay);

  const row = (o: DayData['items'][number]) => {
    const who = participants(o.assignedTo, members, founder); // §8.3: each person once; everyone → one green Family chip
    // §8.3: someone not going sees the same row, but it doesn't open (§6.3).
    const open = canOpenEvent(o, { id: me.id, admin: isAdmin(me) });
    const Row = open ? 'button' : 'div';
    return (
      <li key={`${o.eventId}-${o.date}`}>
        <Row className={open ? s.item : `${s.item} ${s.locked}`} onClick={open ? () => onOpenEvent(o) : undefined}>
          <span className={s.when}>{o.allDay ? (o.continued ? 'cont.' : 'All day') : clock(o.startTime!)}</span>
          <span className={s.bar} style={{ background: o.color }} />
          <span className={s.what}>
            <span className={s.title}>{o.emoji && `${o.emoji} `}{o.title}{o.hasReminder && <span aria-label="has reminder" title="Has a reminder"> 🔔</span>}{o.recurring && <span aria-label="repeats" title="Repeats"> 🔁</span>}{!open && <span aria-label="only the people going can open it" title="Only the people going can open it"> 🔒</span>}</span>
            <span className={s.meta}>
              {who.family ? <span className="chip" style={{ borderColor: 'var(--good)', background: 'var(--good)', color: '#0F172A', fontWeight: 600 }}>Family</span> : <>
                {!who.ids.includes(o.createdBy) && <span className="chip" style={{ borderColor: o.color }}>{o.creatorName}</span>}
                {who.ids.map((id) => <span key={id} className="chip" style={id === o.createdBy ? { borderColor: o.color } : undefined}>{memberById(id)?.displayName ?? 'unknown member'}</span>)}
              </>}
            </span>
          </span>
        </Row>
      </li>
    );
  };

  return (
    <Modal title={longDate(date)} onClose={onClose} footer={<button className="primary" onClick={onAdd}>＋ Add event</button>}>
      {data?.weather && <p className={s.holiday}>{weatherText(data.weather)}</p>}
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
