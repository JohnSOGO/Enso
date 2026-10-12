// SPEC §8.15 — the 🧹 Chores tab: a menu of ✅ Today (ChoresToday), 🪙 Bounties and 🏅 Score (§8.15b), 🧽 Messes (§8.15a)
// and 📋 All chores (one line per chore, sorted by time, §8.5, 🪙 n when it has a bounty), the tapped one in a Modal. A row opens the chore's What done looks like sheet. Whose
// turn it is comes from the server (thisWeek / nextWeek); nothing is computed here. Holds which section is open.
import { useEffect, useState, type ReactNode } from 'react';
import { Modal } from './Modal';
import { PickGrid } from './PickGrid';
import { daysText } from './AlertFields';
import { ChoresToday, whenText } from './ChoresToday';
import { MessesSection } from './Messes';
import { BountiesSection } from './Bounties';
import { ScoreSection } from './Score';
import { errorText, get } from '../api';
import { useApp } from '../state';
import type { Channel, ChoreTiming, Weekday } from '../../../src/shared/vocab';
import type { ChoreStep } from '../../../src/shared/chores';
import s from './Lists.module.css';

/** A chore as GET /chores returns it (§10). */
export interface Chore {
  id: string; title: string; doneMeans: string | null; days: Weekday[]; timing: ChoreTiming; time: string; sunOffsetMin: number | null;
  nudge: boolean; people: string[]; steps: ChoreStep[]; channels: Channel[]; renotifyMin: number | null;
  createdBy: string; thisWeek: string | null; nextWeek: string | null; areaCount: number; bounty: number | null; roomId: string | null;
}

type Section = 'today' | 'bounties' | 'messes' | 'all' | 'score';

/** ⚑ Q245, Q255 — the menu, as on Settings (§8.6) and Alarms (§8.5); Today first. */
const SECTIONS: readonly { value: Section; emoji: string; label: string }[] = [
  { value: 'today', emoji: '✅', label: 'Today' }, { value: 'bounties', emoji: '🪙', label: 'Bounties' },
  { value: 'messes', emoji: '🧽', label: 'Messes' }, { value: 'all', emoji: '📋', label: 'All chores' },
  { value: 'score', emoji: '🏅', label: 'Score' },
];

export function ChoresTab({ onEdit, onOpenAreas }: { onEdit: (c: Chore | null) => void; onOpenAreas: (c: Chore) => void }) {
  const { version, memberById } = useApp();
  const [chores, setChores] = useState<Chore[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Section | null>(null);
  useEffect(() => {
    get<Chore[]>('/chores').then((c) => { setChores(c); setError(null); }).catch((e) => setError(errorText(e)));
  }, [version]);

  const name = (id: string | null) => (id ? memberById(id)?.displayName ?? 'unknown member' : 'anyone');
  const turn = (c: Chore) => (c.people.length > 1 ? `${name(c.thisWeek)} → ${name(c.nextWeek)}` : name(c.thisWeek));
  const sorted = chores && [...chores].sort((a, b) => a.time.localeCompare(b.time) || a.title.localeCompare(b.title));
  const openAreas = (choreId: string) => { const c = chores?.find((x) => x.id === choreId); if (c) onOpenAreas(c); };

  const body: Record<Section, () => ReactNode> = {
    today: () => <ChoresToday onOpenAreas={openAreas} />,
    bounties: () => <BountiesSection chores={sorted} />,
    messes: () => <MessesSection />,
    score: () => <ScoreSection />,
    all: () => <AllChoresSection sorted={sorted} error={error} turn={turn} onEdit={onEdit} onOpenAreas={onOpenAreas} />,
  };
  const shown = SECTIONS.find((x) => x.value === open);
  return (
    <div style={{ padding: 12, overflowY: 'auto', height: '100%' }}>
      <h1 style={{ fontSize: '1.15rem', marginBottom: 12 }}>Chores</h1>
      <PickGrid entries={SECTIONS} onPick={(v) => setOpen(v as Section)} />
      {shown && <Modal title={`${shown.emoji} ${shown.label}`} onClose={() => setOpen(null)}>{body[shown.value]()}</Modal>}
    </div>
  );
}

function AllChoresSection({ sorted, error, turn, onEdit, onOpenAreas }: {
  sorted: Chore[] | null; error: string | null; turn: (c: Chore) => string;
  onEdit: (c: Chore | null) => void; onOpenAreas: (c: Chore) => void;
}) {
  return (
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
                <td className={s.rigid}>{whenText(c.time, c.sunOffsetMin)} <span className="muted">{c.timing}</span></td>
                <th scope="row" className={s.flexible}>
                  <button className="plain" style={{ textAlign: 'left', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={`What done looks like: ${c.title}`} onClick={(e) => { e.stopPropagation(); onOpenAreas(c); }}>
                    {c.title}
                    {c.steps.length > 1 && <><sup aria-hidden> {c.steps.length}</sup><span className="visually-hidden">, {c.steps.length} steps</span></>}
                    {c.areaCount > 0 && <><span aria-hidden> 📋</span><span className="visually-hidden">, {c.areaCount} areas</span></>}
                    {c.bounty && <> · 🪙 {c.bounty}</>}
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
