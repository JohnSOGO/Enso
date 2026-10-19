// SPEC §8.5b — Alerts → 📌 Reminders: one-off reminders that ring until Done, or (§8.5c) 🎲 random times in a window
// on chosen days. The list (state from the server, never re-derived) and the reminder form; the chip times are whenChoice
// (src/shared/reminders.ts).
import { useEffect, useMemo, useState } from 'react';
import { Modal } from './Modal';
import { ChannelChecks, DayChips, SHORT, channelsOf, daysText, flagsOf, pickOneWay } from './AlertFields';
import { del, errorText, get, patch, post } from '../api';
import { useApp, useIsFounder } from '../state';
import { WEEKDAY, type Channel, type ReminderState } from '../../../src/shared/vocab';
import { addDays, utcToLocal, weekdayOf } from '../../../src/shared/time';
import { canChange, cannotChangeText } from '../../../src/shared/roles';
import { ALERT_TITLE_MAX } from '../../../src/shared/alert-limits';
import {
  AFTER_LABEL, REMINDER_RENOTIFY, REMINDER_RENOTIFY_DEFAULT, WHEN_CHOICE, WHEN_DEFAULT, WINDOW_DEFAULT, whenChoice,
  type After, type ReminderWindow, type WhenChoiceId,
} from '../../../src/shared/reminders';
import s from './Lists.module.css';

/** GET /reminders (§10). */
export interface Reminder {
  id: string; title: string; date: string; time: string; channels: Channel[]; renotifyMin: number | null;
  assignedTo: string[]; createdBy: string; state: ReminderState; dueAt: string; window: ReminderWindow | null;
}

const RENOTIFY_TEXT: Record<number, string> = { 15: 'Every 15 min', 30: 'Every 30 min', 60: 'Every hour' };

/** "Today" / "Tomorrow" / "Thu Oct 22" for a local date. */
function dayText(date: string, today: string): string {
  if (date === today) return 'Today';
  if (date === addDays(today, 1)) return 'Tomorrow';
  const md = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${SHORT[WEEKDAY[weekdayOf(date)]]} ${md}`;
}

export function RemindersSection() {
  const { version, tz, localTime, clock, members } = useApp();
  const [list, setList] = useState<Reminder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ reminder: Reminder | null } | null>(null);
  useEffect(() => {
    get<Reminder[]>('/reminders').then((r) => { setList(r); setError(null); }).catch((e) => setError(errorText(e)));
  }, [version]);

  const today = utcToLocal(new Date().toISOString(), tz).date;
  const who = (r: Reminder) => (r.assignedTo.length
    ? r.assignedTo.map((id) => members.find((m) => m.id === id)?.displayName ?? 'unknown member').join(', ')
    : 'Everyone');
  const when = (r: Reminder) => (r.window
    ? `🎲 ${daysText(r.window.days)} ${clock(r.window.from)}–${clock(r.window.to)}`
    : `${dayText(utcToLocal(r.dueAt, tz).date, today)} ${localTime(r.dueAt)}`);

  return (
    <section className={s.section} aria-label="Reminders">
      <div className="row" style={{ marginBottom: 6 }}>
        <span style={{ flex: 1 }} />
        <button className="primary" onClick={() => setEditing({ reminder: null })}>＋ Add</button>
      </div>
      <p className="muted" style={{ fontSize: '.85rem', marginBottom: 10 }}>Something to get done. It rings, then again and again until someone taps Done. 🎲 rings at random times on the days you pick.</p>
      {error && <div role="alert" className="alert-error">{error}</div>}
      {list === null && !error && <p className="muted">Loading…</p>}
      {list?.length === 0 && <p className="muted">No reminders waiting.</p>}
      {!!list?.length && (
        <ul className={s.list}>
          {list.map((r) => (
            <li key={r.id}>
              <button className="plain" onClick={() => setEditing({ reminder: r })}
                style={{ width: '100%', textAlign: 'left', display: 'flex', gap: 8, alignItems: 'center', minHeight: 44 }}>
                <span style={{ flex: 'none', fontVariantNumeric: 'tabular-nums', opacity: r.state === 'missed' ? 0.5 : 1 }}>{when(r)}</span>
                <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}><b>{r.title}</b> <span className="muted">· {who(r)}</span></span>
                {r.state === 'ringing' && <span className="badge bad" style={{ flex: 'none' }}>ringing</span>}
                {r.state === 'missed' && <span className="muted" style={{ flex: 'none' }}>missed</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && <ReminderForm reminder={editing.reminder} onClose={() => setEditing(null)} />}
    </section>
  );
}

function ReminderForm({ reminder, onClose }: { reminder: Reminder | null; onClose: () => void }) {
  const { me, members, tz, refresh } = useApp();
  const founder = useIsFounder();
  /** ⚑ Q316 — the one person ticked under Remind decides After work / After school; none or several, mine. */
  const afterFor = (ids: string[]): After => (ids.length === 1 && members.find((m) => m.id === ids[0])?.after) || me.after;
  const init = useMemo(() => {
    const at = reminder ?? whenChoice(WHEN_DEFAULT, new Date().toISOString(), tz, me.after.time);
    return {
      title: reminder?.title ?? '', date: at.date, time: at.time, assignedTo: reminder?.assignedTo ?? [me.id],
      ...flagsOf(reminder?.channels, founder), renotify: reminder?.renotifyMin ?? REMINDER_RENOTIFY_DEFAULT,
      random: !!reminder?.window, window: reminder?.window ?? WINDOW_DEFAULT, // ⚑ Q328
    };
  }, [reminder, me.id, me.after.time, tz, founder]);
  const [f, setF] = useState(init);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(f) !== JSON.stringify(init);
  const canEdit = !reminder || canChange(reminder.createdBy, me);
  const after = afterFor(f.assignedTo);
  const pick = (id: WhenChoiceId) => setF({ ...f, ...whenChoice(id, new Date().toISOString(), tz, after.time) });

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await fn(); refresh(); onClose(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  const save = () => run(async () => {
    const channels = channelsOf(f);
    if (!channels.length) throw new Error(pickOneWay('remind'));
    const body = f.random
      ? { title: f.title, window: f.window, channels, assignedTo: f.assignedTo }
      : { title: f.title, date: f.date, time: f.time, channels, renotifyMin: f.renotify, assignedTo: f.assignedTo, window: null };
    if (reminder) await patch(`/reminders/${reminder.id}`, body); else await post('/reminders', body);
  });

  return (
    <Modal title={reminder ? 'Edit reminder' : 'New reminder'} onClose={onClose} dirty={dirty} error={error}
      footer={<>
        {canEdit && <button className="primary" disabled={busy || !f.title.trim()} onClick={save}>Save</button>}
        <button onClick={onClose} disabled={busy}>Cancel</button>
      </>}>
      <fieldset disabled={!canEdit || busy}>
        {!canEdit && <p className="muted" style={{ marginBottom: 10 }}>{cannotChangeText('reminder')}</p>}
        <label className="field"><span>What?</span>
          <input value={f.title} maxLength={ALERT_TITLE_MAX} placeholder="Get bird food" onChange={(e) => setF({ ...f, title: e.target.value })} autoFocus={!reminder} />
        </label>
        <label className="chip" style={{ padding: '4px 8px', marginBottom: 8 }}>
          <input type="checkbox" checked={f.random} onChange={(e) => setF({ ...f, random: e.target.checked })} /> 🎲 Random times on chosen days
        </label>
        {f.random ? <>
          <DayChips days={f.window.days} onChange={(days) => setF({ ...f, window: { ...f.window, days } })} />
          <div className="row">
            <label className="field" style={{ flex: 1, minWidth: 0 }}><span>From</span>
              <input type="time" value={f.window.from} onChange={(e) => setF({ ...f, window: { ...f.window, from: e.target.value } })} />
            </label>
            <label className="field" style={{ flex: 1, minWidth: 0 }}><span>To</span>
              <input type="time" value={f.window.to} onChange={(e) => setF({ ...f, window: { ...f.window, to: e.target.value } })} />
            </label>
          </div>
          <p className="muted" style={{ fontSize: '.8rem', marginBottom: 10 }}>Rings once on each of those days, at a random time in between, until Done.</p>
        </> : <div className="field" role="group" aria-label="When">
          <span className="muted" style={{ fontSize: '.8rem' }}>When</span>
          <div className="row wrap" style={{ marginTop: 4 }}>
            {WHEN_CHOICE.map((w) => <button key={w.id} type="button" onClick={() => pick(w.id)}>{w.id === 'work' ? AFTER_LABEL[after.kind] : w.label}</button>)}
          </div>
          <div className="row" style={{ marginTop: 6 }}>
            <input type="date" aria-label="Date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} style={{ flex: 1, minWidth: 0 }} />
            <input type="time" aria-label="Time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} style={{ flex: 1, minWidth: 0 }} />
          </div>
        </div>}
        <div className="field" role="group" aria-label="Remind">
          <span className="muted" style={{ fontSize: '.8rem' }}>Remind (none = everyone)</span>
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
        <ChannelChecks value={f} onChange={(c) => setF({ ...f, ...c })} />
        {!f.random && <label className="field"><span>Repeat until Done</span>
          <select value={f.renotify} onChange={(e) => setF({ ...f, renotify: Number(e.target.value) })}>
            {REMINDER_RENOTIFY.map((m) => <option key={m} value={m}>{RENOTIFY_TEXT[m]}</option>)}
          </select>
        </label>}
      </fieldset>
      {reminder && canEdit && (
        <div className="row wrap" style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <button className="danger" disabled={busy} onClick={() => { if (confirm(`Delete reminder "${reminder.title}"?`)) run(() => del(`/reminders/${reminder.id}`)); }}>Delete reminder</button>
        </div>
      )}
    </Modal>
  );
}
