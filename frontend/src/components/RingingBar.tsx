// SPEC §8.2 — everything currently ringing, on every screen, with its one-tap actions.
import { useState } from 'react';
import { errorText, post } from '../api';
import { useApp, type Fire } from '../state';
import s from './RingingBar.module.css';

const COLLAPSE_AFTER = 3;

export function RingingBar() {
  const { ringing, refresh } = useApp();
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

  return (
    <section className={s.bar} aria-label="Ringing now" aria-live="polite">
      {error && <div role="alert" className="alert-error">{error}</div>}
      {shown.map((f) => (
        <div key={f.id} className={s.row}>
          <span className={s.what}>
            {f.kind === 'reminder' ? '🔔' : '⏱'} <b>{f.title}</b>
            <span className={s.sub}>
              {f.kind === 'reminder' ? (f.startTime ? ` · ${f.startTime}` : ' · all day') : ` · ringing ${minsAgo(f.dueAt)} min`}
            </span>
          </span>
          {f.kind === 'reminder' ? (
            <>
              <button disabled={busy === f.id} onClick={() => act(f, 'snooze')}>Snooze 10m</button>
              <button className="primary" disabled={busy === f.id} onClick={() => act(f, 'done')}>Done</button>
            </>
          ) : (
            <button className="primary" disabled={busy === f.id} onClick={() => act(f, 'ack')}>Ack</button>
          )}
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
