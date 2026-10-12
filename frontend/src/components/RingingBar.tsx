// SPEC §8.2 — everything currently ringing, on every screen, with its one-tap actions (FireActions), and the away line (§9.2c).
import { useState } from 'react';
import { useApp, type Fire } from '../state';
import { FireActions } from './FireActions';
import { isCookId } from '../../../src/shared/cooking';
import type { AlertKind } from '../../../src/shared/vocab';
import s from './RingingBar.module.css';

const COLLAPSE_AFTER = 3;
const ICON: Record<AlertKind, string> = { reminder: '🔔', timer: '⏱', chore: '🧹', thing: '📌', machine: '🧺' }; // thing, machine ⚑ (§8.2)

export function RingingBar() {
  const { ringing, memberById, clock } = useApp();
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (ringing.length === 0) return null;

  const shown = expanded ? ringing : ringing.slice(0, COLLAPSE_AFTER);
  const minsAgo = (iso: string) => Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  const person = (id: string | null | undefined) => (id ? memberById(id)?.displayName ?? 'unknown member' : 'anyone');
  const sub = (f: Fire) => {
    if (f.kind === 'reminder') return f.startSun ? ' · sunset' : f.startTime ? ` · ${clock(f.startTime)}` : ' · all day'; // §7.7
    if (f.kind === 'machine' && !f.personId) return ' · owner unknown'; // §7D.2 Done now with nobody named
    if (f.kind === 'chore' || f.kind === 'machine') return ` · ${person(f.personId)}`;
    if (f.kind === 'thing') return ' · to do'; // ⚑ (§8.2)
    return ` · ringing ${minsAgo(f.dueAt)} min`;
  };

  return (
    <section className={s.bar} aria-label="Ringing now" aria-live="polite">
      {error && <div role="alert" className="alert-error">{error}</div>}
      {shown.map((f) => (
        <div key={f.id} className={s.row}>
          <span className={s.what}>
            {isCookId(f.machineId) ? '🍳' : ICON[f.kind]} <b>{f.title}</b>
            {f.kind === 'chore' && f.stepTitle && <> — {f.stepTitle}</>}
            <span className={s.sub}>{sub(f)}{f.awayBy && ` · away (${person(f.awayBy)})`}</span>
          </span>
          <FireActions fire={f} onError={setError} />
        </div>
      ))}
      {ringing.length > COLLAPSE_AFTER && (
        <button className={`plain ${s.more}`} onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Show fewer ▴' : `${ringing.length - COLLAPSE_AFTER} more ringing ▾`}
        </button>
      )}
    </section>
  );
}
