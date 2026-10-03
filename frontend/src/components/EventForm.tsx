// SPEC §8.4 — event form (modal). Creates or edits an event and its reminder.
import { useEffect, useMemo, useState } from 'react';
import { Modal } from './Modal';
import { del, errorText, get, patch, post } from '../api';
import { useApp } from '../state';
import { WEEKDAY, type Channel, type Weekday } from '../../../src/shared/vocab';
import { weekdayOf } from '../../../src/shared/time';
import { positionInMonth, type Recurrence } from '../../../src/shared/recurrence';
import { longDate } from './DaySheet';

type Repeat = 'none' | 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'MONTHLY_POS' | 'YEARLY';

interface Form {
  title: string; notes: string; date: string; allDay: boolean; startTime: string; endTime: string; endDate: string;
  repeat: Repeat; byDay: Weekday[]; until: string; assignedTo: string[];
  remind: string; push: boolean; house: boolean; renotify: string;
}

const REMIND_OPTIONS: [string, string][] = [
  ['none', 'None'], ['0', 'At start'], ['5', '5 min before'], ['15', '15 min before'],
  ['30', '30 min before'], ['60', '1 hour before'], ['1440', '1 day before'],
];
const RENOTIFY_OPTIONS: [string, string][] = [['off', 'Off'], ['5', 'Every 5 min'], ['10', 'Every 10 min'], ['15', 'Every 15 min'], ['30', 'Every 30 min']];
const DAY_LABEL: Record<Weekday, string> = { SU: 'Sun', MO: 'Mon', TU: 'Tue', WE: 'Wed', TH: 'Thu', FR: 'Fri', SA: 'Sat' };

const ORDINAL: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', [-1]: 'last' };
const WEEKDAY_NAME: Record<Weekday, string> = { SU: 'Sunday', MO: 'Monday', TU: 'Tuesday', WE: 'Wednesday', TH: 'Thursday', FR: 'Friday', SA: 'Saturday' };

/** "3rd Friday" / "last Friday" — the nth weekday this date is in its month. */
function positionText(date: string): string {
  const p = positionInMonth(date);
  return `${ORDINAL[p.setPos]} ${WEEKDAY_NAME[p.weekday]}`;
}

function blank(date: string): Form {
  return {
    title: '', notes: '', date, allDay: false, startTime: '09:00', endTime: '', endDate: date,
    repeat: 'none', byDay: [WEEKDAY[weekdayOf(date)]], until: '', assignedTo: [],
    remind: 'none', push: true, house: false, renotify: 'off',
  };
}

function fromEvent(e: any): Form {
  const r: Recurrence | null = e.recurrence;
  const repeat: Repeat = !r ? 'none' : r.freq === 'WEEKLY' && r.interval === 2 ? 'BIWEEKLY' : r.freq === 'MONTHLY' && r.setPos ? 'MONTHLY_POS' : r.freq;
  return {
    title: e.title, notes: e.notes ?? '', date: e.startDate, allDay: e.allDay, startTime: e.startTime ?? '09:00',
    endTime: e.endTime ?? '', endDate: e.endDate, repeat, byDay: r?.byDay ?? [WEEKDAY[weekdayOf(e.startDate)]],
    until: r?.until ?? '', assignedTo: e.assignedTo,
    remind: e.reminder ? String(e.reminder.offsetMin) : 'none',
    push: e.reminder ? e.reminder.channels.includes('push') : true,
    house: e.reminder ? e.reminder.channels.includes('house') : false,
    renotify: e.reminder?.renotifyMin ? String(e.reminder.renotifyMin) : 'off',
  };
}

function toPayload(f: Form) {
  let recurrence: Recurrence | null = null;
  if (f.repeat !== 'none') {
    const freq = f.repeat === 'BIWEEKLY' ? 'WEEKLY' : f.repeat === 'MONTHLY_POS' ? 'MONTHLY' : f.repeat;
    recurrence = { freq };
    if (f.repeat === 'BIWEEKLY') recurrence.interval = 2;
    if (f.repeat === 'MONTHLY_POS') {
      const pos = positionInMonth(f.date);
      recurrence.byDay = [pos.weekday];
      recurrence.setPos = pos.setPos;
    }
    if (freq === 'WEEKLY') recurrence.byDay = WEEKDAY.filter((d) => f.byDay.includes(d));
    if (f.until) recurrence.until = f.until;
  }
  const channels: Channel[] = [...(f.push ? ['push' as const] : []), ...(f.house ? ['house' as const] : [])];
  return {
    title: f.title, notes: f.notes || null, startDate: f.date,
    startTime: f.allDay ? null : f.startTime, endTime: f.allDay || !f.endTime ? null : f.endTime,
    endDate: f.allDay ? f.endDate : f.date,
    recurrence, assignedTo: f.assignedTo,
    reminder: f.remind === 'none' ? null : {
      offsetMin: Number(f.remind), channels, renotifyMin: f.renotify === 'off' ? null : Number(f.renotify),
    },
  };
}

interface Props {
  eventId?: string;
  date: string; // the tapped day (new) or the tapped occurrence (edit)
  onClose: () => void;
}

export function EventForm({ eventId, date, onClose }: Props) {
  const { me, members, refresh } = useApp();
  const [form, setForm] = useState<Form | null>(eventId ? null : blank(date));
  const [initial, setInitial] = useState<string>(JSON.stringify(form));
  const [meta, setMeta] = useState<{ createdBy: string; recurring: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!eventId) return;
    get(`/events/${eventId}`).then((e) => {
      const f = fromEvent(e);
      setForm(f); setInitial(JSON.stringify(f));
      setMeta({ createdBy: e.createdBy, recurring: !!e.recurrence });
    }).catch((e) => setError(errorText(e)));
  }, [eventId]);

  const dirty = useMemo(() => form !== null && JSON.stringify(form) !== initial, [form, initial]);
  const canEdit = !eventId || me.role === 'owner' || meta?.createdBy === me.id;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await fn(); refresh(); onClose(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }

  const save = () => run(async () => {
    if (!form) return;
    if (form.remind !== 'none' && !form.push && !form.house) throw new Error('Pick at least one way to be reminded (Phone or House).');
    if (form.repeat === 'WEEKLY' && form.byDay.length === 0) throw new Error('Pick at least one day of the week.');
    const payload = toPayload(form);
    if (eventId) await patch(`/events/${eventId}`, payload);
    else await post('/events', payload);
  });

  const deleteSeries = () => { if (confirm(meta?.recurring ? 'Delete every occurrence of this event?' : 'Delete this event?')) run(() => del(`/events/${eventId}`)); };
  const deleteOne = () => { if (confirm(`Delete only ${longDate(date)}?`)) run(() => post(`/events/${eventId}/exdates`, { date })); };

  const title = eventId ? (form ? `Edit: ${form.title || 'event'}` : 'Loading event…') : `New event · ${longDate(date)}`;

  return (
    <Modal
      title={title}
      onClose={onClose}
      dirty={dirty}
      error={error}
      footer={form && (
        <>
          {canEdit && <button className="primary" disabled={busy || !form.title.trim()} onClick={save}>Save</button>}
          <button onClick={onClose} disabled={busy}>Cancel</button>
        </>
      )}
    >
      {form && (
        <fieldset disabled={!canEdit || busy} style={{ border: 0, padding: 0 }}>
          {!canEdit && <p className="muted" style={{ marginBottom: 10 }}>Only the creator or an admin can change this event.</p>}
          <label className="field"><span>Title</span>
            <input value={form.title} maxLength={120} onChange={(e) => set('title', e.target.value)} autoFocus={!eventId} />
          </label>
          <div className="row">
            <label className="field" style={{ flex: 1 }}><span>Date</span>
              <input type="date" value={form.date} onChange={(e) => { set('date', e.target.value); if (form.endDate < e.target.value) set('endDate', e.target.value); }} />
            </label>
            <label className="row" style={{ marginTop: 8 }}>
              <input type="checkbox" checked={form.allDay} onChange={(e) => set('allDay', e.target.checked)} /> All day
            </label>
          </div>
          {form.allDay ? (
            <label className="field"><span>End date</span>
              <input type="date" min={form.date} value={form.endDate} onChange={(e) => set('endDate', e.target.value)} />
            </label>
          ) : (
            <div className="row">
              <label className="field" style={{ flex: 1 }}><span>Start</span>
                <input type="time" value={form.startTime} onChange={(e) => set('startTime', e.target.value)} />
              </label>
              <label className="field" style={{ flex: 1 }}><span>End (optional)</span>
                <input type="time" value={form.endTime} onChange={(e) => set('endTime', e.target.value)} />
              </label>
            </div>
          )}

          <label className="field"><span>Repeat</span>
            <select value={form.repeat} onChange={(e) => set('repeat', e.target.value as Repeat)}>
              <option value="none">Never</option>
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
              <option value="BIWEEKLY">Every 2 weeks</option>
              <option value="MONTHLY">Monthly on day {Number(form.date.slice(8, 10))}</option>
              <option value="MONTHLY_POS">Monthly on the {positionText(form.date)}</option>
              <option value="YEARLY">Yearly</option>
            </select>
          </label>
          {(form.repeat === 'WEEKLY' || form.repeat === 'BIWEEKLY') && (
            <div className="row wrap" style={{ marginBottom: 12 }} role="group" aria-label="Days of the week">
              {WEEKDAY.map((d) => (
                <label key={d} className="chip" style={{ padding: '4px 8px' }}>
                  <input type="checkbox" checked={form.byDay.includes(d)}
                    onChange={(e) => set('byDay', e.target.checked ? [...form.byDay, d] : form.byDay.filter((x) => x !== d))} />
                  {DAY_LABEL[d]}
                </label>
              ))}
            </div>
          )}
          {form.repeat !== 'none' && (
            <label className="field"><span>Repeat until (optional)</span>
              <input type="date" min={form.date} value={form.until} onChange={(e) => set('until', e.target.value)} />
            </label>
          )}

          <div className="field" role="group" aria-label="Assigned to">
            <span className="muted" style={{ fontSize: '.8rem' }}>Assigned to (none = everyone)</span>
            <div className="row wrap" style={{ marginTop: 4 }}>
              {members.filter((m) => !m.disabledAt).map((m) => (
                <label key={m.id} className="chip" style={{ padding: '4px 8px', borderColor: m.color }}>
                  <input type="checkbox" checked={form.assignedTo.includes(m.id)}
                    onChange={(e) => set('assignedTo', e.target.checked ? [...form.assignedTo, m.id] : form.assignedTo.filter((x) => x !== m.id))} />
                  {m.displayName}
                </label>
              ))}
            </div>
          </div>

          <label className="field"><span>Reminder</span>
            <select value={form.remind} onChange={(e) => set('remind', e.target.value)}>
              {REMIND_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          {form.remind !== 'none' && (
            <>
              <div className="row wrap" style={{ marginBottom: 12 }} role="group" aria-label="Remind via">
                <label className="chip" style={{ padding: '4px 8px' }}><input type="checkbox" checked={form.push} onChange={(e) => set('push', e.target.checked)} /> 📱 Phone</label>
                <label className="chip" style={{ padding: '4px 8px' }}><input type="checkbox" checked={form.house} onChange={(e) => set('house', e.target.checked)} /> 🔊 House</label>
              </div>
              <label className="field"><span>Repeat the alert until handled</span>
                <select value={form.renotify} onChange={(e) => set('renotify', e.target.value)}>
                  {RENOTIFY_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
            </>
          )}
          <label className="field"><span>Notes</span>
            <textarea rows={2} value={form.notes} maxLength={2000} onChange={(e) => set('notes', e.target.value)} />
          </label>
        </fieldset>
      )}
      {form && eventId && canEdit && (
        <div className="row wrap" style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          {meta?.recurring && <button className="danger" disabled={busy} onClick={deleteOne}>Delete only {date.slice(5)}</button>}
          <button className="danger" disabled={busy} onClick={deleteSeries}>{meta?.recurring ? 'Delete series' : 'Delete event'}</button>
        </div>
      )}
    </Modal>
  );
}
