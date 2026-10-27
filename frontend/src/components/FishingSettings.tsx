// SPEC §8.6, §7.14 — Settings → 📅 Calendar → 🎣: How far will we go, the evening-before ping, and the spots in reach.
import { useEffect, useState } from 'react';
import { get, patch } from '../api';
import { useApp } from '../state';
import { useAction } from './useAction';
import { FISHING_RANGES, spotsWithin } from '../../../src/shared/fishing-spots';
import type { Place } from '../../../src/shared/sun';

const rangeText = (m: number) => (m < 60 ? `${m} min` : `${m / 60} h`.replace('1.5 h', '1½ h'));

export function FishingSettings() {
  const { me, refresh } = useApp();
  const [home, setHome] = useState<Place | null | undefined>(undefined);
  const { run, busy, errorEl } = useAction();
  useEffect(() => { get<{ place: Place | null }>('/settings').then((s) => setHome(s.place)).catch(() => setHome(null)); }, []);
  const save = (b: Record<string, unknown>) => run(async () => { await patch('/me', b); refresh(); });
  const spots = home ? spotsWithin(home, me.fishingRange) : [];
  return (
    <div className="field">
      <h3 style={{ fontSize: '.9rem', margin: '0 0 4px' }}>🎣 Fishing</h3>
      {errorEl}
      <label className="row" style={{ minHeight: 32 }}>How far will we go:
        <select value={me.fishingRange} disabled={busy} onChange={(e) => save({ fishingRange: Number(e.target.value) })}>
          {FISHING_RANGES.map((m) => <option key={m} value={m}>{rangeText(m)} drive</option>)}
        </select>
      </label>
      <label className="row" style={{ minHeight: 32 }}>
        <input type="checkbox" checked={me.fishingAlert} disabled={busy} onChange={(e) => save({ fishingAlert: e.target.checked })} />
        🔔 Ping me the evening before a great time or a fish event
      </label>
      {home === null && <p className="muted">Set the household's place first: the drive times are measured from it.</p>}
      {home && (
        <details>
          <summary>📍 {spots.length} spot{spots.length === 1 ? '' : 's'} in reach</summary>
          <ul style={{ margin: '4px 0', paddingLeft: 18 }}>
            {spots.map((x) => <li key={x.id}>
              {x.kind === 'ocean' ? '🌊' : '🏞️'} <a href={x.link} target="_blank" rel="noreferrer">{x.name}</a>{' '}
              <span className="muted">· ~{x.minutes} min{x.note ? ` · ${x.note}` : ''}</span>
            </li>)}
          </ul>
        </details>
      )}
    </div>
  );
}
