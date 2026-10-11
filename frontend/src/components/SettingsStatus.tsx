// SPEC §8.6 ⚑ Q38 — Settings → 📊 Status: the House announcements line and the recent deliveries table.
import { useApp, type Status } from '../state';
import type { DeliveryStatus } from '../../../src/shared/vocab';
import s from './Lists.module.css';

const STATUS_BADGE: Record<DeliveryStatus, string> = { sent: 'good', partial: 'warn', failed: 'bad', queued: 'neutral', claimed: 'neutral' };

/** §8.6 ⚑ Q38 — the House line, from the server's `house` as given (§9.2). */
function HouseLine({ house: h, localTime }: { house: Status['house']; localTime: (iso: string) => string }) {
  if (h.state === 'ok') return <span className="badge good">working{h.lastOkAt ? ` · last ${localTime(h.lastOkAt)}` : ''}</span>;
  if (h.state === 'untried') return <span className="badge neutral">not tried yet</span>;
  if (h.state === 'not_configured') return <span className="badge bad">not set up</span>;
  return <><span className="badge bad">failing{h.lastFailedAt ? ` since ${localTime(h.lastFailedAt)}` : ''}</span>
    {h.lastError && <span className="muted" style={{ display: 'block', overflowWrap: 'anywhere' }}>{h.lastError}</span>}</>;
}

/** Renders nothing until the status has loaded. */
export function SettingsStatus() {
  const { status, localTime } = useApp();
  if (!status) return null;
  return (
    <>
      <p style={{ marginBottom: 8 }}>
        House announcements: <HouseLine house={status.house} localTime={localTime} />
      </p>
      {status.recentDeliveries.length === 0 ? <p className="muted">No alerts sent yet.</p> : (
        <table className={s.table}>
          <thead><tr><th scope="col">Alert</th><th scope="col">Via</th><th scope="col">Result</th><th scope="col">When</th></tr></thead>
          <tbody>
            {status.recentDeliveries.map((d) => (
              <tr key={d.id}>
                <th scope="row" className={s.flexible} title={`${d.message}${d.detail ? `\n${d.detail}` : ''}`}>{d.message}{d.member ? ` → ${d.member}` : ''}</th>
                <td className={s.rigid}>{d.channel === 'push' ? '📱' : '🔊'}<span className="visually-hidden">{d.channel}</span></td>
                <td className={s.rigid}><span className={`badge ${STATUS_BADGE[d.status] ?? 'neutral'}`} title={d.detail ?? ''}>{d.status}</span></td>
                <td className={s.rigid}>{localTime(d.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
