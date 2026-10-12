// SPEC §9.5 — Settings → 🔔 Alerts: every push I got, newest first; a red ❌ hides one, Clear all hides them all, a tap
// opens its card; a card whose fire still rings carries that fire's buttons (FireActions), so a tapped push can be acked
// right there. A tapped phone notification lands here on its card (useAlertLink). Titles and sources are the
// server's, shown as given.
import { useCallback, useEffect, useRef, useState } from 'react';
import { del, get } from '../api';
import { useApp } from '../state';
import { ALERTS_PATH, alertIdFrom } from '../../../src/shared/alert-history';
import type { AlertKind, DeliveryStatus } from '../../../src/shared/vocab';
import { utcToLocal } from '../../../src/shared/time';
import { useAction } from './useAction';
import { Modal } from './Modal';
import { FireActions } from './FireActions';
import s from './Lists.module.css';

interface MyAlert {
  id: string; title: string; message: string; source: string; kind: AlertKind | null; alertNumber: number | null; fireId: string | null;
  status: DeliveryStatus; detail: string | null; createdAt: string;
}

/** The alert a tapped notification asks for (read once at start, then the address goes back to `/`), or null. */
export function useAlertLink(): [string | null, () => void] {
  const [id, setId] = useState(() => {
    const found = alertIdFrom(location.pathname, location.search);
    if (location.pathname === ALERTS_PATH) history.replaceState(null, '', '/');
    return found;
  });
  return [id, useCallback(() => setId(null), [])];
}

const RED_X = { background: 'none', border: 0, padding: '0 6px', minHeight: 44, flex: 'none' } as const;

export function MyAlerts({ openId, onOpened }: { openId: string | null; onOpened: () => void }) {
  const { tz, today, version, ringing, clock } = useApp();
  const [alerts, setAlerts] = useState<MyAlert[] | null>(null);
  const [card, setCard] = useState<MyAlert | 'missing' | null>(null);
  const [actError, setActError] = useState<string | null>(null);
  const { run, busy, errorEl } = useAction();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { get<{ alerts: MyAlert[] }>('/me/alerts').then((r) => setAlerts(r.alerts)).catch(() => setAlerts([])); }, [version]);
  useEffect(() => {
    if (!openId || alerts === null) return;
    setCard(alerts.find((a) => a.id === openId) ?? 'missing');
    ref.current?.scrollIntoView({ block: 'start' });
    onOpened();
  }, [openId, alerts, onOpened]);

  const when = (iso: string, full = false) => {
    const l = utcToLocal(iso, tz);
    return full || l.date !== today() ? `${l.date} ${clock(l.time)}` : clock(l.time);
  };
  const hide = (id: string) => run(async () => {
    await del(`/me/alerts/${encodeURIComponent(id)}`);
    setAlerts((a) => a && a.filter((x) => x.id !== id));
  });
  const clearAll = () => {
    if (confirm('Clear all your alerts?')) run(async () => { await del('/me/alerts'); setAlerts([]); });
  };

  return (
    <div ref={ref}>
      <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 8 }}>
        <button disabled={busy || !alerts?.length} onClick={clearAll}>Clear all</button>
      </div>
      {errorEl}
      {alerts === null ? null : alerts.length === 0 ? <p className="muted">No alerts yet.</p> : (
        <ul className={s.list}>
          {alerts.map((a) => (
            <li key={a.id} className={s.row}>
              <button className={s.item} onClick={() => setCard(a)}>
                <span className={s.what}>
                  <span className={s.title}><b>{a.title}</b> · {a.message}</span>
                  <span className="muted" style={{ fontSize: '.8rem' }}>{a.source} · {when(a.createdAt)}</span>
                </span>
              </button>
              <button aria-label={`Delete alert: ${a.message}`} title="Delete" disabled={busy} style={RED_X} onClick={() => hide(a.id)}>❌</button>
            </li>
          ))}
        </ul>
      )}
      {card === 'missing' && (
        <Modal title="Alert" onClose={() => setCard(null)} footer={<button onClick={() => setCard(null)}>Close</button>}>
          <p>This alert is no longer in your list.</p>
        </Modal>
      )}
      {card && card !== 'missing' && (() => {
        const fire = card.fireId ? ringing.find((f) => f.id === card.fireId) : undefined;
        const close = () => { setCard(null); setActError(null); };
        return (
        <Modal title={card.title} onClose={close} footer={<button onClick={close}>Close</button>}>
          {actError && <div role="alert" className="alert-error">{actError}</div>}
          <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginBottom: 12 }}>{card.message}</p>
          <p className="muted">When: {when(card.createdAt, true)}</p>
          <p className="muted">From: {card.source}{card.alertNumber ? ` · alert ${card.alertNumber}` : ''}</p>
          <p className="muted">Phone: {card.status}{card.detail ? ` — ${card.detail}` : ''}</p>
          {fire ? <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 12 }}><FireActions fire={fire} onActed={close} onError={setActError} /></div>
            : card.fireId && <p style={{ marginTop: 12 }}>Already handled.</p>}
        </Modal>
        );
      })()}
    </div>
  );
}
