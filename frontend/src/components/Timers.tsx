// SPEC §8.5 — Timers screen (single-line list) and timer form.
import { useEffect, useMemo, useState } from 'react';
import { Modal } from './Modal';
import { ChannelChecks, RenotifySelect, SHORT } from './AlertFields';
import { del, errorText, get, patch, post } from '../api';
import { useApp } from '../state';
import { WEEKDAY, type Channel } from '../../../src/shared/vocab';
import { utcToLocal, weekdayOf } from '../../../src/shared/time';
import { canChange } from '../../../src/shared/roles';
import { ALERT_TITLE_MAX, TIMER_INTERVAL_MAX, TIMER_INTERVAL_MIN } from '../../../src/shared/alert-limits';
import s from './Lists.module.css';

export interface Timer {
  id: string; title: string; intervalMin: number; channels: Channel[]; renotifyMin: number | null; maxAlerts: number;
  assignedTo: string[]; running: boolean; createdBy: string;
  /** §4.2n — the active time range, "HH:MM"; both null = always. */
  activeFrom: string | null; activeTo: string | null;
  /** §5.5a — announce when the window opens each day. */
  announceStart: boolean;
  openFire: { id: string; due_at: string; state: string; alert_count: number } | null;
}

export function minutesText(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** The "Rolling timers" section of the Alarms tab (SPEC §8.5). */
export function TimersSection({ onEdit }: { onEdit: (t: Timer | null) => void }) {
  const { version, tz, today, refresh } = useApp();
  const [timers, setTimers] = useState<Timer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, setNow] = useState(0);

  useEffect(() => {
    get<Timer[]>('/timers').then((t) => { setTimers(t); setError(null); }).catch((e) => setError(errorText(e)));
  }, [version]);

  // Re-render each 20 s so "ringing N min" stays true; times are computed from stored timestamps.
  useEffect(() => { const i = setInterval(() => setNow((n) => n + 1), 20_000); return () => clearInterval(i); }, []);

  async function command(t: Timer, cmd: 'start' | 'stop') {
    try { await post(`/timers/${t.id}/commands`, { cmd }); refresh(); } catch (e) { setError(errorText(e)); }
  }

  const statusOf = (t: Timer) => {
    if (!t.running) return <span className="badge neutral">stopped</span>;
    if (t.openFire?.state === 'ringing') return <span className="badge bad">ringing</span>;
    return <span className="badge good">running</span>;
  };
  const nextOf = (t: Timer) => {
    if (!t.running || !t.openFire) return '—';
    if (t.openFire.state === 'ringing') return `${Math.max(0, Math.round((Date.now() - Date.parse(t.openFire.due_at)) / 60_000))} min`;
    // The server's due time; the day is named when it isn't today (§8.5).
    const l = utcToLocal(t.openFire.due_at, tz);
    return l.date === today() ? l.time : `${SHORT[WEEKDAY[weekdayOf(l.date)]]} ${l.time}`;
  };

  return (
    <section className={s.section} aria-label="Rolling timers">
      <div className="row" style={{ marginBottom: 6 }}>
        <h2 style={{ flex: 1, marginBottom: 0 }}>Rolling timers</h2>
        <button onClick={() => onEdit(null)}>＋ Add</button>
      </div>
      <p className="muted" style={{ fontSize: '.85rem', marginBottom: 10 }}>
        A timer rings after its interval and restarts from the moment someone taps <b>Ack</b>.
      </p>
      {error && <div role="alert" className="alert-error">{error}</div>}
      {timers === null && !error && <p className="muted">Loading…</p>}
      {timers?.length === 0 && <p className="muted">No timers yet.</p>}
      {!!timers?.length && (
        <table className={s.table}>
          <thead>
            <tr>
              <th scope="col">Timer</th>
              <th scope="col">Status</th>
              <th scope="col">Next</th>
              <th scope="col"><span className="visually-hidden">Start or stop</span></th>
            </tr>
          </thead>
          <tbody>
            {timers.map((t) => (
              <tr key={t.id}>
                <th scope="row" className={s.flexible}>
                  <button className="plain" style={{ textAlign: 'left', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}
                    onClick={() => onEdit(t)} title={`Edit ${t.title}`}>
                    ⏱ {t.title} <span className="muted">· {minutesText(t.intervalMin)}{t.activeFrom && t.activeTo ? ` · ${t.activeFrom}–${t.activeTo}` : ''}</span>
                  </button>
                </th>
                <td className={s.rigid}>{statusOf(t)}</td>
                <td className={s.rigid}>{nextOf(t)}</td>
                <td className={s.rigid}>
                  {t.running
                    ? <button onClick={() => command(t, 'stop')} aria-label={`Stop ${t.title}`}>Stop</button>
                    : <button className="primary" onClick={() => command(t, 'start')} aria-label={`Start ${t.title}`}>Start</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function TimerForm({ timer, onClose }: { timer: Timer | null; onClose: () => void }) {
  const { me, members, refresh } = useApp();
  const init = useMemo(() => ({
    title: timer?.title ?? '', interval: String(timer?.intervalMin ?? 60),
    push: timer ? timer.channels.includes('push') : true, house: timer ? timer.channels.includes('house') : false,
    renotify: timer ? (timer.renotifyMin ? String(timer.renotifyMin) : 'off') : '15',
    assignedTo: timer?.assignedTo ?? [],
    activeFrom: timer?.activeFrom ?? '', activeTo: timer?.activeTo ?? '', announceStart: timer?.announceStart ?? false,
  }), [timer]);
  const [f, setF] = useState(init);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(f) !== JSON.stringify(init);
  const canEdit = !timer || canChange(timer.createdBy, me);
  const hasWindow = !!(f.activeFrom && f.activeTo);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await fn(); refresh(); onClose(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  const save = () => run(async () => {
    const channels = [...(f.push ? ['push'] : []), ...(f.house ? ['house'] : [])];
    if (!channels.length) throw new Error('Pick at least one way to alert (Phone or House).');
    const body = { title: f.title, intervalMin: Number(f.interval), channels, renotifyMin: f.renotify === 'off' ? null : Number(f.renotify), assignedTo: f.assignedTo,
      activeFrom: f.activeFrom || null, activeTo: f.activeTo || null, announceStart: hasWindow && f.announceStart };
    if (timer) await patch(`/timers/${timer.id}`, body); else await post('/timers', body);
  });

  return (
    <Modal title={timer ? `Edit timer: ${timer.title}` : 'New timer'} onClose={onClose} dirty={dirty} error={error}
      footer={<>
        {canEdit && <button className="primary" disabled={busy || !f.title.trim()} onClick={save}>Save</button>}
        <button onClick={onClose} disabled={busy}>Cancel</button>
        <span className="spacer" />
        {timer && canEdit && <button className="danger" disabled={busy} onClick={() => { if (confirm(`Delete timer "${timer.title}"?`)) run(() => del(`/timers/${timer.id}`)); }}>Delete</button>}
      </>}>
      <fieldset disabled={!canEdit || busy} style={{ border: 0, padding: 0 }}>
        <label className="field"><span>Title</span>
          <input value={f.title} maxLength={ALERT_TITLE_MAX} onChange={(e) => setF({ ...f, title: e.target.value })} autoFocus={!timer} />
        </label>
        <label className="field"><span>Interval (minutes, {TIMER_INTERVAL_MIN}–{TIMER_INTERVAL_MAX})</span>
          <input type="number" inputMode="numeric" min={TIMER_INTERVAL_MIN} max={TIMER_INTERVAL_MAX} value={f.interval} onChange={(e) => setF({ ...f, interval: e.target.value })} />
        </label>
        <div className="row" role="group" aria-label="Active time range (empty = always)">
          <label className="field" style={{ flex: 1 }}><span>Active from</span>
            <input type="time" value={f.activeFrom} onChange={(e) => setF({ ...f, activeFrom: e.target.value })} />
          </label>
          <label className="field" style={{ flex: 1 }}><span>to</span>
            <input type="time" value={f.activeTo} onChange={(e) => setF({ ...f, activeTo: e.target.value })} />
          </label>
        </div>
        <p className="muted" style={{ fontSize: '.8rem', marginTop: -4 }}>Both empty = always.</p>
        {hasWindow && (
          <label className="row" style={{ gap: 8, marginBottom: 12 }}>
            <input type="checkbox" checked={f.announceStart} onChange={(e) => setF({ ...f, announceStart: e.target.checked })} />
            📢 Announce the start of each day
          </label>
        )}
        <ChannelChecks push={f.push} house={f.house} onChange={(c) => setF({ ...f, ...c })} />
        <RenotifySelect label="While ringing, repeat the alert" value={f.renotify} onChange={(renotify) => setF({ ...f, renotify })} />
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
    </Modal>
  );
}
