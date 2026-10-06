// SPEC §8.4 — event form (modal). Creates or edits an event and its reminder; a new one can be filled from a screenshot (§7.8).
import { useEffect, useMemo, useState } from 'react';
import { Modal } from './Modal';
import { del, errorText, get, patch, post, put } from '../api';
import { useApp } from '../state';
import { WEEKDAY } from '../../../src/shared/vocab';
import { weekdayOf } from '../../../src/shared/time';
import { canChange } from '../../../src/shared/roles';
import { ALERT_TITLE_MAX, EVENT_NOTES_MAX } from '../../../src/shared/alert-limits';
import { type Recurrence } from '../../../src/shared/recurrence';
import { longDate } from './DaySheet';
import { FromThing } from './ThingPhoto';
import { EventPhotoFill } from './EventPhotoFill';
import { RepeatFields, ownWeek, repeatOf, toRecurrence, weeksOf, type RepeatValue } from './RepeatFields';
import { ReminderFields, reminderOf, toReminder, type ReminderValue } from './ReminderFields';

interface Form extends RepeatValue, ReminderValue {
  title: string; notes: string; date: string; allDay: boolean; startTime: string; endTime: string; endDate: string;
  assignedTo: string[]; optional: boolean; emoji: string;
}

function blank(date: string): Form {
  return {
    title: '', notes: '', date, allDay: false, startTime: '09:00', endTime: '', endDate: date,
    repeat: 'none', byDay: [WEEKDAY[weekdayOf(date)]], weeks: ownWeek(date), until: '', assignedTo: [], optional: false, emoji: '',
    ...reminderOf(null),
  };
}

function fromEvent(e: any): Form {
  const r: Recurrence | null = e.recurrence;
  const repeat = repeatOf(r);
  return {
    title: e.title, notes: e.notes ?? '', date: e.startDate, allDay: e.allDay, startTime: e.startTime ?? '09:00',
    endTime: e.endTime ?? '', endDate: e.endDate, repeat, byDay: r?.byDay ?? [WEEKDAY[weekdayOf(e.startDate)]],
    weeks: weeksOf(r, e.startDate), until: r?.until ?? '', assignedTo: e.assignedTo, optional: !!e.optional, emoji: e.emoji ?? '',
    ...reminderOf(e.reminder),
  };
}

function toPayload(f: Form) {
  const recurrence = toRecurrence(f, f.date);
  return {
    title: f.title, notes: f.notes || null, startDate: f.date,
    startTime: f.allDay ? null : f.startTime, endTime: f.allDay || !f.endTime ? null : f.endTime,
    endDate: f.allDay ? f.endDate : f.date,
    recurrence, assignedTo: f.assignedTo, optional: f.optional, emoji: f.emoji.trim() || null,
    reminder: toReminder(f),
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
  const [meta, setMeta] = useState<{ createdBy: string; recurring: boolean; thingId: string | null; optional: boolean; on: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!eventId) return;
    get(`/events/${eventId}`).then((e) => {
      const f = fromEvent(e);
      setForm(f); setInitial(JSON.stringify(f));
      setMeta({ createdBy: e.createdBy, recurring: !!e.recurrence, thingId: e.thingId ?? null, optional: !!e.optional, on: !!e.on });
    }).catch((e) => setError(errorText(e)));
  }, [eventId]);

  const dirty = useMemo(() => form !== null && JSON.stringify(form) !== initial, [form, initial]);
  const canEdit = !eventId || canChange(meta?.createdBy ?? null, me);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await fn(); refresh(); onClose(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }

  const save = () => run(async () => {
    if (!form) return;
    if (form.remind !== 'none' && !form.push && !form.house) throw new Error('Pick at least one way to be reminded (Phone or House).');
    if (form.repeat === 'WEEKLY' && form.byDay.length === 0) throw new Error('Pick at least one day of the week.');
    if (form.repeat === 'MONTHLY_WEEKS' && form.weeks.length === 0) throw new Error('Pick at least one week of the month.');
    const payload = toPayload(form);
    if (eventId) await patch(`/events/${eventId}`, payload);
    else await post('/events', payload);
  });

  /** §7.5 ⚑ — this member's own switch: instant, no Save, usable even when the event can't be edited. */
  const setOn = async (on: boolean) => {
    setBusy(true); setError(null);
    try { await (on ? put(`/events/${eventId}/optin`, {}) : del(`/events/${eventId}/optin`)); setMeta((m) => m && { ...m, on }); refresh(); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };

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
      {meta?.thingId && <FromThing thingId={meta.thingId} />}
      {form && (
        <fieldset disabled={!canEdit || busy} style={{ border: 0, padding: 0 }}>
          {!eventId && <EventPhotoFill form={form} opened={blank(date)} onFill={setForm} />}
          {!canEdit && <p className="muted" style={{ marginBottom: 10 }}>Only the creator or an admin can change this event.</p>}
          <label className="field"><span>Title</span>
            <input value={form.title} maxLength={ALERT_TITLE_MAX} onChange={(e) => set('title', e.target.value)} autoFocus={!eventId} />
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

          <RepeatFields value={form} date={form.date} onChange={(c) => setForm((f) => (f ? { ...f, ...c } : f))} />

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
          <label className="field"><span>Emoji (optional)</span>
            <input value={form.emoji} onChange={(e) => set('emoji', e.target.value)} placeholder="🧹" style={{ width: '5rem' }} />
          </label>

          <ReminderFields value={form} allDay={form.allDay} onChange={(c) => setForm((f) => (f ? { ...f, ...c } : f))} />
          <label className="row" style={{ marginBottom: 12, minHeight: 44 }}>
            <input type="checkbox" checked={form.optional} onChange={(e) => set('optional', e.target.checked)} /> Optional — each person turns it on
          </label>
          <label className="field"><span>Notes</span>
            <textarea rows={2} value={form.notes} maxLength={EVENT_NOTES_MAX} onChange={(e) => set('notes', e.target.value)} />
          </label>
        </fieldset>
      )}
      {form && meta?.optional && (
        <label className="row" style={{ marginBottom: 12, minHeight: 44 }}>
          <input type="checkbox" checked={meta.on} disabled={busy} onChange={(e) => setOn(e.target.checked)} /> On for me
        </label>
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
