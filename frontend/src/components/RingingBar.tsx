// SPEC §8.2 — everything currently ringing, on every screen, with its one-tap actions.
import { useState } from 'react';
import { errorText, post } from '../api';
import { useApp, type Fire } from '../state';
import type { AlertKind } from '../../../src/shared/vocab';
import s from './RingingBar.module.css';

const COLLAPSE_AFTER = 3;
const ICON: Record<AlertKind, string> = { reminder: '🔔', timer: '⏱', chore: '🧹', thing: '📌' }; // thing ⚑ (§8.2)

export function RingingBar() {
  const { ringing, refresh, memberById } = useApp();
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (ringing.length === 0) return null;

  async function act(f: Fire, action: 'done' | 'snooze' | 'ack') {
    setBusy(f.id); setError(null);
    try { await post(`/fires/${f.id}/actions`, { action }); refresh(); }
    catch (e) { setError(`${f.title}: ${errorText(e)}`); refresh(); }
    finally { setBusy(null); }
  }

  const shown = expanded ? ringing : ringing.slice(0, COLLAPSE_AFTER);
  const minsAgo = (iso: string) => Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  const person = (id: string | null | undefined) => (id ? memberById(id)?.displayName ?? 'unknown member' : 'anyone');
  const sub = (f: Fire) => {
    if (f.kind === 'reminder') return f.startTime ? ` · ${f.startTime}` : ' · all day';
    if (f.kind === 'chore') return ` · ${person(f.personId)}`;
    if (f.kind === 'thing') return ' · to do'; // ⚑ (§8.2)
    return ` · ringing ${minsAgo(f.dueAt)} min`;
  };

  return (
    <section className={s.bar} aria-label="Ringing now" aria-live="polite">
      {error && <div role="alert" className="alert-error">{error}</div>}
      {shown.map((f) => (
        <div key={f.id} className={s.row}>
          <span className={s.what}>
            {ICON[f.kind]} <b>{f.title}</b>
            {f.kind === 'chore' && f.stepTitle && <> — {f.stepTitle}</>}
            <span className={s.sub}>{sub(f)}</span>
          </span>
          {(f.kind === 'reminder' || f.kind === 'thing') && <button disabled={busy === f.id} onClick={() => act(f, 'snooze')}>Snooze 10m</button>}
          {f.kind === 'timer'
            ? <button className="primary" disabled={busy === f.id} onClick={() => act(f, 'ack')}>Ack</button>
            : <button className="primary" disabled={busy === f.id} onClick={() => act(f, 'done')}>Done</button>}
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
