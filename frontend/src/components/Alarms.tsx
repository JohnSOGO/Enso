// SPEC §8.5 — Alarms tab: 📢 Announce (§9.3), Scheduled alarms (days of week + time), Rolling timers and Chores.
import { useEffect, useMemo, useState } from 'react';
import { Modal } from './Modal';
import { TimersSection, type Timer } from './Timers';
import { ChoresSection, type Chore } from './Chores';
import { Announce } from './Announce';
import { ChannelChecks, DayChips, RenotifySelect, SHORT, daysText } from './AlertFields';
import { del, errorText, get, patch, post } from '../api';
import { useApp } from '../state';
import { WEEKDAY, type Channel, type Weekday } from '../../../src/shared/vocab';
import { utcToLocal, weekdayOf } from '../../../src/shared/time';
import s from './Lists.module.css';

export interface Alarm {
  id: string; title: string; time: string; days: Weekday[]; channels: Channel[];
  renotifyMin: number | null; assignedTo: string[]; createdBy: string; nextDueAt: string | null; ringing: boolean;
}

function ScheduledSection({ onEdit }: { onEdit: (a: Alarm | null) => void }) {
  const { version, tz } = useApp();
  const [alarms, setAlarms] = useState<Alarm[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    get<Alarm[]>('/alarms').then((a) => { setAlarms(a); setError(null); }).catch((e) => setError(errorText(e)));
  }, [version]);

  const next = (a: Alarm) => {
    if (a.ringing) return <span className="badge bad">ringing</span>;
    if (!a.nextDueAt) return <span className="muted" title="Planned up to 36 hours ahead">later</span>;
    const l = utcToLocal(a.nextDueAt, tz);
    return `${SHORT[WEEKDAY[weekdayOf(l.date)]]} ${l.time}`;
  };

  return (
    <section className={s.section} aria-label="Scheduled alarms">
      <div className="row" style={{ marginBottom: 6 }}>
        <h2 style={{ flex: 1, marginBottom: 0 }}>Scheduled</h2>
        <button onClick={() => onEdit(null)}>＋ Add</button>
      </div>
      <p className="muted" style={{ fontSize: '.85rem', marginBottom: 10 }}>Ring at a set time on the days you pick, every week. Kept off the calendar.</p>
      {error && <div role="alert" className="alert-error">{error}</div>}
      {alarms === null && !error && <p className="muted">Loading…</p>}
      {alarms?.length === 0 && <p className="muted">No scheduled alarms yet.</p>}
      {!!alarms?.length && (
        <table className={s.table}>
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Alarm</th>
              <th scope="col">Days</th>
              <th scope="col">Next</th>
            </tr>
          </thead>
          <tbody>
            {alarms.map((a) => (
              <tr key={a.id} onClick={() => onEdit(a)} style={{ cursor: 'pointer' }}>
                <td className={s.rigid}>{a.time}</td>
                <th scope="row" className={s.flexible}>
                  <button className="plain" style={{ textAlign: 'left', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={`Edit ${a.title}`} onClick={(e) => { e.stopPropagation(); onEdit(a); }}>
                    {a.title}
                  </button>
                </th>
                <td className={s.rigid}>{daysText(a.days)}</td>
                <td className={s.rigid}>{next(a)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function AlarmForm({ alarm, onClose }: { alarm: Alarm | null; onClose: () => void }) {
  const { me, members, refresh } = useApp();
  const init = useMemo(() => ({
    title: alarm?.title ?? '', time: alarm?.time ?? '08:00', days: alarm?.days ?? ([] as Weekday[]),
    push: alarm ? alarm.channels.includes('push') : true, house: alarm ? alarm.channels.includes('house') : false,
    renotify: alarm?.renotifyMin ? String(alarm.renotifyMin) : 'off', assignedTo: alarm?.assignedTo ?? [],
  }), [alarm]);
  const [f, setF] = useState(init);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(f) !== JSON.stringify(init);
  const canEdit = !alarm || me.role === 'owner' || alarm.createdBy === me.id;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await fn(); refresh(); onClose(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  const save = () => run(async () => {
    const channels = [...(f.push ? ['push'] : []), ...(f.house ? ['house'] : [])];
    if (!f.days.length) throw new Error('Pick at least one day of the week.');
    if (!channels.length) throw new Error('Pick at least one way to alert (Phone or House).');
    const body = { title: f.title, time: f.time, days: f.days, channels, renotifyMin: f.renotify === 'off' ? null : Number(f.renotify), assignedTo: f.assignedTo };
    if (alarm) await patch(`/alarms/${alarm.id}`, body); else await post('/alarms', body);
  });

  return (
    <Modal title={alarm ? `Edit alarm: ${alarm.title}` : 'New scheduled alarm'} onClose={onClose} dirty={dirty} error={error}
      footer={<>
        {canEdit && <button className="primary" disabled={busy || !f.title.trim()} onClick={save}>Save</button>}
        <button onClick={onClose} disabled={busy}>Cancel</button>
      </>}>
      <fieldset disabled={!canEdit || busy}>
        {!canEdit && <p className="muted" style={{ marginBottom: 10 }}>Only the creator or an admin can change this alarm.</p>}
        <label className="field"><span>Title</span>
          <input value={f.title} maxLength={120} onChange={(e) => setF({ ...f, title: e.target.value })} autoFocus={!alarm} />
        </label>
        <label className="field"><span>Time</span>
          <input type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} />
        </label>
        <DayChips days={f.days} onChange={(days) => setF({ ...f, days })} />
        <ChannelChecks push={f.push} house={f.house} onChange={(c) => setF({ ...f, ...c })} />
        <RenotifySelect label="Repeat the alert until handled" value={f.renotify} onChange={(renotify) => setF({ ...f, renotify })} />
        <div className="field" role="group" aria-label="Assigned to">
          <span className="muted" style={{ fontSize: '.8rem' }}>Assigned to (none = everyone)</span>
          <div className="row wrap" style={{ marginTop: 4 }}>
            {members.filter((m) => !m.disabledAt).map((m) => (
              <label key={m.id} className="chip" style={{ padding: '4px 8px', borderColor: m.color }}>
                <input type="checkbox" checked={f.assignedTo.includes(m.id)}
                  onChange={(e) => setF({ ...f, assignedTo: e.target.checked ? [...f.assignedTo, m.id] : f.assignedTo.filter((x) => x !== m.id) })} />
                {m.displayName}
              </label>
            ))}
          </div>
        </div>
      </fieldset>
      {alarm && canEdit && (
        <div className="row wrap" style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <button className="danger" disabled={busy} onClick={() => { if (confirm(`Delete alarm "${alarm.title}"?`)) run(() => del(`/alarms/${alarm.id}`)); }}>Delete alarm</button>
        </div>
      )}
    </Modal>
  );
}

export function Alarms({ onEditAlarm, onEditTimer, onEditChore }: {
  onEditAlarm: (a: Alarm | null) => void; onEditTimer: (t: Timer | null) => void; onEditChore: (c: Chore | null) => void;
}) {
  return (
    <div style={{ padding: 12, overflowY: 'auto', height: '100%' }}>
      <h1 style={{ fontSize: '1.15rem', marginBottom: 12 }}>Alarms</h1>
      <Announce />
      <ScheduledSection onEdit={onEditAlarm} />
      <TimersSection onEdit={onEditTimer} />
      <ChoresSection onEdit={onEditChore} />
    </div>
  );
}
