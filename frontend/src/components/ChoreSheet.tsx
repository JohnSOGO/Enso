// SPEC §8.15 — a chore's 📋 sheet: Done means, then its room's What done looks like (RoomSections, §7B.6) or a line
// saying it has no room yet, and ✎ Edit chore.
import { useState } from 'react';
import { Modal } from './Modal';
import { RoomSections } from './RoomSheet';
import { useRooms } from './Rooms';
import type { Chore } from './Chores';
import s from './RoomSheet.module.css';

export function ChoreSheet({ chore, onEditChore, onClose }: { chore: Chore; onEditChore: () => void; onClose: () => void }) {
  const { rooms, error } = useRooms();
  const [dirty, setDirty] = useState(false);
  const room = chore.roomId ? rooms?.find((r) => r.id === chore.roomId) : undefined;

  return (
    <Modal title={chore.title} onClose={onClose} dirty={dirty} error={error}
      footer={<>
        <button onClick={onEditChore}>✎ Edit chore</button>
        <button onClick={onClose}>Close</button>
      </>}>
      {chore.doneMeans && <p className={s.doneMeans}><span className="muted">Done means:</span> {chore.doneMeans}</p>}
      {!chore.roomId && <p className="muted">No room yet. Pick one in ✎ Edit chore.</p>}
      {chore.roomId && !rooms && !error && <p className="muted">Loading…</p>}
      {room && (
        <>
          <p className={s.doneMeans}><span className="muted">Room:</span> {room.name}</p>
          <RoomSections room={room} onDirty={setDirty} />
        </>
      )}
    </Modal>
  );
}
