// SPEC §8.5, §7D.5 — the machines' alert hours: one line under the Machines heading, and the
// modal an admin edits them in. Weekdays and weekends each have from/to; both empty = any time.
import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { errorText, get, patch } from '../api';
import { useApp } from '../state';
import type { DayHours, MachineHours } from '../../../src/shared/machine-hours';
import { isAdmin } from '../../../src/shared/roles';

const DAYS = [['weekday', 'Weekdays'], ['weekend', 'Weekends']] as const;
const clock = (hhmm: string) => { const h = Number(hhmm.slice(0, 2)); return `${h % 12 || 12}:${hhmm.slice(3)}${h < 12 ? 'am' : 'pm'}`; };
const text = (d: DayHours | null) => (d ? `${clock(d.from)}–${clock(d.to)}` : 'any time');

export function MachineHoursLine() {
  const { me, version } = useApp();
  const [hours, setHours] = useState<MachineHours | null>(null);
  const [editing, setEditing] = useState(false);
  useEffect(() => { get<MachineHours>('/machines/hours').then(setHours).catch(() => setHours(null)); }, [version]);
  if (!hours) return null;
  return (
    <p className="muted" style={{ fontSize: '.85rem', marginBottom: 10 }}>
      🔔 Alerts sound weekdays {text(hours.weekday)}, weekends {text(hours.weekend)}; outside those hours they wait.
      {isAdmin(me) && <> <button onClick={() => setEditing(true)} style={{ marginLeft: 6 }}>Edit hours</button></>}
      {editing && <HoursForm hours={hours} onClose={() => setEditing(false)} onSaved={setHours} />}
    </p>
  );
}

function HoursForm({ hours, onClose, onSaved }: { hours: MachineHours; onClose: () => void; onSaved: (h: MachineHours) => void }) {
  const [draft, setDraft] = useState(() => Object.fromEntries(DAYS.map(([k]) => [k, { from: hours[k]?.from ?? '', to: hours[k]?.to ?? '' }])) as Record<keyof MachineHours, DayHours>);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof MachineHours, end: 'from' | 'to', v: string) => setDraft({ ...draft, [k]: { ...draft[k], [end]: v } });

  async function save() {
    setBusy(true); setError(null);
    const day = (d: DayHours) => (d.from || d.to ? d : null);
    try { onSaved(await patch<MachineHours>('/machines/hours', { weekday: day(draft.weekday), weekend: day(draft.weekend) })); onClose(); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }

  return (
    <Modal title="Machine alert hours" onClose={onClose} error={error}
      footer={<><button onClick={onClose} disabled={busy}>Cancel</button><button className="primary" onClick={save} disabled={busy}>Save</button></>}>
      <p className="muted" style={{ fontSize: '.85rem' }}>Washer and dryer alerts outside these hours wait until they open. Leave both empty for any time.</p>
      {DAYS.map(([k, label]) => (
        <div key={k} className="field" role="group" aria-label={label}>
          <span className="muted" style={{ fontSize: '.8rem' }}>{label}</span>
          <div className="row" style={{ marginTop: 4 }}>
            <input type="time" aria-label={`${label} from`} value={draft[k].from} onChange={(e) => set(k, 'from', e.target.value)} style={{ fontSize: 16 }} />
            <span>to</span>
            <input type="time" aria-label={`${label} to`} value={draft[k].to} onChange={(e) => set(k, 'to', e.target.value)} style={{ fontSize: 16 }} />
          </div>
        </div>
      ))}
    </Modal>
  );
}
