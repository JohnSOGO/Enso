// SPEC §8.6, §7.5 — Settings → 📅 Calendar items: the built-in Public holidays and 📈 rows,
// then each optional event, how it repeats, and this member's own On switch.
import { useEffect, useState, type ReactNode } from 'react';
import { del, errorText, get, patch, put } from '../api';
import { useApp } from '../state';
import type { Recurrence } from '../../../src/shared/recurrence';
import { repeatText } from './RepeatFields';
import { useAction } from './useAction';
import s from './Lists.module.css';

interface OptionalEvent { id: string; title: string; recurrence: Recurrence | null; startDate: string; emoji: string | null; on: boolean }

export function OptionalItems() {
  const { version, refresh, me } = useApp();
  const [rows, setRows] = useState<OptionalEvent[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { run, busy, errorEl } = useAction();
  useEffect(() => {
    get<OptionalEvent[]>('/optional-events').then((r) => { setRows(r); setLoadError(null); }).catch((e) => setLoadError(errorText(e)));
  }, [version]);

  const toggle = (e: OptionalEvent, on: boolean) => run(async () => {
    await (on ? put(`/events/${e.id}/optin`, {}) : del(`/events/${e.id}/optin`));
    setRows((rs) => rs && rs.map((x) => (x.id === e.id ? { ...x, on } : x)));
    refresh(); // the calendar and the Ringing bar follow at once
  });
  const setPref = (key: 'showPublicHolidays' | 'showOptionsExpiration', on: boolean) =>
    run(async () => { await patch('/me', { [key]: on }); refresh(); });

  const line = (key: string, label: string, title: ReactNode, on: boolean, onChange: (on: boolean) => void) => (
    <tr key={key}>
      <th scope="row" className={s.flexible} title={label}>{title}</th>
      <td className={s.rigid}>
        <label className="row" style={{ minHeight: 44 }}>
          <input type="checkbox" checked={on} disabled={busy} aria-label={`${label}: on for me`}
            onChange={(ev) => onChange(ev.target.checked)} /> On
        </label>
      </td>
    </tr>
  );

  return (
    <div className="field">
      <h3 style={{ fontSize: '.9rem', margin: '0 0 4px' }}>Optional calendar items</h3>
      {loadError && <div role="alert" className="alert-error">Couldn't load optional items: {loadError}</div>}
      {errorEl}
      <table className={s.table}>
        <tbody>
          {line('public', 'Public holidays', 'Public holidays', !!me.showPublicHolidays, (on) => setPref('showPublicHolidays', on))}
          {line('market', 'Monthly options expiration', '📈 Monthly options expiration', !!me.showOptionsExpiration, (on) => setPref('showOptionsExpiration', on))}
          {rows?.map((e) => line(e.id, e.title, <>
            {e.emoji && `${e.emoji} `}{e.title} <span className="muted" style={{ fontWeight: 400 }}>· {repeatText(e.recurrence, e.startDate)}</span>
          </>, e.on, (on) => toggle(e, on)))}
        </tbody>
      </table>
    </div>
  );
}
