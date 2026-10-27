// SPEC §8.19 — picking a room's devices: a Find box and one checkbox line per device Home Assistant lists
// (GET /house/devices, §9.2e), ticked ones first; one in another room shows "in {room}" and can't be ticked here.
// Save (only once the list is read) sends the ticked ids in the order ticked (PUT /rooms/{id}/devices); the server checks them.
import { useEffect, useMemo, useState } from 'react';
import { errorText, get, put } from '../api';
import { useRooms } from './Rooms';
import { ROOM_DEVICES_MAX, type DeviceChoice } from '../../../src/shared/home-devices';
import type { Room } from '../../../src/shared/rooms';
import type { DeviceDomain } from '../../../src/shared/vocab';

export const DEVICE_EMOJI: Record<DeviceDomain, string> = { climate: '❄️', light: '💡', switch: '🔌', fan: '🌀' };

type Choice = DeviceChoice & { roomId: string | null };

export function HomeDevicePicker({ room, picked, onSaved, onCancel }: { room: Room; picked: string[]; onSaved: () => void; onCancel: () => void }) {
  const { rooms } = useRooms();
  const [choices, setChoices] = useState<Choice[] | null>(null);
  const [ticked, setTicked] = useState<string[]>(picked);
  const [find, setFind] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    get<{ devices: Choice[] }>('/house/devices').then((r) => setChoices(r.devices)).catch((e) => setError(errorText(e)));
  }, []);

  const roomName = (id: string) => rooms?.find((r) => r.id === id)?.name ?? 'another room';
  const shown = useMemo(() => {
    const q = find.trim().toLowerCase();
    const list = (choices ?? []).filter((d) => !q || d.name.toLowerCase().includes(q) || d.id.includes(q));
    return [...list.filter((d) => ticked.includes(d.id)), ...list.filter((d) => !ticked.includes(d.id))];
  }, [choices, find, ticked]);
  const toggle = (id: string) => setTicked((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));
  const save = async () => {
    setBusy(true); setError(null);
    try { await put(`/rooms/${room.id}/devices`, { devices: ticked }); onSaved(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };

  return (
    <>
      <input value={find} placeholder="Find" aria-label="Find a device" onChange={(e) => setFind(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
      {error && <div role="alert" className="alert-error">{error}</div>}
      {choices === null && !error && <p className="muted">Asking the house…</p>}
      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 8px' }}>
        {shown.map((d) => {
          const elsewhere = d.roomId !== null && d.roomId !== room.id;
          const full = !ticked.includes(d.id) && ticked.length >= ROOM_DEVICES_MAX;
          return (
            <li key={d.id}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, opacity: elsewhere ? 0.6 : 1 }}>
                <input type="checkbox" checked={ticked.includes(d.id)} disabled={elsewhere || full} onChange={() => toggle(d.id)} />
                <span>{DEVICE_EMOJI[d.domain]} {d.name} <span className="muted" style={{ fontSize: '.8rem' }}>{elsewhere ? `in ${roomName(d.roomId!)}` : d.id}</span></span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="row">
        <button className="primary" disabled={busy || choices === null} onClick={save}>Save</button>
        <button disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </>
  );
}
