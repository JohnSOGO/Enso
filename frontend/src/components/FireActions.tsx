// SPEC §8.2, §9.5 — one fire's one-tap actions: Away, Snooze 10m, Ack / Done, and the machine button (Move to …, the last machine's finish, Off on a cooking timer).
import { useState } from 'react';
import { errorText, post } from '../api';
import { useApp, type Fire } from '../state';
import { MachineChooser } from './Machines';
import { MACHINE_LABEL, finishLabel, isMachineId, nextMachine } from '../../../src/shared/machines';
import { isCookId } from '../../../src/shared/cooking';
import type { MachineId } from '../../../src/shared/vocab';

export function FireActions({ fire: f, onActed, onError }: {
  fire: Fire; onActed?: () => void; onError: (message: string | null) => void;
}) {
  const { refresh } = useApp();
  const [busy, setBusy] = useState(false);
  const [moving, setMoving] = useState<{ from: MachineId; ownerId: string | null } | null>(null);

  async function send(path: string, body: object) {
    setBusy(true); onError(null);
    try { await post(path, body); refresh(); onActed?.(); }
    catch (e) { onError(`${f.title}: ${errorText(e)}`); refresh(); }
    finally { setBusy(false); }
  }
  const act = (action: 'done' | 'snooze' | 'ack') => send(`/fires/${f.id}/actions`, { action });

  /** §8.2: a machine fire is closed only by /machines (or /cooking) — Move to the next machine, Unload Clothes Dryer on the last, Off on a cooking timer. */
  const machineButton = () => {
    if (isCookId(f.machineId)) return <button className="primary" disabled={busy} onClick={() => send(`/cooking/${f.machineId}/off`, {})}>Off</button>; // §7D.8
    if (!isMachineId(f.machineId)) return null;
    const from = f.machineId, next = nextMachine(from);
    return next
      ? <button className="primary" disabled={busy} onClick={() => setMoving({ from, ownerId: f.personId ?? null })}>
          Move to {MACHINE_LABEL[next].toLowerCase()}
        </button>
      : <button className="primary" disabled={busy} onClick={() => send(`/machines/${from}/finish`, {})}>{finishLabel(from)}</button>;
  };

  return (
    <>
      {!f.awayBy && <button disabled={busy} onClick={() => send(`/fires/${f.id}/away`, {})}>Away</button>}
      {(f.kind === 'reminder' || f.kind === 'thing') && <button disabled={busy} onClick={() => act('snooze')}>Snooze 10m</button>}
      {f.kind === 'machine' ? machineButton()
        : f.kind === 'timer'
          ? <button className="primary" disabled={busy} onClick={() => act('ack')}>Ack</button>
          : <button className="primary" disabled={busy} onClick={() => act('done')}>Done</button>}
      {moving && <MachineChooser from={moving.from} mode="move" ownerId={moving.ownerId} onClose={() => setMoving(null)} />}
    </>
  );
}
