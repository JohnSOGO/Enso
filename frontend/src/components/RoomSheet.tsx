// SPEC §8.15, §8.6 — a room's What done looks like: RoomSections (each area's name, photos and expectations as a
// checklist ticked only while open, ⚑ Q165; ✎ / ＋ Add an area opening RoomAreaForm in place, for the room's creator
// or an admin, §6.3 Q163) and the room sheet around it (rename, delete). The server decides (§7B.6).
import { useCallback, useEffect, useState } from 'react';
import { Modal } from './Modal';
import { Thumb } from './PhotoField';
import { RoomAreaForm, areaPhotoSrc } from './RoomAreaForm';
import { del, errorText, get, patch } from '../api';
import { useApp } from '../state';
import { canChange } from '../../../src/shared/roles';
import { AREAS_MAX, ROOM_NAME_MAX, type Room, type RoomArea } from '../../../src/shared/rooms';
import s from './RoomSheet.module.css';

export function RoomSections({ room, onDirty }: { room: Room; onDirty: (dirty: boolean) => void }) {
  const { me, refresh } = useApp();
  const canEdit = canChange(room.createdBy, me);
  const [areas, setAreas] = useState<RoomArea[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<RoomArea | 'new' | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    get<RoomArea[]>(`/rooms/${room.id}/areas`).then((a) => { setAreas(a); setError(null); }).catch((e) => setError(errorText(e)));
  }, [room.id]);
  useEffect(load, [load]);

  const done = () => { setEditing(null); onDirty(false); load(); refresh(); };
  const tick = (key: string) => setTicked((t) => { const n = new Set(t); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  if (editing) {
    return <RoomAreaForm roomId={room.id} area={editing === 'new' ? null : editing} onDirty={onDirty} onSaved={done}
      onCancel={() => { setEditing(null); onDirty(false); }} />;
  }
  return (
    <>
      {error && <div role="alert" className="alert-error">{error}</div>}
      {areas === null && !error && <p className="muted">Loading…</p>}
      {areas?.length === 0 && (
        <p className="muted">Nothing here yet.{canEdit && ' Add an area — a part of the room, with photos of it done right and what to check.'}</p>
      )}
      {areas?.map((a) => (
        <section key={a.id} className={s.area} aria-label={a.name}>
          <div className="row">
            <h3 className={s.name}>{a.name}</h3>
            {canEdit && <button className={`plain ${s.edit}`} aria-label={`Edit ${a.name}`} title={`Edit ${a.name}`} onClick={() => setEditing(a)}>✎</button>}
          </div>
          {a.photos.length > 0 && (
            <div className={s.photos}>
              {a.photos.map((id, i) => <Thumb key={id} src={areaPhotoSrc(id)} alt={`${a.name} done right, photo ${i + 1}`} />)}
            </div>
          )}
          {a.expectations.length > 0 && (
            <ul className={s.checks}>
              {a.expectations.map((e, i) => {
                const key = `${a.id}:${i}`;
                return (
                  <li key={key}>
                    <label className={s.check}>
                      <input type="checkbox" checked={ticked.has(key)} onChange={() => tick(key)} /> <span>{e}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}
      {canEdit && areas && areas.length < AREAS_MAX && <button onClick={() => setEditing('new')}>＋ Add an area</button>}
    </>
  );
}

/** A room opened from Settings → 🏠 Household: its areas, and ✎ Rename / Delete room for its creator or an admin. */
export function RoomSheet({ room, onClose }: { room: Room; onClose: () => void }) {
  const { me, refresh } = useApp();
  const canEdit = canChange(room.createdBy, me);
  const [name, setName] = useState(room.name);
  const [renaming, setRenaming] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(fn: () => Promise<unknown>, close: boolean) {
    setBusy(true); setError(null);
    try { await fn(); refresh(); if (close) onClose(); else setRenaming(false); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  const rename = () => act(() => patch(`/rooms/${room.id}`, { name }), false);
  const remove = () => {
    if (confirm(`Delete the room "${room.name}" and its areas and photos? Its chores stay, with no room.`)) act(() => del(`/rooms/${room.id}`), true);
  };

  return (
    <Modal title={name} onClose={onClose} dirty={dirty || (renaming && name !== room.name)} error={error}
      footer={<>
        {canEdit && <button className="danger" disabled={busy} onClick={remove}>Delete room</button>}
        <button onClick={onClose}>Close</button>
      </>}>
      {canEdit && (renaming ? (
        <div className="row" style={{ marginBottom: 10 }}>
          <input value={name} maxLength={ROOM_NAME_MAX} aria-label="Room name" autoFocus onChange={(e) => setName(e.target.value)} />
          <button className="primary" disabled={busy || !name.trim()} onClick={rename}>Save</button>
        </div>
      ) : <button style={{ marginBottom: 10 }} onClick={() => setRenaming(true)}>✎ Rename room</button>)}
      <RoomSections room={room} onDirty={setDirty} />
    </Modal>
  );
}
