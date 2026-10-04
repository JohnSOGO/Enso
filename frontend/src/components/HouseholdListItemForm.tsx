// SPEC §8.8 — the list item form modal: the item's photo (§7A.3, PhotoField; saved on Save, after the fields), text,
// note, Assigned to (one member or Nobody), Save / Cancel / Delete. Owns the `Item` shape; HouseholdLists imports
// both from here, never the reverse.
import { useMemo, useState } from 'react';
import { Modal } from './Modal';
import { PhotoField } from './PhotoField';
import { apiUrl, del, errorText, patch, upload } from '../api';
import { useApp } from '../state';
import { NOTE_MAX, TEXT_MAX } from '../../../src/shared/lists';

/** One item as GET /lists/{id} returns it (§10). */
export interface Item {
  id: string; listId: string; text: string; note: string | null; assigneeId: string | null;
  createdBy: string; createdAt: string; checkedAt: string | null; checkedBy: string | null;
  hasPhoto: boolean; updatedAt: string;
}

/** A saved item's photo — `?v=` busts the private cache when the photo or item changes. */
const itemPhotoSrc = (i: Item) => apiUrl(`/list-items/${i.id}/photo?v=${encodeURIComponent(i.updatedAt)}`);

/** Member chips are tap targets (≥ 44 px), as in the chore form. */
const chip = { padding: '4px 10px', minHeight: 44 } as const;

/** Item form (§8.8): text, note, Assigned to, Save / Cancel / Delete. */
export function ItemForm({ item, onClose, onSaved }: { item: Item; onClose: () => void; onSaved: () => void }) {
  const { members } = useApp();
  const init = useMemo(() => ({ text: item.text, note: item.note ?? '', assigneeId: item.assigneeId }), [item]);
  const [f, setF] = useState(init);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** A picked photo not yet saved; `removed` when the saved one is to go. Either is a change. */
  const [pending, setPending] = useState<Blob | null>(null);
  const [removed, setRemoved] = useState(false);
  const dirty = JSON.stringify(f) !== JSON.stringify(init) || !!pending || removed;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await fn(); onSaved(); onClose(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  // assigneeId only when changed: an item assigned to a since-disabled member can still be edited.
  const fields = () => ({ text: f.text, note: f.note, ...(f.assigneeId !== init.assigneeId ? { assigneeId: f.assigneeId } : {}) });
  /** The fields, then the photo: PUT a new one, DELETE a removed one. */
  const save = () => run(async () => {
    await patch(`/list-items/${item.id}`, fields());
    if (!pending && !removed) return;
    try {
      if (pending) await upload('PUT', `/list-items/${item.id}/photo`, pending);
      else await del(`/list-items/${item.id}/photo`);
    } catch (e) {
      onSaved(); // the fields are saved: the list shows them
      throw new Error(`Saved, but the photo didn't save: ${errorText(e)} Tap Save to try the photo again.`);
    }
  });

  return (
    <Modal title={`Edit: ${item.text}`} onClose={onClose} dirty={dirty} error={error}
      footer={<>
        <button className="primary" disabled={busy || !f.text.trim()} onClick={save}>Save</button>
        <button onClick={onClose} disabled={busy}>Cancel</button>
      </>}>
      <fieldset disabled={busy}>
        <PhotoField savedSrc={item.hasPhoto && !removed ? itemPhotoSrc(item) : null} pending={pending} alt={`Photo of ${item.text}`}
          onPick={(photo) => { setPending(photo); setRemoved(false); }}
          onRemove={() => { setPending(null); setRemoved(item.hasPhoto); }} />
        <label className="field"><span>Text</span>
          <input value={f.text} maxLength={TEXT_MAX} onChange={(e) => setF({ ...f, text: e.target.value })} />
        </label>
        <label className="field"><span>Note</span>
          <textarea rows={4} value={f.note} maxLength={NOTE_MAX} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </label>
        <div className="field" role="radiogroup" aria-label="Assigned to">
          <span className="muted" style={{ fontSize: '.8rem' }}>Assigned to</span>
          <div className="row wrap" style={{ marginTop: 4 }}>
            <label className="chip" style={chip}>
              <input type="radio" name="assignee" checked={f.assigneeId === null} onChange={() => setF({ ...f, assigneeId: null })} /> Nobody
            </label>
            {members.filter((m) => !m.disabledAt || m.id === f.assigneeId).map((m) => (
              <label key={m.id} className="chip" style={{ ...chip, borderColor: m.color }}>
                <input type="radio" name="assignee" checked={f.assigneeId === m.id} onChange={() => setF({ ...f, assigneeId: m.id })} /> {m.displayName}
              </label>
            ))}
          </div>
        </div>
      </fieldset>
      <div className="row wrap" style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 12 }}>
        <button className="danger" disabled={busy} onClick={() => { if (confirm(`Delete “${item.text}”?`)) run(() => del(`/list-items/${item.id}`)); }}>Delete</button>
      </div>
    </Modal>
  );
}
