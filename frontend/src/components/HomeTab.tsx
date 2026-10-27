// SPEC §8.19 — the 🏡 Home tab: every room (useRooms, §7B.6) as a PickGrid button; a tap opens HomeRoom, that room's
// Home Assistant devices (§9.2e). Holds only which room is open.
import { useState } from 'react';
import { useRooms } from './Rooms';
import { PickGrid } from './PickGrid';
import { HomeRoom } from './HomeRoom';

export function HomeTab() {
  const { rooms, error } = useRooms();
  const [open, setOpen] = useState<string | null>(null);
  const room = rooms?.find((r) => r.id === open);

  return (
    <div style={{ padding: 12, overflowY: 'auto', height: '100%' }}>
      <h1 style={{ fontSize: '1.15rem', marginBottom: 12 }}>🏡 Home</h1>
      {error && <div role="alert" className="alert-error">{error}</div>}
      {rooms === null && !error && <p className="muted">Loading…</p>}
      {rooms?.length === 0 && <p className="muted">No rooms yet. An admin adds them in Settings → 🏠 Household.</p>}
      {!!rooms?.length && <PickGrid entries={rooms.map((r) => ({ value: r.id, emoji: '🚪', label: r.name }))} onPick={setOpen} />}
      {room && <HomeRoom room={room} onClose={() => setOpen(null)} />}
    </div>
  );
}
