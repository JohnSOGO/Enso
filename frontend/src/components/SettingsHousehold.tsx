// SPEC §8.6 — Settings → 🏠 Household (admins): household name and time zone → PATCH /settings, then the rooms (§7B.6).
import { useState } from 'react';
import { patch } from '../api';
import { RoomsList } from './Rooms';
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

      <RoomsList />
    </>
  );
}
