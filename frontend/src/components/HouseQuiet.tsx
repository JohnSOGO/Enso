// SPEC §8.5, §9.2b — 🤫 Quiet the house, under 📢 Announce: the speakers say nothing for 1 h / 2 h / 4 h or the
// rest of today; phones carry on. While quiet: until when, how long is left, who set it, and Turn off now.
import { useEffect, useState } from 'react';
import { del, errorText, get, put } from '../api';
import { useApp } from '../state';
import { quietState } from '../../../src/shared/house-quiet';
import { utcToLocal } from '../../../src/shared/time';
import { HOUSE_QUIET_FOR, type HouseQuietFor } from '../../../src/shared/vocab';

interface Quiet { until: string | null; byName: string | null }

const LABEL: Record<HouseQuietFor, string> = { '1h': '1 hour', '2h': '2 hours', '4h': '4 hours', today: 'Rest of today' };

const left = (until: string, now: number) => {
  const min = Math.max(1, Math.ceil((Date.parse(until) - now) / 60_000));
  return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`;
};

export function HouseQuiet() {
  const { tz, version } = useApp();
  const [q, setQ] = useState<Quiet>({ until: null, byName: null });
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { get<Quiet>('/house/quiet').then(setQ).catch(() => {}); }, [version]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);

  async function run(fn: () => Promise<Quiet>) {
    setBusy(true); setError(null);
    try { setQ(await fn()); setChoosing(false); setNow(Date.now()); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  const until = quietState(q.until, new Date(now).toISOString());

  return (
    <div style={{ marginBottom: 12 }}>
      {until ? (
        <>
          <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              🤫 House is quiet until {utcToLocal(until, tz).time} · {left(until, now)} left{q.byName && ` · set by ${q.byName}`}
            </span>
            <button disabled={busy} onClick={() => run(() => del<Quiet>('/house/quiet'))}>Turn off now</button>
          </div>
          <p className="muted" style={{ fontSize: '.85rem', marginTop: 4 }}>Phones still get alerts.</p>
        </>
      ) : choosing ? (
        <div className="row wrap" role="group" aria-label="Quiet the house for" style={{ gap: 6 }}>
          {HOUSE_QUIET_FOR.map((k) => (
            <button key={k} disabled={busy} style={{ minHeight: 44 }} onClick={() => run(() => put<Quiet>('/house/quiet', { for: k }))}>{LABEL[k]}</button>
          ))}
          <button className="plain" disabled={busy} onClick={() => setChoosing(false)}>Cancel</button>
        </div>
      ) : (
        <button onClick={() => setChoosing(true)}>🤫 Quiet the house</button>
      )}
      {error && <div role="alert" className="alert-error" style={{ marginTop: 6 }}>{error}</div>}
    </div>
  );
}
