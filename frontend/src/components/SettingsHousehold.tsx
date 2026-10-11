// SPEC §8.6 — Settings → 🏠 Household (admins): household name and time zone, days off (§7.3) → PATCH /settings.
import { useEffect, useState } from 'react';
import { get, patch } from '../api';
import { useApp } from '../state';
import { useAction } from './useAction';

export function SettingsHousehold() {
  const { householdName, tz, refresh } = useApp();
  const [name, setName] = useState(householdName);
  const [zone, setZone] = useState(tz);
  const { run, busy, errorEl } = useAction();

  return (
    <>
      {errorEl}
      <div className="row">
        <label className="field" style={{ flex: 1 }}><span>Household name</span><input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field" style={{ flex: 1 }}><span>Time zone</span><input value={zone} onChange={(e) => setZone(e.target.value)} /></label>
      </div>
      <button disabled={busy || (name === householdName && zone === tz)} onClick={() => run(async () => { await patch('/settings', { householdName: name, timezone: zone }); refresh(); })}>Save household</button>

      <DaysOff />
    </>
  );
}

/** Which public holidays this household gets off — they are highlighted yellow on the calendar (SPEC §7.3). */
function DaysOff() {
  const { version, refresh } = useApp();
  const [data, setData] = useState<{ daysOff: string[]; holidays: { key: string; name: string; emoji: string }[] } | null>(null);
  const { run, busy, errorEl } = useAction();
  useEffect(() => { get('/settings').then(setData).catch(() => undefined); }, [version]);
  if (!data) return null;
  const toggle = (key: string, on: boolean) => run(async () => {
    const next = on ? [...data.daysOff, key] : data.daysOff.filter((k) => k !== key);
    setData(await patch('/settings', { daysOff: next }));
    refresh();
  });
  return (
    <>
      <h3 style={{ fontSize: '.9rem', margin: '16px 0 4px' }}>Days off</h3>
      <p className="muted" style={{ fontSize: '.85rem', marginBottom: 8 }}>Public holidays the household gets off. They show light yellow on the calendar.</p>
      {errorEl}
      <div className="row wrap" role="group" aria-label="Days off">
        {data.holidays.map((h) => (
          <label key={h.key} className="chip" style={{ padding: '4px 8px' }}>
            <input type="checkbox" disabled={busy} checked={data.daysOff.includes(h.key)} onChange={(e) => toggle(h.key, e.target.checked)} /> {h.emoji} {h.name}
          </label>
        ))}
      </div>
    </>
  );
}
