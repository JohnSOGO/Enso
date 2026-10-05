// SPEC §8.5, §7D — the Machines section of the Alarms tab (the laundry loop) and its chooser,
// which the Ringing bar reuses for Move to dryer (§8.2).
import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { errorText, get, post } from '../api';
import { useApp } from '../state';
import { MACHINE_LABEL, MACHINE_MINUTES, nextMachine } from '../../../src/shared/machines';
import type { MachineId, MachineState } from '../../../src/shared/vocab';
import s from './Lists.module.css';

/** GET /machines (§10) — `state` is the server's, never re-derived here. */
export interface Machine {
  id: MachineId; label: string; state: MachineState; ownerId: string | null; minutes: number | null;
  startedAt: string | null; doneAt: string | null; startedBy: string | null; next: MachineId | null;
}

const GLYPH: Record<MachineId, string> = { washer: '🫧', dryer: '🌀' }; // ⚑ (§8.5)
const BADGE: Record<MachineState, { mood: string; text: string }> = {
  free: { mood: 'neutral', text: 'free' }, running: { mood: 'good', text: 'running' }, done: { mood: 'warn', text: 'DONE — waiting' },
};
const lower = (id: MachineId) => MACHINE_LABEL[id].toLowerCase();
const bigChip = { minHeight: 44, fontSize: '1rem', padding: '0 14px', cursor: 'pointer' } as const;

/**
 * Start a machine (whose load, then a minute chip) or move its done load on (a minute chip only).
 * Tapping a minute chip does it at once: two taps from the card. A refusal shows inside.
 */
export function MachineChooser({ from, mode, ownerId, onClose }: {
  from: MachineId; mode: 'start' | 'move'; ownerId?: string | null; onClose: () => void;
}) {
  const { me, members, memberById, refresh } = useApp();
  const [owner, setOwner] = useState(me.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const to = mode === 'move' ? nextMachine(from) : null;
  const ownerName = ownerId ? memberById(ownerId)?.displayName ?? 'unknown member' : null;
  const title = mode === 'start' ? `Start the ${lower(from)}`
    : `Move ${ownerName ? `${ownerName}'s load` : 'the load'} to the ${to ? lower(to) : 'next machine'}`;

  async function go(minutes: number) {
    setBusy(true); setError(null);
    try {
      await post(`/machines/${from}/${mode}`, mode === 'start' ? { ownerId: owner, minutes } : { minutes });
      refresh(); onClose();
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }

  return (
    <Modal title={title} onClose={onClose} error={error} footer={<button onClick={onClose} disabled={busy}>Cancel</button>}>
      <fieldset disabled={busy}>
        {mode === 'start' && (
          <div className="field" role="group" aria-label="Whose load?">
            <span className="muted" style={{ fontSize: '.8rem' }}>Whose load?</span>
            <div className="row wrap" style={{ marginTop: 4 }}>
              {members.filter((m) => !m.disabledAt).map((m) => (
                <button key={m.id} className="chip" aria-pressed={owner === m.id} onClick={() => setOwner(m.id)}
                  style={{ ...bigChip, borderColor: m.color, borderWidth: owner === m.id ? 2 : 1, fontWeight: owner === m.id ? 600 : 400 }}>
                  {owner === m.id ? '✓ ' : ''}{m.displayName}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="field" role="group" aria-label="How long?">
          <span className="muted" style={{ fontSize: '.8rem' }}>How long{mode === 'move' && to ? ` in the ${lower(to)}` : ''}?</span>
          <div className="row wrap" style={{ marginTop: 4 }}>
            {MACHINE_MINUTES.map((n) => (
              <button key={n} className="chip" style={bigChip} onClick={() => go(n)}>{n} min</button>
            ))}
          </div>
        </div>
      </fieldset>
    </Modal>
  );
}

/** The "Machines" section of the Alarms tab (SPEC §8.5): one card per machine, in load order. */
export function MachinesSection() {
  const { version, localTime, memberById, refresh } = useApp();
  const [machines, setMachines] = useState<Machine[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chooser, setChooser] = useState<{ from: MachineId; mode: 'start' | 'move'; ownerId: string | null } | null>(null);

  useEffect(() => {
    get<Machine[]>('/machines').then((m) => { setMachines(m); setError(null); }).catch((e) => setError(errorText(e)));
  }, [version]);

  async function act(m: Machine, what: 'finish' | 'clear' | 'remind') {
    if (what === 'clear' && !confirm(`Clear the ${lower(m.id)}? Nothing will ring.`)) return;
    setError(null);
    try { await post(`/machines/${m.id}/${what}`); refresh(); } catch (e) { setError(errorText(e)); refresh(); }
  }

  const load = (m: Machine) => m.state === 'free' ? ''
    : `${m.ownerId ? memberById(m.ownerId)?.displayName ?? 'unknown member' : 'nobody'} · ${m.doneAt ? `done ${m.state === 'running' ? '~' : ''}${localTime(m.doneAt)}` : '—'}`;

  return (
    <section className={s.section} aria-label="Machines">
      <h2 style={{ marginBottom: 6 }}>Machines</h2>
      <p className="muted" style={{ fontSize: '.85rem', marginBottom: 10 }}>
        Wash, move to the dryer, fold. Whoever's load it is hears when it's done.
      </p>
      {error && <div role="alert" className="alert-error">{error}</div>}
      {machines === null && !error && <p className="muted">Loading…</p>}
      {!!machines?.length && (
        <ul className={s.list}>
          {machines.map((m) => (
            <li key={m.id} style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '8px 10px' }}>
              <div className="row">
                <b style={{ flex: 'none' }}>{GLYPH[m.id]} {m.label}</b>
                <span className={`badge ${BADGE[m.state].mood}`} style={{ flex: 'none' }}>{BADGE[m.state].text}</span>
              </div>
              <div className="row wrap" style={{ marginTop: 6 }}>
                {/* whose load and when it's done: its own line, wrapping, so 320 px never cuts the time off */}
                <span className="muted" style={{ flex: 1, fontVariantNumeric: 'tabular-nums' }}>{load(m)}</span>
                {m.state === 'free' && (
                  <button className="primary" onClick={() => setChooser({ from: m.id, mode: 'start', ownerId: null })}
                    aria-label={`Start the ${lower(m.id)}`}>Start</button>
                )}
                {m.state === 'done' && m.next && (
                  <button className="primary" onClick={() => setChooser({ from: m.id, mode: 'move', ownerId: m.ownerId })}>
                    Move to {lower(m.next)}
                  </button>
                )}
                {m.state === 'done' && !m.next && <button className="primary" onClick={() => act(m, 'finish')}>Fold &amp; out</button>}
                {m.state === 'done' && (
                  <button onClick={() => act(m, 'remind')} aria-label={`Still loaded: remind about the ${lower(m.id)} again`}>Still loaded</button>
                )}
                {m.state !== 'free' && <button onClick={() => act(m, 'clear')} aria-label={`Clear the ${lower(m.id)}`}>Clear</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {chooser && <MachineChooser {...chooser} onClose={() => setChooser(null)} />}
    </section>
  );
}
