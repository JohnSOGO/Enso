// SPEC §8.5, §7D.8 — the 🍳 Cooking group of the Machines section: ＋ Cooking timer, then one card per open timer with
// its red ✕. The box is CookBox.tsx.
import { useEffect, useState } from 'react';
import { CookBox, COOK_GLYPH } from './CookBox';
import { errorText, get, post } from '../api';
import { useApp } from '../state';
import type { CookKind, MachineState } from '../../../src/shared/vocab';
import s from './Lists.module.css';

/** GET /cooking (§10) — `state` is the server's, never re-derived here; `free` shows as "off". */
export interface Cooking {
  id: string; kind: CookKind; name: string | null; label: string; state: MachineState; minutes: number;
  startedAt: string | null; doneAt: string | null; alertId: string | null; startedBy: string | null;
}

const BADGE: Record<MachineState, { mood: string; text: string }> = {
  free: { mood: 'neutral', text: 'off' }, running: { mood: 'good', text: 'running' }, done: { mood: 'warn', text: 'DONE' },
};

export function CookingSection() {
  const { version, localTime, memberById, refresh } = useApp();
  const [timers, setTimers] = useState<Cooking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [box, setBox] = useState<{ editing: Cooking | null } | null>(null);

  useEffect(() => {
    get<Cooking[]>('/cooking').then((t) => { setTimers(t); setError(null); }).catch((e) => setError(errorText(e)));
  }, [version]);

  async function act(t: Cooking, what: 'off' | 'stop' | 'start' | 'close') {
    if (what === 'close' && t.state === 'running' && !confirm(`Close ${t.label}? It won't ring.`)) return;
    setError(null);
    try { await post(`/cooking/${t.id}/${what}`); refresh(); } catch (e) { setError(errorText(e)); refresh(); }
  }

  const line = (t: Cooking) => (t.state === 'free' ? `${t.minutes} min` : `${t.state === 'running' ? '~' : 'done '}${localTime(t.doneAt!)}`)
    + ` · ${t.alertId ? `alerts ${memberById(t.alertId)?.displayName ?? 'unknown member'}` : 'phones only'}`;

  return (
    <section className={s.section} aria-label="Cooking" style={{ marginTop: 16 }}>
      <div className="row">
        <h3 style={{ fontSize: '1rem', flex: 1 }}>🍳 Cooking</h3>
        <button className="primary" onClick={() => setBox({ editing: null })}>＋ Cooking timer</button>
      </div>
      {error && <div role="alert" className="alert-error">{error}</div>}
      {timers === null && !error && <p className="muted">Loading…</p>}
      {timers?.length === 0 && <p className="muted">Nothing cooking.</p>}
      {!!timers?.length && (
        <ul className={s.list}>
          {timers.map((t) => (
            <li key={t.id} style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '8px 10px' }}>
              <div className="row">
                <b style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{COOK_GLYPH[t.kind]} {t.label}</b>
                <span className={`badge ${BADGE[t.state].mood}`} style={{ flex: 'none' }}>{BADGE[t.state].text}</span>
                <button className="plain" aria-label={`Close ${t.label}`} onClick={() => act(t, 'close')}
                  style={{ flex: 'none', color: '#DC2626', fontSize: '1.2rem', fontWeight: 700, minWidth: 44, minHeight: 44 }}>✕</button>
              </div>
              <div className="row wrap" style={{ marginTop: 6 }}>
                <span className="muted" style={{ flex: 1, fontVariantNumeric: 'tabular-nums' }}>{line(t)}</span>
                {t.state === 'done' && <button className="primary" onClick={() => act(t, 'off')}>Off</button>}
                {t.state === 'free' && <button className="primary" onClick={() => act(t, 'start')}>Start again</button>}
                <button onClick={() => setBox({ editing: t })}>Edit</button>
                {t.state === 'running' && <button onClick={() => act(t, 'stop')}>Stop</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {box && <CookBox editing={box.editing} onClose={() => setBox(null)} />}
    </section>
  );
}
