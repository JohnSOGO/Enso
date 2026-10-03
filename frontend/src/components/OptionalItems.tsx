// SPEC §8.6, §7.5 — Settings → Me → Optional calendar items: each optional event, how it repeats,
// and this member's own On switch.
import { useEffect, useState } from 'react';
import { del, errorText, get, put } from '../api';
import { useApp } from '../state';
import type { Recurrence } from '../../../src/shared/recurrence';
import { repeatText } from './RepeatFields';
import { useAction } from './useAction';
import s from './Lists.module.css';

interface OptionalEvent { id: string; title: string; recurrence: Recurrence | null; startDate: string; on: boolean }

export function OptionalItems() {
  const { version, refresh } = useApp();
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

  return (
    <div className="field">
      <h3 style={{ fontSize: '.9rem', margin: '0 0 4px' }}>Optional calendar items</h3>
      {loadError && <div role="alert" className="alert-error">Couldn't load optional items: {loadError}</div>}
      {errorEl}
      {rows && rows.length === 0 && <p className="muted" style={{ fontSize: '.85rem' }}>No optional items yet.</p>}
      {rows && rows.length > 0 && (
        <table className={s.table}>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <th scope="row" className={s.flexible} title={e.title}>
                  {e.title} <span className="muted" style={{ fontWeight: 400 }}>· {repeatText(e.recurrence, e.startDate)}</span>
                </th>
                <td className={s.rigid}>
                  <label className="row" style={{ minHeight: 44 }}>
                    <input type="checkbox" checked={e.on} disabled={busy} aria-label={`${e.title}: on for me`}
                      onChange={(ev) => toggle(e, ev.target.checked)} /> On
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
