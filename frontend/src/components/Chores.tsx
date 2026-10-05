// SPEC §8.15 — the 🧹 Chores tab: Today (ChoresToday) on top, then All chores — one line per chore, sorted by time
// (§8.5). A row opens the chore's What done looks like sheet. Whose turn it is comes from the server (thisWeek /
// nextWeek); nothing is computed here.
import { useEffect, useState } from 'react';
import { daysText } from './AlertFields';
import { ChoresToday } from './ChoresToday';
import { errorText, get } from '../api';
import { useApp } from '../state';
import type { Channel, ChoreTiming, Weekday } from '../../../src/shared/vocab';
import type { ChoreStep } from '../../../src/shared/chores';
import s from './Lists.module.css';

/** A chore as GET /chores returns it (§10). */
export interface Chore {
  id: string; title: string; doneMeans: string | null; days: Weekday[]; timing: ChoreTiming; time: string;
  nudge: boolean; people: string[]; steps: ChoreStep[]; channels: Channel[]; renotifyMin: number | null;
  createdBy: string; thisWeek: string | null; nextWeek: string | null; areaCount: number;
}

export function ChoresTab({ onEdit, onOpenAreas }: { onEdit: (c: Chore | null) => void; onOpenAreas: (c: Chore) => void }) {
  const { version, memberById } = useApp();
  const [chores, setChores] = useState<Chore[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    get<Chore[]>('/chores').then((c) => { setChores(c); setError(null); }).catch((e) => setError(errorText(e)));
  }, [version]);

  const name = (id: string | null) => (id ? memberById(id)?.displayName ?? 'unknown member' : 'anyone');
  const turn = (c: Chore) => (c.people.length > 1 ? `${name(c.thisWeek)} → ${name(c.nextWeek)}` : name(c.thisWeek));
  const sorted = chores && [...chores].sort((a, b) => a.time.localeCompare(b.time) || a.title.localeCompare(b.title));
  const openAreas = (choreId: string) => { const c = chores?.find((x) => x.id === choreId); if (c) onOpenAreas(c); };

  return (
    <div style={{ padding: 12, overflowY: 'auto', height: '100%' }}>
      <section className={s.section} aria-label="Today">
        <h1 style={{ fontSize: '1.15rem', marginBottom: 12 }}>Today</h1>
        <ChoresToday onOpenAreas={openAreas} />
      </section>
      <section className={s.section} aria-label="All chores">
        <div className="row" style={{ marginBottom: 6 }}>
          <h2 style={{ flex: 1, marginBottom: 0 }}>All chores</h2>
          <button onClick={() => onEdit(null)}>＋ Add</button>
        </div>
        <p className="muted" style={{ fontSize: '.85rem', marginBottom: 10 }}>Jobs on chosen days, taking turns. Tap one to see what done looks like.</p>
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
                <tr key={c.id} onClick={() => onOpenAreas(c)} style={{ cursor: 'pointer' }}>
                  <td className={s.rigid}>{c.time} <span className="muted">{c.timing}</span></td>
                  <th scope="row" className={s.flexible}>
                    <button className="plain" style={{ textAlign: 'left', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={`What done looks like: ${c.title}`} onClick={(e) => { e.stopPropagation(); onOpenAreas(c); }}>
                      {c.title}
                      {c.steps.length > 1 && <><sup aria-hidden> {c.steps.length}</sup><span className="visually-hidden">, {c.steps.length} steps</span></>}
                      {c.areaCount > 0 && <><span aria-hidden> 📋</span><span className="visually-hidden">, {c.areaCount} areas</span></>}
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
    </div>
  );
}
