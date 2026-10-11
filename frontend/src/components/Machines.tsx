// SPEC §8.5, §7D — the Machines section of the Alarms tab (the laundry loop, the dish washer) and its chooser,
// which the Ringing bar reuses for Move to dryer (§8.2).
import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { MachineHoursLine } from './MachineHours';
import { errorText, get, post } from '../api';
import { useApp } from '../state';
import { MACHINE_LABEL, finishLabel, isLaundry, machineMinutes, nextMachine } from '../../../src/shared/machines';
import type { MachineId, MachineState } from '../../../src/shared/vocab';
import s from './Lists.module.css';

/** GET /machines (§10) — `state` is the server's, never re-derived here. */
export interface Machine {
  id: MachineId; label: string; state: MachineState; ownerId: string | null; alertId: string | null; minutes: number | null;
  startedAt: string | null; doneAt: string | null; startedBy: string | null; next: MachineId | null;
}

const GLYPH: Record<MachineId, string> = { washer: '🫧', dryer: '🌀', dishwasher: '🍽️' }; // ⚑ (§8.5, Q204)
const BADGE: Record<MachineState, { mood: string; text: string }> = {
  free: { mood: 'neutral', text: 'free' }, running: { mood: 'good', text: 'running' }, done: { mood: 'warn', text: 'DONE — waiting' },
};
const lower = (id: MachineId) => MACHINE_LABEL[id].toLowerCase();
const bigChip = { minHeight: 44, fontSize: '1rem', padding: '0 14px', cursor: 'pointer' } as const;

/** One chip of a chooser row: ✓ and a heavier border when picked. */
function Pick({ on, color, label, onClick }: { on: boolean; color?: string; label: string; onClick: () => void }) {
  return (
    <button className="chip" aria-pressed={on} onClick={onClick}
      style={{ ...bigChip, ...(color ? { borderColor: color } : {}), borderWidth: on ? 2 : 1, fontWeight: on ? 600 : 400 }}>
      {on ? '✓ ' : ''}{label}
    </button>
  );
}

/**
 * Start a machine (whose load, who to alert when done, then a minute chip), move its done load on (a minute chip only), or
 * mark a free machine's unrecorded load done (whose load, then It's done). Tapping a minute chip
 * does it at once: two taps from the card. A refusal shows inside.
 */
export function MachineChooser({ from, mode, ownerId, onClose }: {
  from: MachineId; mode: 'start' | 'move' | 'done'; ownerId?: string | null; onClose: () => void;
}) {
  const { me, members, memberById, refresh } = useApp();
  const [owner, setOwner] = useState<string | null>(mode === 'done' ? null : me.id); // §7D.2: Done now never assumes an owner
  const [alertPick, setAlertPick] = useState<string | null | undefined>(undefined); // §7D.7: follows the owner until tapped
  const alertTo = alertPick === undefined ? owner : alertPick;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const to = mode === 'move' ? nextMachine(from) : null;
  const active = members.filter((m) => !m.disabledAt);
  const who = isLaundry(from) ? 'Whose load?' : 'Who started it?'; // §7D.6
  const ownerName = ownerId ? memberById(ownerId)?.displayName ?? 'unknown member' : null;
  const title = mode === 'start' ? `Start the ${lower(from)}` : mode === 'done' ? `The ${lower(from)} is done`
    : `Move ${ownerName ? `${ownerName}'s load` : 'the load'} to the ${to ? lower(to) : 'next machine'}`;

  async function go(minutes?: number) {
    setBusy(true); setError(null);
    try {
      await post(`/machines/${from}/${mode}`, mode === 'move' ? { minutes } : { ownerId: owner, alertId: alertTo, minutes });
      refresh(); onClose();
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }

  return (
    <Modal title={title} onClose={onClose} error={error} footer={<button onClick={onClose} disabled={busy}>Cancel</button>}>
      <fieldset disabled={busy}>
        {mode !== 'move' && (
          <div className="field" role="group" aria-label={who}>
            <span className="muted" style={{ fontSize: '.8rem' }}>{who}</span>
            <div className="row wrap" style={{ marginTop: 4 }}>
              {mode === 'done' && <Pick on={owner === null} label="Owner unknown" onClick={() => setOwner(null)} />}
              {active.map((m) => <Pick key={m.id} on={owner === m.id} color={m.color} label={m.displayName} onClick={() => setOwner(m.id)} />)}
            </div>
          </div>
        )}
        {mode !== 'move' && (
          <div className="field" role="group" aria-label="Alert when done">
            <span className="muted" style={{ fontSize: '.8rem' }}>🔔 Alert when done (optional) — with nobody, phones only, no speakers</span>
            <div className="row wrap" style={{ marginTop: 4 }}>
              <Pick on={alertTo === null} label="Nobody · phones only" onClick={() => setAlertPick(null)} />
              {active.map((m) => <Pick key={m.id} on={alertTo === m.id} color={m.color} label={m.displayName} onClick={() => setAlertPick(m.id)} />)}
            </div>
          </div>
        )}
        {mode === 'done' && <button className="primary" style={bigChip} onClick={() => go()}>It's done</button>}
        {mode !== 'done' && <div className="field" role="group" aria-label="How long?">
          <span className="muted" style={{ fontSize: '.8rem' }}>How long{mode === 'move' && to ? ` in the ${lower(to)}` : ''}?</span>
          <div className="row wrap" style={{ marginTop: 4 }}>
            {machineMinutes(to ?? from).map((n) => (
              <button key={n} className="chip" style={bigChip} onClick={() => go(n)}>{n} min</button>
            ))}
          </div>
        </div>}
      </fieldset>
    </Modal>
  );
}

/** The "Machines" section of the Alarms tab (SPEC §8.5): one card per machine, in `MACHINE` order. */
export function MachinesSection() {
  const { version, localTime, memberById, refresh } = useApp();
  const [machines, setMachines] = useState<Machine[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chooser, setChooser] = useState<{ from: MachineId; mode: 'start' | 'move' | 'done'; ownerId: string | null } | null>(null);

  useEffect(() => {
    get<Machine[]>('/machines').then((m) => { setMachines(m); setError(null); }).catch((e) => setError(errorText(e)));
  }, [version]);

  async function act(m: Machine, what: 'finish' | 'clear' | 'remind' | 'done') {
    if (what === 'clear' && !confirm(`Clear the ${lower(m.id)}? Nothing will ring.`)) return;
    setError(null);
    try { await post(`/machines/${m.id}/${what}`); refresh(); } catch (e) { setError(errorText(e)); refresh(); }
  }

  const name = (id: string) => memberById(id)?.displayName ?? 'unknown member';
  const load = (m: Machine) => m.state === 'free' ? ''
    : `${isLaundry(m.id) ? '' : 'started by '}${m.ownerId ? name(m.ownerId) : 'owner unknown'} · ${m.doneAt ? `done ${m.state === 'running' ? '~' : ''}${localTime(m.doneAt)}` : '—'}`
      + ` · ${m.alertId ? `alerts ${name(m.alertId)}` : 'phones only'}`; // §7D.7

  return (
    <section className={s.section} aria-label="Machines">
      <h2 style={{ marginBottom: 6 }}>Machines</h2>
      <p className="muted" style={{ fontSize: '.85rem', marginBottom: 10 }}>
        Wash, move to the dryer, fold. Run the dishes, then empty them. Every phone hears when it's done; the speakers only when someone is picked.
      </p>
      <MachineHoursLine />
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
                {m.state === 'free' && (
                  <button onClick={() => setChooser({ from: m.id, mode: 'done', ownerId: null })}
                    aria-label={`Done now: the ${lower(m.id)} already finished a load`}>Done now</button>
                )}
                {m.state === 'running' && <button onClick={() => act(m, 'done')} aria-label={`Done now: the ${lower(m.id)} finished early`}>Done now</button>}
                {m.state === 'done' && m.next && (
                  <button className="primary" onClick={() => setChooser({ from: m.id, mode: 'move', ownerId: m.ownerId })}>
                    Move to {lower(m.next)}
                  </button>
                )}
                {m.state === 'done' && !m.next && <button className="primary" onClick={() => act(m, 'finish')}>{finishLabel(m.id)}</button>}
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
