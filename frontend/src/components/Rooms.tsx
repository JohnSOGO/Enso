// SPEC §8.6, §7B.6 — the household's rooms, in Settings → 🏠 Household: RoomsList (one line per room with its number of
// areas, ＋ Add room for admins, ⚑ Q264; a tap opens RoomSheet) and useRooms (GET /rooms, also read by ChoreForm).
import { useEffect, useState } from 'react';
import { RoomSheet } from './RoomSheet';
import { errorText, get, post } from '../api';
import { useApp } from '../state';
import { useAction } from './useAction';
import { ROOMS_MAX, ROOM_NAME_MAX, type Room } from '../../../src/shared/rooms';

/** The rooms, reloaded whenever the app refreshes. */
export function useRooms() {
  const { version } = useApp();
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    get<Room[]>('/rooms').then((r) => { setRooms(r); setError(null); }).catch((e) => setError(errorText(e)));
  }, [version]);
  return { rooms, error };
}

export function RoomsList() {
  const { refresh } = useApp();
  const { rooms, error } = useRooms();
  const [name, setName] = useState('');
  const [open, setOpen] = useState<Room | null>(null);
  const { run, busy, errorEl } = useAction();
  const add = () => run(async () => { await post('/rooms', { name }); setName(''); refresh(); });

  return (
    <>
      <h3 style={{ fontSize: '.9rem', margin: '16px 0 4px' }}>Rooms</h3>
      <p className="muted" style={{ fontSize: '.85rem', marginBottom: 8 }}>Each room holds what done looks like: its areas, photos and what to check. Chores pick their room.</p>
      {error && <div role="alert" className="alert-error">{error}</div>}
      {errorEl}
      {rooms?.length === 0 && <p className="muted">No rooms yet.</p>}
      {!!rooms?.length && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 8px' }}>
          {rooms.map((r) => (
            <li key={r.id}>
              <button className="plain" style={{ minHeight: 44, width: '100%', textAlign: 'left' }} onClick={() => setOpen(r)}>
                {r.name} <span className="muted">· {r.areaCount === 1 ? '1 area' : `${r.areaCount} areas`}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {rooms && rooms.length < ROOMS_MAX && (
        <div className="row">
          <input value={name} maxLength={ROOM_NAME_MAX} placeholder="e.g. Living room" aria-label="New room name" onChange={(e) => setName(e.target.value)} />
          <button disabled={busy || !name.trim()} onClick={add}>＋ Add room</button>
        </div>
      )}
      {open && <RoomSheet room={open} onClose={() => setOpen(null)} />}
    </>
  );
}
