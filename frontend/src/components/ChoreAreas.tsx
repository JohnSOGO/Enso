// SPEC §8.15 — a chore's What done looks like sheet: Done means, then each area (name, photos, expectations as a
// checklist ticked only while the sheet is open, ⚑ Q165), ✎ / ＋ Add an area opening ChoreAreaForm in place, and
// ✎ Edit chore. Only the chore's creator or an admin sees ✎ and ＋ (§6.3, Q163); the server decides (§7B.6).
import { useCallback, useEffect, useState } from 'react';
import { Modal } from './Modal';
import { Thumb } from './PhotoField';
import { ChoreAreaForm, areaPhotoSrc } from './ChoreAreaForm';
import type { Chore } from './Chores';
import { errorText, get } from '../api';
import { useApp } from '../state';
import { canChange } from '../../../src/shared/roles';
import { AREAS_MAX, type ChoreArea } from '../../../src/shared/chore-areas';
import s from './ChoreAreas.module.css';

export function ChoreAreas({ chore, onEditChore, onClose }: { chore: Chore; onEditChore: () => void; onClose: () => void }) {
  const { me, refresh } = useApp();
  const canEdit = canChange(chore.createdBy, me);
  const [areas, setAreas] = useState<ChoreArea[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ChoreArea | 'new' | null>(null);
  const [dirty, setDirty] = useState(false);
  const [ticked, setTicked] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    get<ChoreArea[]>(`/chores/${chore.id}/areas`).then((a) => { setAreas(a); setError(null); }).catch((e) => setError(errorText(e)));
  }, [chore.id]);
  useEffect(load, [load]);

  const done = () => { setEditing(null); setDirty(false); load(); refresh(); };
  const tick = (key: string) => setTicked((t) => { const n = new Set(t); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  return (
    <Modal title={chore.title} onClose={onClose} dirty={dirty} error={error}
      footer={editing ? undefined : <>
        <button onClick={onEditChore}>✎ Edit chore</button>
        <button onClick={onClose}>Close</button>
      </>}>
      {editing ? (
        <ChoreAreaForm choreId={chore.id} area={editing === 'new' ? null : editing} onDirty={setDirty} onSaved={done}
          onCancel={() => { setEditing(null); setDirty(false); }} />
      ) : (
        <>
          {chore.doneMeans && <p className={s.doneMeans}><span className="muted">Done means:</span> {chore.doneMeans}</p>}
          {areas === null && !error && <p className="muted">Loading…</p>}
          {areas?.length === 0 && (
            <p className="muted">Nothing here yet.{canEdit && ' Add an area — a part of the job, with photos of it done right and what to check.'}</p>
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
      )}
    </Modal>
  );
}
