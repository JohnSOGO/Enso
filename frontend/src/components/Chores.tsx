// SPEC §8.5 — the Chores section of the Alarms tab: one line per chore, sorted by time.
// Whose turn it is comes from the server (thisWeek / nextWeek); nothing is computed here.
import { useEffect, useState } from 'react';
import { daysText } from './AlertFields';
import { errorText, get } from '../api';
import { useApp } from '../state';
import type { Channel, ChoreTiming, Weekday } from '../../../src/shared/vocab';
import type { ChoreStep } from '../../../src/shared/chores';
import s from './Lists.module.css';

/** A chore as GET /chores returns it (§10). */
export interface Chore {
  id: string; title: string; doneMeans: string | null; days: Weekday[]; timing: ChoreTiming; time: string;
  nudge: boolean; people: string[]; steps: ChoreStep[]; channels: Channel[]; renotifyMin: number | null;
  createdBy: string; thisWeek: string | null; nextWeek: string | null;
}

export function ChoresSection({ onEdit }: { onEdit: (c: Chore | null) => void }) {
  const { version, memberById } = useApp();
  const [chores, setChores] = useState<Chore[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    get<Chore[]>('/chores').then((c) => { setChores(c); setError(null); }).catch((e) => setError(errorText(e)));
  }, [version]);

  const name = (id: string | null) => (id ? memberById(id)?.displayName ?? 'unknown member' : 'anyone');
  const turn = (c: Chore) => (c.people.length > 1 ? `${name(c.thisWeek)} → ${name(c.nextWeek)}` : name(c.thisWeek));
  const sorted = chores && [...chores].sort((a, b) => a.time.localeCompare(b.time) || a.title.localeCompare(b.title));

  return (
    <section className={s.section} aria-label="Chores">
      <div className="row" style={{ marginBottom: 6 }}>
        <h2 style={{ flex: 1, marginBottom: 0 }}>Chores</h2>
        <button onClick={() => onEdit(null)}>＋ Add</button>
      </div>
      <p className="muted" style={{ fontSize: '.85rem', marginBottom: 10 }}>Jobs on chosen days, taking turns. Ticked off in Lists → Today.</p>
      {error && <div role="alert" className="alert-error">{error}</div>}
      {sorted === null && !error && <p className="muted">Loading…</p>}
      {sorted?.length === 0 && <p className="muted">No chores yet.</p>}
      {!!sorted?.length && (
        <table className={s.table}>
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Chore</th>
              <th scope="col">Days</th>
              <th scope="col">This week</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => (
              <tr key={c.id} onClick={() => onEdit(c)} style={{ cursor: 'pointer' }}>
                <td className={s.rigid}>{c.time} <span className="muted">{c.timing}</span></td>
                <th scope="row" className={s.flexible}>
                  <button className="plain" style={{ textAlign: 'left', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={`Edit ${c.title}`} onClick={(e) => { e.stopPropagation(); onEdit(c); }}>
                    {c.title}
                    {c.steps.length > 1 && <><sup aria-hidden> {c.steps.length}</sup><span className="visually-hidden">, {c.steps.length} steps</span></>}
                  </button>
                </th>
                <td className={s.rigid}>{daysText(c.days)}</td>
                <td className={s.rigid}>{turn(c)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
