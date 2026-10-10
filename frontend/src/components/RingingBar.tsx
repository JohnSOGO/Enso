// SPEC §8.2 — everything currently ringing, on every screen, with its one-tap actions.
import { useState } from 'react';
import { errorText, post } from '../api';
import { useApp, type Fire } from '../state';
import { MachineChooser } from './Machines';
import { MACHINE_LABEL, finishLabel, isMachineId, nextMachine } from '../../../src/shared/machines';
import type { AlertKind, MachineId } from '../../../src/shared/vocab';
import s from './RingingBar.module.css';

const COLLAPSE_AFTER = 3;
const ICON: Record<AlertKind, string> = { reminder: '🔔', timer: '⏱', chore: '🧹', thing: '📌', machine: '🧺' }; // thing, machine ⚑ (§8.2)

export function RingingBar() {
  const { ringing, refresh, memberById } = useApp();
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moving, setMoving] = useState<{ from: MachineId; ownerId: string | null } | null>(null);
  if (ringing.length === 0) return null;

  async function send(f: Fire, path: string, body: object) {
    setBusy(f.id); setError(null);
    try { await post(path, body); refresh(); }
    catch (e) { setError(`${f.title}: ${errorText(e)}`); refresh(); }
    finally { setBusy(null); }
  }
  const act = (f: Fire, action: 'done' | 'snooze' | 'ack') => send(f, `/fires/${f.id}/actions`, { action });

  /** §8.2: a machine fire is closed only by /machines — Move to the next machine, or Fold & out on the last. */
  const machineButton = (f: Fire) => {
    if (!isMachineId(f.machineId)) return null;
    const from = f.machineId, next = nextMachine(from);
    return next
      ? <button className="primary" disabled={busy === f.id} onClick={() => setMoving({ from, ownerId: f.personId ?? null })}>
          Move to {MACHINE_LABEL[next].toLowerCase()}
        </button>
      : <button className="primary" disabled={busy === f.id} onClick={() => send(f, `/machines/${from}/finish`, {})}>{finishLabel(from)}</button>;
  };

  const shown = expanded ? ringing : ringing.slice(0, COLLAPSE_AFTER);
  const minsAgo = (iso: string) => Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  const person = (id: string | null | undefined) => (id ? memberById(id)?.displayName ?? 'unknown member' : 'anyone');
  const sub = (f: Fire) => {
    if (f.kind === 'reminder') return f.startSun ? ' · sunset' : f.startTime ? ` · ${f.startTime}` : ' · all day'; // §7.7
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
            {ICON[f.kind]} <b>{f.title}</b>
            {f.kind === 'chore' && f.stepTitle && <> — {f.stepTitle}</>}
            <span className={s.sub}>{sub(f)}</span>
          </span>
          {(f.kind === 'reminder' || f.kind === 'thing') && <button disabled={busy === f.id} onClick={() => act(f, 'snooze')}>Snooze 10m</button>}
          {f.kind === 'machine' ? machineButton(f)
            : f.kind === 'timer'
              ? <button className="primary" disabled={busy === f.id} onClick={() => act(f, 'ack')}>Ack</button>
              : <button className="primary" disabled={busy === f.id} onClick={() => act(f, 'done')}>Done</button>}
        </div>
      ))}
      {ringing.length > COLLAPSE_AFTER && (
        <button className={`plain ${s.more}`} onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Show fewer ▴' : `${ringing.length - COLLAPSE_AFTER} more ringing ▾`}
        </button>
      )}
      {moving && <MachineChooser from={moving.from} mode="move" ownerId={moving.ownerId} onClose={() => setMoving(null)} />}
    </section>
  );
}
